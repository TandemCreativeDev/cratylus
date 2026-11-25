import type { Config } from "./config.ts";

const LIST_PREFIX = String.raw`(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)*`;
const FENCE_OPEN = new RegExp(String.raw`^(?<prefix>[ \t>]*${LIST_PREFIX})(?:(?<tick>\x60{3,})[^\x60]*$|(?<tilde>~{3,}))`);
const LIST_ITEM_IN_PREFIX = /(?:[-*+]|\d{1,9}[.)])[ \t]/;
const LIST_MARKER = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const INDENTED = /^(?: {4}|\t)/;
const PARAGRAPH_END = new RegExp(String.raw`[ \t]*(?:\n|$)|[ \t>]*${LIST_PREFIX}(?:\x60{3,}[^\x60\n]*(?=\n|$)|~{3,})`, "y");
const MASK = "\0";

function lineEnd(text: string, from: number): number {
  const end = text.indexOf("\n", from);
  return end === -1 ? text.length : end;
}

function columns(indent: string): number {
  return indent.replace(/\t/g, "    ").length;
}

/** A closing fence has the opener's prefix, or no list marker and at most three more columns of indent. */
function closesFence(line: string, fence: string, prefix: string): boolean {
  let rest: string;
  if (line.startsWith(prefix) && !/^[ \t>]/.test(line.slice(prefix.length))) rest = line.slice(prefix.length);
  else {
    const indent = /^[ \t>]*/.exec(line)![0];
    if (columns(indent) - columns(prefix) > 3) return false;
    rest = line.slice(indent.length);
  }
  rest = rest.trim();
  return rest.length >= fence.length && rest === fence[0].repeat(rest.length);
}

function closingFenceEnd(text: string, from: number, fence: string, prefix: string): number {
  for (let start = from; start < text.length; start = lineEnd(text, start) + 1) {
    const end = lineEnd(text, start);
    if (closesFence(text.slice(start, end), fence, prefix)) return end;
  }
  return text.length;
}

/** The index after a run of exactly `length` backticks, or -1 if a blank line or a fence comes first. */
function closingTicksEnd(text: string, from: number, length: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] === "\n") {
      PARAGRAPH_END.lastIndex = i + 1;
      if (PARAGRAPH_END.test(text)) return -1;
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
function maskCode(source: string): string {
  const text = source.replace(/\r\n?/g, "\n");
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
        const { prefix, tick, tilde } = fenceOpen.groups!;
        out.push(MASK);
        i = closingFenceEnd(text, end + 1, tick ?? tilde, prefix);
        canStartCode = true;
        if (LIST_ITEM_IN_PREFIX.test(prefix)) listOpen = true;
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

const ISSUE_PREFIX = String.raw`(?:https?://[^\s/]+/[\w.-]+/[\w.-]+/issues/|[\w.-]+/[\w.-]+#|#)?`;
/** Placed after the keyword, so it is only tried where a keyword matched. */
const NOT_NEGATED = String.raw`(?<!(?:\b(?:not|never|no)|n't)[ \t]+[a-z]+)`;

/**
 * Ticket ids named by a keyword such as `Closes <id>` in the texts, in order, without `#`, an `owner/repo#` prefix
 * or an issue URL, de-duplicated case-insensitively.
 */
export function extractRefs(texts: string[], config: Config): string[] {
  const id = `${ISSUE_PREFIX}(?:${config.ticket})(?![\\w-])`;
  const keyword = `(?:${config.keywords.join("|")})`;
  const separator = "(?:[ \\t]*,[ \\t]*(?:and\\b[ \\t]*)?|[ \\t]+and\\b[ \\t]*)";
  const closes = new RegExp(`(?<![\\w-])${keyword}\\b${NOT_NEGATED}(?:[ \\t]*:)?[ \\t]*(?<list>${id}(?:${separator}${id})*)`, "gi");
  const item = new RegExp(`${ISSUE_PREFIX}(?<id>(?:${config.ticket})(?![\\w-]))`, "gi");

  const found = new Map<string, string>();
  for (const text of texts) {
    for (const match of maskCode(text).matchAll(closes)) {
      for (const ref of match.groups!.list.matchAll(item)) {
        const written = ref.groups!.id;
        if (written === "") continue;
        if (!found.has(written.toLowerCase())) found.set(written.toLowerCase(), written);
      }
    }
  }
  return [...found.values()];
}
