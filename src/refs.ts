import type { Config } from "./config.ts";

const FENCE_OPEN = /^\s*(?:(`{3,})[^`]*$|(~{3,}))/;
const LIST_MARKER = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const INDENTED = /^(?: {4}|\t)/;
const BLANK_LINE = /[ \t]*(?:\n|$)/y;
const MASK = "\0";

function lineEnd(text: string, from: number): number {
  const end = text.indexOf("\n", from);
  return end === -1 ? text.length : end;
}

function closingFenceEnd(text: string, from: number, fence: string): number {
  for (let start = from; start < text.length; start = lineEnd(text, start) + 1) {
    const end = lineEnd(text, start);
    const line = text.slice(start, end).trim();
    if (line.length >= fence.length && line === fence[0].repeat(line.length)) return end;
  }
  return text.length;
}

/** The index after a run of exactly `length` backticks, or -1 if the paragraph ends first. */
function closingTicksEnd(text: string, from: number, length: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] === "\n") {
      BLANK_LINE.lastIndex = i + 1;
      if (BLANK_LINE.test(text)) return -1;
      i++;
    } else if (text[i] === "`") {
      let end = i;
      while (text[end] === "`") end++;
      if (end - i === length) return end;
      i = end;
    } else i++;
  }
  return -1;
}

/**
 * Replaces fenced blocks, indented blocks, inline code spans and HTML comments with a placeholder.
 * It scans once from left to right, so whichever construct opens first wins.
 */
function maskCode(text: string): string {
  const out: string[] = [];
  let i = 0;
  let atLineStart = true;
  let onlyBlankSoFar = true;
  let listOpen = false;
  let canStartCode = true;
  let noMoreCommentEnds = false;

  while (i < text.length) {
    if (atLineStart) {
      atLineStart = false;
      onlyBlankSoFar = true;
      const end = lineEnd(text, i);
      const line = text.slice(i, end);
      if (line.trim() === "") {
        canStartCode = true;
        out.push(line);
        i = end;
        continue;
      }
      if (canStartCode && !listOpen && INDENTED.test(line)) {
        out.push(MASK);
        i = end;
        continue;
      }
      const fenceOpen = FENCE_OPEN.exec(line);
      if (fenceOpen) {
        out.push(MASK);
        i = closingFenceEnd(text, end + 1, fenceOpen[1] ?? fenceOpen[2]);
        canStartCode = true;
        continue;
      }
      if (LIST_MARKER.test(line)) listOpen = true;
      else if (!/^\s/.test(line)) listOpen = false;
      canStartCode = false;
    }

    const char = text[i];
    if (char === "\n") {
      out.push(char);
      i++;
      atLineStart = true;
    } else if (char === "`") {
      let runEnd = i;
      while (text[runEnd] === "`") runEnd++;
      const close = closingTicksEnd(text, runEnd, runEnd - i);
      out.push(close === -1 ? text.slice(i, runEnd) : MASK);
      i = close === -1 ? runEnd : close;
      onlyBlankSoFar = false;
    } else if (text.startsWith("<!--", i)) {
      const close: number = noMoreCommentEnds ? -1 : text.indexOf("-->", i + 4);
      noMoreCommentEnds = close === -1;
      if (close === -1 && onlyBlankSoFar) {
        out.push(MASK);
        i = text.length;
      } else {
        out.push(close === -1 ? "<!--" : MASK);
        i = close === -1 ? i + 4 : close + 3;
      }
      onlyBlankSoFar = false;
    } else {
      if (char !== " " && char !== "\t") onlyBlankSoFar = false;
      out.push(char);
      i++;
    }
  }
  return out.join("");
}

/** Ticket ids named by `Closes <id>` in the texts, in order, without `#`, de-duplicated case-insensitively. */
export function extractRefs(texts: string[], config: Config): string[] {
  const id = `#?(?:${config.ticket})(?!\\w)`;
  const separator = "(?:[ \\t]*,[ \\t]*(?:and\\b[ \\t]*)?|[ \\t]+and\\b[ \\t]*)";
  const closes = new RegExp(`(?<![\\w-])closes\\b(?:[ \\t]*:)?[ \\t]*(?<list>${id}(?:${separator}${id})*)`, "gi");
  const item = new RegExp(`#?(?<id>(?:${config.ticket})(?!\\w))`, "gi");

  const found = new Map<string, string>();
  for (const text of texts) {
    for (const match of maskCode(text).matchAll(closes)) {
      for (const ref of match.groups!.list.matchAll(item)) {
        const written = ref.groups!.id;
        if (!found.has(written.toLowerCase())) found.set(written.toLowerCase(), written);
      }
    }
  }
  return [...found.values()];
}
