# GitHub Copilot SDK — Technical Deep-Dive

## Executive Summary

The [github/copilot-sdk](https://github.com/github/copilot-sdk) is a multi-language SDK (TypeScript, Python, Go, .NET) that exposes GitHub Copilot's agentic runtime as a programmable API[^1]. Currently in **Technical Preview** (created January 2026), it has ~7,800 stars and 976 forks[^2]. The SDK communicates with the Copilot CLI process running in server mode via JSON-RPC, enabling applications to embed Copilot's planning, tool invocation, file editing, and LLM orchestration capabilities without building custom agent infrastructure[^1]. The latest protocol version is **v3**, which added multi-client tool and permission broadcasts[^3][^4].

## Architecture Overview

```
┌──────────────────────────────────┐
│       Your Application           │
│  (TypeScript/Python/Go/.NET)     │
└──────────────┬───────────────────┘
               │
     SDK Client (CopilotClient)
         │  Manages lifecycle
         │  Spawns or connects to CLI
         ▼
┌──────────────────────────────────┐
│     JSON-RPC Transport           │
│  (stdio pipe or TCP socket)      │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│   Copilot CLI (Server Mode)      │
│  ┌────────────────────────────┐  │
│  │  Agent Runtime             │  │
│  │  - LLM Orchestration       │  │
│  │  - Tool Invocation          │  │
│  │  - File Edits               │  │
│  │  - Permission System        │  │
│  │  - MCP Server Support       │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  Session Manager           │  │
│  │  - Multi-session support    │  │
│  │  - Session persistence      │  │
│  │  - Idle timeout (35m)       │  │
│  └────────────────────────────┘  │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│   GitHub Copilot API / LLM       │
│   (or BYOK: OpenAI, Azure,      │
│    Anthropic endpoints)          │
└──────────────────────────────────┘
```

The SDK does **not** bundle the Copilot CLI — it must be installed separately[^1]. The client manages the CLI process lifecycle automatically (spawning as a subprocess on start, killing on dispose), or can connect to an externally running CLI server over TCP for backend deployments[^5].

### Protocol

All SDKs share a unified JSON-RPC 2.0 protocol at version 3[^4]. The protocol version is maintained in a single source-of-truth file `sdk-protocol-version.json` and synchronized to each language's implementation[^4]. Key RPC methods include:

| Method | Purpose |
|--------|---------|
| `session.create` | Create a new agent session |
| `session.send` | Send a prompt to the agent |
| `session.abort` | Abort an active session |
| `session.resume` | Resume a persisted session |
| `model.switchTo` | Change the active LLM model mid-session |
| `plan.read/update/delete` | Manage agent plans |

Protocol v3 introduced **session-level event broadcasting** — `external_tool.requested` and `permission.requested` are broadcast to all connected clients, enabling multi-client architectures[^3].

## SDK Language Implementations

### Core Module Structure

Each SDK follows the same architectural pattern with these core modules:

| Module | TypeScript | Python | Go | .NET |
|--------|-----------|--------|-----|------|
| Client | `client.ts` (60KB) | `client.py` (64KB) | `client.go` (48KB) | `Client.cs` (70KB) |
| Session | `session.ts` (28KB) | `session.py` (29KB) | `session.go` (26KB) | `Session.cs` (36KB) |
| Types | `types.ts` (32KB) | `types.py` (38KB) | `types.go` (39KB) | `Types.cs` (70KB) |
| Tool Definition | `types.ts` (defineTool) | `tools.py` (7KB) | `definetool.go` (4KB) | AIFunctionFactory |
| Telemetry | `telemetry.ts` (1KB) | `telemetry.py` (1KB) | `telemetry.go` (1KB) | `Telemetry.cs` (2KB) |
| Generated Code | `generated/` | `generated/` | `generated_*.go` | `Generated/` |
| JSON-RPC | vscode-jsonrpc dep | `jsonrpc.py` (14KB) | `internal/jsonrpc2/` | StreamJsonRpc dep |

### Node.js / TypeScript SDK

- **Package**: `@github/copilot-sdk` v0.1.8 on npm[^6]
- **Requires**: Node.js ≥20, depends on `@github/copilot` (CLI), `vscode-jsonrpc`, `zod`[^6]
- **Build**: esbuild, tested with vitest[^6]
- **Key exports**: `CopilotClient`, `CopilotSession`, `defineTool`, `approveAll`[^7]
- **Extension mode**: Special `joinSession()` export for child processes of Copilot CLI (reads `SESSION_ID` env var)[^8]

### Python SDK

- **Package**: `github-copilot-sdk` v0.1.0 on PyPI[^9]
- **Requires**: Python ≥3.11, depends on `pydantic`, `python-dateutil`[^9]
- **Optional**: `opentelemetry-api` for telemetry[^9]
- **Tool definition**: Decorator-based `@define_tool` with Pydantic model JSON schema auto-generation[^10]
- **Async-first**: All session operations are async/await[^11]
- **Custom JSON-RPC**: Built-in `jsonrpc.py` implementation (no external dependency)[^12]

### Go SDK

- **Module**: `github.com/github/copilot-sdk/go`[^13]
- **Requires**: Go 1.24+[^13]
- **Dependencies**: `google/jsonschema-go` (tool schema gen), `klauspost/compress`, `google/uuid`, OpenTelemetry[^13]
- **Tool definition**: Generic `DefineTool[T, U]()` with automatic JSON schema from struct reflection[^14]
- **Internal packages**: `jsonrpc2/` (custom JSON-RPC), `embeddedcli/` (CLI embedding), `flock/` (file locking), `e2e/` tests[^15]
- **Platform-specific**: Separate `process_windows.go` and `process_other.go` for CLI process management[^16]
- **Permission handler**: `PermissionHandler.ApproveAll` pre-built convenience[^17]
- **Telemetry**: Native OpenTelemetry W3C Trace Context propagation[^18]

### .NET SDK

- **Package**: `GitHub.Copilot.SDK` on NuGet[^1]
- **Project**: `dotnet/src/GitHub.Copilot.SDK.csproj`[^19]
- **Pattern**: Uses `AIFunctionFactory.Create()` for tool definition with `Microsoft.Extensions.AI`[^20]
- **Event handling**: Thread-safe, insertion-ordered event delegate dispatch[^21]
- **Typed permissions**: `PermissionRequestResultKind` enum (Approved, DeniedByRules, DeniedInteractivelyByUser, DeniedCouldNotRequestFromUser)[^22]

## Key Features

### Custom Tools

All SDKs support defining custom tools that the agent can invoke. The pattern is consistent across languages:

1. Define a typed parameter model (Pydantic/struct/class)
2. Implement a handler function
3. Register tools at session creation

**TypeScript example:**
```typescript
const tool = defineTool("get_weather", {
  handler: async (params) => `Weather in ${params.city}: 72°F`,
});
const session = await client.createSession({ tools: [tool] });
```

**Go example** (generic with auto-schema)[^14]:
```go
type WeatherParams struct {
    City string `json:"city" jsonschema:"city name"`
}
tool := copilot.DefineTool("get_weather", "Get weather",
    func(p WeatherParams, inv copilot.ToolInvocation) (any, error) {
        return fmt.Sprintf("Weather in %s: 72°F", p.City), nil
    })
```

Tools can also **override built-in tools** (like `grep`, `edit_file`) by setting `overridesBuiltInTool: true`[^23].

### Permission System

The SDK exposes the CLI's permission system, requiring applications to handle permission requests for sensitive operations (shell commands, file writes, etc.). Pre-built handlers like `approveAll` exist for convenience, with typed result kinds across all languages[^17][^22].

### Authentication Methods

| Method | Copilot Sub Required | Use Case |
|--------|---------------------|----------|
| GitHub Signed-in User | Yes | Interactive desktop apps |
| OAuth GitHub App (`gho_`/`ghu_`) | Yes | Web/SaaS apps |
| Environment Variables (`COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`) | Yes | CI/CD, automation |
| BYOK (Bring Your Own Key) | **No** | Azure AI Foundry, OpenAI, Anthropic[^24] |

Priority order: Explicit token → HMAC key → Direct API token → Env vars → Stored OAuth → `gh` CLI[^24].

### Deployment Patterns

| Pattern | Description |
|---------|------------|
| **Local CLI** | SDK spawns CLI as subprocess (simplest)[^5] |
| **Bundled CLI** | Ship CLI binary with your application[^5] |
| **Backend Services** | Headless CLI over TCP for server-side[^5] |
| **GitHub OAuth** | Full OAuth flow for multi-user apps[^5] |
| **Azure Managed Identity** | BYOK with Azure AI Foundry[^5] |
| **Scaling & Multi-Tenancy** | Horizontal scaling, tenant isolation patterns[^5] |

### Session Features

- **Streaming events**: Real-time event reference for tool calls, permissions, assistant messages[^25]
- **Hooks**: Pre-tool use, post-tool use, user prompt submitted, session lifecycle, error handling[^25]
- **Custom agents**: Define specialized sub-agents[^25]
- **MCP servers**: Integrate Model Context Protocol servers[^25]
- **Skills**: Load reusable prompt modules[^25]
- **Image input**: Send images as attachments[^25]
- **Steering & queueing**: Message delivery modes[^25]
- **Session persistence**: Resume sessions across restarts[^25]
- **Model switching**: Change LLM model mid-session via `session.setModel()`[^23]
- **OpenTelemetry**: Built-in TelemetryConfig with trace context propagation[^26]

### Multi-Client Architecture (Protocol v3)

Protocol v3 enables multiple SDK clients to connect to the same CLI session[^3]:
- Different clients contribute different tools
- Permission prompts broadcast to all clients
- If one client approves a permission, all clients see the result
- Backward-compatible: v3 SDK apps work with v2 CLI servers automatically[^27]

## Code Generation

The SDK uses **code generation** extensively to keep types and RPC methods synchronized across all four languages. Each SDK has a `generated/` directory:
- **Node.js**: `nodejs/src/generated/`[^28]
- **Python**: `python/copilot/generated/`[^29]
- **Go**: `go/generated_session_events.go` (61KB), `go/rpc/generated_rpc.go` (26KB)[^30]
- **.NET**: `dotnet/src/Generated/`[^19]

The generation tooling lives in `scripts/codegen/` and is invoked via `npm run generate` from the Node.js SDK[^6].

## Testing Strategy

- **Unit tests**: Per-language unit tests (`vitest` for TS, `pytest` for Python, `go test` for Go, `dotnet test` for .NET)[^31]
- **End-to-end tests**: Shared Node.js test harness in `test/harness/`[^32]
- **Scenario tests**: Multi-language scenarios in `test/scenarios/` covering auth, bundling, callbacks, modes, prompts, sessions, tools, and transport[^33]
- **Documentation validation**: Scripts extract and validate code examples from docs (`scripts/docs-validation/`)[^31]
- **CI**: SDK Consistency Review Agent (agentic workflow) for cross-language parity checks[^34]

## Community SDKs

Unofficial, community-maintained SDKs exist for languages not officially supported[^1]:

| Language | Repository |
|----------|-----------|
| Java | [copilot-community-sdk/copilot-sdk-java](https://github.com/copilot-community-sdk/copilot-sdk-java) |
| Rust | [copilot-community-sdk/copilot-sdk-rust](https://github.com/copilot-community-sdk/copilot-sdk-rust) |
| Clojure | [copilot-community-sdk/copilot-sdk-clojure](https://github.com/copilot-community-sdk/copilot-sdk-clojure) |
| C++ | [0xeb/copilot-sdk-cpp](https://github.com/0xeb/copilot-sdk-cpp) |

## Active Development & Open Issues

The SDK is under very active development (most recent commit: March 13, 2026[^35]). Notable open issues include:

- **Structured output support** (#857) — enforcing JSON schema responses from models[^36]
- **35-minute session timeout** (#824) — CLI cleanup kills active long-running sessions[^37]
- **Untested Python APIs** (#815, #809) — several public APIs lack e2e tests[^38]
- **Plan session events** (#801) — request for events when plans change[^39]
- **Code review feature** (#800) — `/review` command not yet exposed via SDK[^40]
- **Dual auth (subscription + local models)** (#807) — using both modes simultaneously[^41]

The project has **127 open issues** and **146 total open issues+PRs**[^2].

## Key Repositories Summary

| Repository | Purpose | Key Files |
|-----------|---------|-----------|
| [github/copilot-sdk](https://github.com/github/copilot-sdk) | Main mono-repo with all 4 SDK implementations | `nodejs/src/`, `python/copilot/`, `go/`, `dotnet/src/` |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | Cookbooks, instructions, collections for all SDKs | `cookbook/copilot-sdk/`, `instructions/` |
| [copilot-community-sdk/*](https://github.com/copilot-community-sdk) | Community SDKs for Java, Rust, Clojure | Various |

## Confidence Assessment

- **High confidence**: Architecture (JSON-RPC over CLI), module structure, authentication methods, feature set, protocol version — all verified from source code and docs.
- **High confidence**: API surface, tool definition patterns, deployment options — verified from source and README.
- **Medium confidence**: Some internal implementation details (e.g., exact CLI server mode protocol handshake) — inferred from code structure and docs rather than reading the full 60-70KB client files.
- **Note**: The SDK is in Technical Preview — APIs may change before GA.

## Footnotes

[^1]: `README.md` in [github/copilot-sdk](https://github.com/github/copilot-sdk)
[^2]: GitHub repository metadata — 7,810 stars, 976 forks, 146 open issues as of March 14, 2026
[^3]: `CHANGELOG.md` — v0.1.31 "multi-client tool and permission broadcasts (protocol v3)"
[^4]: `sdk-protocol-version.json` — `{"version": 3}`
[^5]: `docs/setup/index.md` — deployment patterns: local-cli, bundled-cli, backend-services, github-oauth, azure-managed-identity, scaling
[^6]: `nodejs/package.json` — `@github/copilot-sdk` v0.1.8, dependencies on `@github/copilot`, `vscode-jsonrpc`, `zod`
[^7]: `nodejs/src/index.ts` — exports `CopilotClient`, `CopilotSession`, `defineTool`, `approveAll`
[^8]: `nodejs/src/extension.ts` — `joinSession()` for child processes, reads `SESSION_ID` env var
[^9]: `python/pyproject.toml` — `github-copilot-sdk` v0.1.0, requires Python ≥3.11, pydantic, python-dateutil
[^10]: `python/copilot/tools.py` — `define_tool` decorator with Pydantic model JSON schema generation
[^11]: `python/copilot/__init__.py` — async-first API surface
[^12]: `python/copilot/jsonrpc.py` — custom JSON-RPC implementation (14KB)
[^13]: `go/go.mod` — module `github.com/github/copilot-sdk/go`, Go 1.24
[^14]: `go/definetool.go` — generic `DefineTool[T, U]` with `google/jsonschema-go` reflection
[^15]: `go/internal/` — `jsonrpc2/`, `embeddedcli/`, `flock/`, `e2e/`
[^16]: `go/process_windows.go`, `go/process_other.go` — platform-specific CLI process management
[^17]: `go/permissions.go` — `PermissionHandler.ApproveAll` pre-built handler
[^18]: `go/telemetry.go` — OpenTelemetry W3C Trace Context via `otel.GetTextMapPropagator()`
[^19]: `dotnet/src/` — `GitHub.Copilot.SDK.csproj`, `Client.cs`, `Session.cs`, `Types.cs`, `Generated/`
[^20]: `CHANGELOG.md` — v0.1.30 tool override example shows `AIFunctionFactory.Create()`
[^21]: `CHANGELOG.md` — v0.1.30 "use event delegate for thread-safe, insertion-ordered event handler dispatch"
[^22]: `CHANGELOG.md` — v0.1.31 `PermissionRequestResultKind` typed constants for .NET and Go
[^23]: `CHANGELOG.md` — v0.1.30 tool overrides, v0.1.30 `session.setModel()` convenience
[^24]: `docs/auth/index.md` — authentication methods, priority order, BYOK details
[^25]: `docs/index.md` — documentation map listing all feature guides
[^26]: `docs/observability/opentelemetry.md` referenced in docs index
[^27]: `CHANGELOG.md` — v0.1.32 "backward compatibility with v2 CLI servers"
[^28]: `nodejs/src/generated/` directory
[^29]: `python/copilot/generated/` directory
[^30]: `go/generated_session_events.go` (61KB), `go/rpc/generated_rpc.go` (26KB)
[^31]: `justfile` — test/lint/format commands for all languages, docs validation scripts
[^32]: `test/harness/` — shared Node.js test harness
[^33]: `test/scenarios/` — auth, bundling, callbacks, modes, prompts, sessions, tools, transport
[^34]: Issue #828 — SDK Consistency Review Agent (agentic workflow)
[^35]: Commit `ea90f07` — "Add reasoningEffort to setModel" (2026-03-13)
[^36]: Issue #857 — "Force structured output"
[^37]: Issue #824 — "The Copilot CLI will hang after 35 minutes"
[^38]: Issues #815, #809 — untested Python APIs
[^39]: Issue #801 — "Plan session events"
[^40]: Issue #800 — "Add code review feature support"
[^41]: Issue #807 — "Does Copilot SDK support both subscription and local models together?"
