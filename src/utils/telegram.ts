const TELEGRAM_MAX_LENGTH = 4096;

// Characters that must be escaped in Telegram MarkdownV2
const MARKDOWN_V2_SPECIAL = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

export function escapeMarkdownV2(text: string): string {
  return text.replace(MARKDOWN_V2_SPECIAL, "\\$1");
}

/**
 * Convert basic markdown (from Copilot) to Telegram MarkdownV2.
 * Handles code blocks, inline code, bold, italic.
 * Falls back to plain text if conversion is unreliable.
 */
export function toTelegramMarkdown(text: string): {
  text: string;
  parseMode: "MarkdownV2" | undefined;
} {
  try {
    let result = text;

    // Preserve code blocks — extract, escape surrounding text, re-insert
    const codeBlocks: string[] = [];
    result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`\`\`\`${lang}\n${code}\`\`\``);
      return `__CODEBLOCK_${idx}__`;
    });

    const inlineCodes: string[] = [];
    result = result.replace(/`([^`]+)`/g, (_, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(`\`${code}\``);
      return `__INLINE_${idx}__`;
    });

    // Escape remaining special chars
    result = escapeMarkdownV2(result);

    // Restore code blocks and inline code
    for (let i = 0; i < codeBlocks.length; i++) {
      result = result.replace(`__CODEBLOCK\\_${i}__`, codeBlocks[i]);
    }
    for (let i = 0; i < inlineCodes.length; i++) {
      result = result.replace(`__INLINE\\_${i}__`, inlineCodes[i]);
    }

    return { text: result, parseMode: "MarkdownV2" };
  } catch {
    return { text, parseMode: undefined };
  }
}

/**
 * Split a long message into chunks that fit Telegram's 4096-char limit.
 * Tries to split on newlines, then on spaces, then hard-cuts.
 */
export function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    let splitIdx = remaining.lastIndexOf("\n", TELEGRAM_MAX_LENGTH);
    if (splitIdx < TELEGRAM_MAX_LENGTH * 0.3) {
      splitIdx = remaining.lastIndexOf(" ", TELEGRAM_MAX_LENGTH);
    }
    if (splitIdx < TELEGRAM_MAX_LENGTH * 0.3) {
      splitIdx = TELEGRAM_MAX_LENGTH;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}
