import type { Config } from "./config.ts";

const FENCE_OPEN = /^\s*(?:(`{3,})[^`]*$|(~{3,}))/;
const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const INLINE_CODE = /(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/g;

function maskFencedBlocks(lines: string[]): string[] {
  let fence: string | undefined;
  return lines.map((line) => {
    if (fence === undefined) {
      const open = FENCE_OPEN.exec(line);
      fence = open?.[1] ?? open?.[2];
      return fence === undefined ? line : "";
    }
    const trimmed = line.trim();
    if (trimmed.length >= fence.length && trimmed === fence[0].repeat(trimmed.length)) fence = undefined;
    return "";
  });
}

function maskIndentedBlocks(lines: string[]): string[] {
  let canStartCode = true;
  return lines.map((line) => {
    if (line.trim() === "") {
      canStartCode = true;
      return line;
    }
    if (canStartCode && /^( {4}|\t)/.test(line)) return "";
    canStartCode = false;
    return line;
  });
}

function stripCode(text: string): string {
  const unfenced = maskFencedBlocks(text.split("\n")).join("\n");
  const uncommented = unfenced.replace(HTML_COMMENT, (comment) => comment.replace(/[^\n]/g, ""));
  const unindented = maskIndentedBlocks(uncommented.split("\n")).join("\n");
  return unindented.replace(INLINE_CODE, " ");
}

/** Ticket ids named by `Closes <id>` in the texts, in order, without `#`, de-duplicated case-insensitively. */
export function extractRefs(texts: string[], config: Config): string[] {
  const id = `#?(?:${config.ticket})(?!\\w)`;
  const separator = "(?:[ \\t]*,[ \\t]*(?:and\\b[ \\t]*)?|[ \\t]+and\\b[ \\t]*)";
  const closes = new RegExp(`\\bcloses\\b[ \\t]*:?[ \\t]*(?<list>${id}(?:${separator}${id})*)`, "gi");
  const item = new RegExp(`#?(?<id>(?:${config.ticket})(?!\\w))`, "gi");

  const found = new Map<string, string>();
  for (const text of texts) {
    for (const match of stripCode(text).matchAll(closes)) {
      for (const ref of match.groups!.list.matchAll(item)) {
        const written = ref.groups!.id;
        if (!found.has(written.toLowerCase())) found.set(written.toLowerCase(), written);
      }
    }
  }
  return [...found.values()];
}
