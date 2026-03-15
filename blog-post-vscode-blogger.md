# From AI Session to Blog Post in 60 Seconds — Automate Your Learning Journal

## You Just Had an Amazing AI Session. Now What?

We've all been there. You just spent an hour with Copilot, Claude, or ChatGPT — and something clicked. You solved a tricky bug, discovered a new pattern, or built something cool from scratch. Your brain is buzzing with insights.

Then you think: *"I should write this down before I forget."*

But here's what usually happens:

- You tell yourself you'll write it up later
- Later never comes
- The insight is gone

Or worse — you do try to write it up, but the process kills your momentum:

1. Open Blogger
2. Write in Blogger's clunky editor (no syntax highlighting, no Markdown)
3. Fight with HTML formatting for code blocks
4. Give up halfway

**What if you could capture your learnings right where the session happened — in your editor — and publish with a single command?**

## The Setup: Write Markdown, Publish to Blogger from VS Code

I wanted a dead-simple workflow:

```
Write .md file  →  One command  →  Published on Blogger
```

Here's exactly how I set it up, step by step. It took about 15 minutes, and now every blog post takes seconds to publish.

## Step 1: Install the VS Code Extension

```bash
code --install-extension kissy.vscode-blogger
```

Or search for **"vscode-blogger"** in the Extensions sidebar (`Ctrl+Shift+X`).

## Step 2: Enable Blogger API v3 on Google Cloud

The extension talks to Blogger through Google's official API. You need to turn it on.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. **Create a new project** (or select an existing one)
   - Click the project dropdown at the top → **New Project**
   - Name it anything (e.g., "Blog Publisher") → **Create**
3. Go to **APIs & Services** → **Library**
4. Search for **"Blogger API v3"**
5. Click on it → **Enable**

## Step 3: Set Up OAuth Consent Screen

Google needs to know what's requesting access to your blog.

1. Go to **APIs & Services** → **OAuth consent screen**
2. User type: **External** → **Create**
3. Fill in the basics:
   - **App name**: "Blog Publisher" (anything works)
   - **User support email**: your Gmail
   - **Developer contact email**: your Gmail
4. Click **Save and Continue** through the remaining screens
5. **Important**: Under **Test users**, click **+ Add Users** → add **your own Gmail address** → Save

> While your app is in "Testing" status, only the test users you list can use it. That's totally fine — this is just for you.

## Step 4: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Application type: **Desktop app**
4. Name: "VS Code Blogger" (or anything)
5. Click **Create**
6. Click **Download JSON** on the dialog that appears

You'll get a file like `client_secret_XXXXX.json`. Keep this safe.

## Step 5: Store the Credentials File

Create a folder and put the file there:

**Windows (PowerShell):**
```powershell
mkdir $env:USERPROFILE\.blogger
copy "$env:USERPROFILE\Downloads\client_secret_*.json" "$env:USERPROFILE\.blogger\client_secret.json"
```

**macOS/Linux:**
```bash
mkdir ~/.blogger
cp ~/Downloads/client_secret_*.json ~/.blogger/client_secret.json
```

You should have:
```
~/.blogger/
└── client_secret.json
```

## Step 6: Configure VS Code

Open your VS Code `settings.json` (`Ctrl+Shift+P` → `Preferences: Open User Settings (JSON)`) and add:

**Windows:**
```json
{
  "vscode-blogger.client-secret-path": "C:\\Users\\YourName\\.blogger",
  "vscode-blogger.credentials-path": "C:\\Users\\YourName\\.blogger"
}
```

**macOS:**
```json
{
  "vscode-blogger.client-secret-path": "/Users/YourName/.blogger",
  "vscode-blogger.credentials-path": "/Users/YourName/.blogger"
}
```

Replace `YourName` with your actual username.

> 🔑 **This tripped me up**: Both settings must point to the **directory**, not the file itself. The extension finds `client_secret.json` inside the folder automatically.

## Step 7: Authorize

1. Reload VS Code: `Ctrl+Shift+P` → `Developer: Reload Window`
2. `Ctrl+Shift+P` → **`Authorize access to blogger`**
3. A browser opens — sign in and grant permission
4. You might see "Google hasn't verified this app" — click **Continue** (it's your own app)

After this, a `googleapis.json` file appears in your `~/.blogger/` folder. You won't need to do this again.

**If no browser opens**: double-check that both settings point to the directory (not the file), then reload VS Code.

## Step 8: Find Your Blog ID

1. Go to your blogger site
2. Click on your blog
3. Check the URL:
   ```
   https://www.blogger.com/blog/posts/1234567890123456789
   ```
4. That long number = your **Blog ID**

## Step 9: Create meta.json

In your project folder (next to your `.md` file), create `meta.json`:

```json
{
    "blogId": "YOUR_BLOG_ID_HERE",
    "isDraft": true,
    "publish": false,
    "revert": false,
    "isPage": false,
    "resource": {
        "title": "Your Post Title Here"
    }
}
```

Set `"isDraft": true` to save as draft first — you can preview before going live.

## Step 10: Publish

1. Open your `.md` file in VS Code
2. `Ctrl+Shift+P` → **`Post a blog to blogger`**
3. Done. Check your Blogger dashboard.

## My Actual Workflow Now

Here's what my end-of-session routine looks like:

1. **Finish the AI session** — Copilot and I just built something or solved a problem
2. **Ask the AI**: *"Write a blog post about what we just did"* — it generates a `.md` file capturing everything: the problem, the approach, what worked, what didn't
3. **Quick edit** — I review it, add my personal take, maybe fix the tone
4. **Update `meta.json`** — change the title
5. **`Ctrl+Shift+P` → Publish** — done in seconds

The whole point is to **capture the learning while it's fresh**, without breaking your flow. No switching to a browser, no fighting with formatting, no excuses to skip it.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No browser opens during auth | Both settings → **directory path**, not file path. Reload VS Code. |
| "Access denied" in browser | Add your Gmail as a test user (Step 3) |
| Token expired | Run `Authorize access to blogger` again |
| Code blocks look wrong | Install [Pandoc](https://pandoc.org/) — the extension uses it automatically for better conversion |

## Why Bother?

Because the best time to capture what you learned is **right after you learned it**. And the biggest barrier to writing isn't the writing — it's the publishing friction.

Remove the friction, and suddenly you have a learning journal that actually gets updated.

Happy writing! ✍️
