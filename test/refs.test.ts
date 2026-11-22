import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULTS, resolveConfig } from "../src/config.ts";
import { extractRefs } from "../src/refs.ts";

const tracker = resolveConfig({ ticket: "t2dv-\\d+" });

describe("extractRefs: references", () => {
  const cases = [
    { text: "Closes #107", config: DEFAULTS, ids: ["107"] },
    { text: "Closes 107", config: DEFAULTS, ids: ["107"] },
    { text: "closes: T2DV-74, T2DV-75 and T2DV-76", config: tracker, ids: ["T2DV-74", "T2DV-75", "T2DV-76"] },
    { text: "CLOSES t2dv-74", config: tracker, ids: ["t2dv-74"] },
    { text: "Closes #1, #2, and #3", config: DEFAULTS, ids: ["1", "2", "3"] },
    { text: "Closes #1 and #2.", config: DEFAULTS, ids: ["1", "2"] },
    { text: "Closes #1\nCloses #2", config: DEFAULTS, ids: ["1", "2"] },
    { text: "Closes #107 and #107, then closes #107 again", config: DEFAULTS, ids: ["107"] },
    { text: "Closes T2DV-74\nCloses t2dv-74", config: tracker, ids: ["T2DV-74"] },
    { text: "Tidy up. Closes #107", config: DEFAULTS, ids: ["107"] },
  ];
  for (const { text, config, ids } of cases) it(JSON.stringify(text), () => assert.deepEqual(extractRefs([text], config), ids));
});

describe("extractRefs: not references", () => {
  const cases = [
    { why: "id runs into letters", text: "Closes 107abc", config: DEFAULTS },
    { why: "id runs into more digits of another word", text: "Closes 107_x", config: DEFAULTS },
    { why: "fixes keyword", text: "Fixes #107", config: DEFAULTS },
    { why: "resolves keyword", text: "Resolves #107", config: DEFAULTS },
    { why: "bare id", text: "See #107 and T2DV-74", config: tracker },
    { why: "closed is not closes", text: "Closed #107", config: DEFAULTS },
    { why: "closes as part of a longer word", text: "Discloses 107", config: DEFAULTS },
    { why: "id on the next line", text: "Closes\n107", config: DEFAULTS },
    { why: "id in backticks", text: "Write `Closes #107` to link a ticket", config: DEFAULTS },
    { why: "id in double backticks", text: "Write ``Closes #107`` to link", config: DEFAULTS },
    { why: "id in a fenced block", text: "Example:\n```md\nCloses #107\n```\n", config: DEFAULTS },
    { why: "id in a tilde fence", text: "~~~\nCloses #107\n~~~", config: DEFAULTS },
    { why: "id in a long fence holding a short one", text: "````\n```\nCloses #107\n```\n````", config: DEFAULTS },
    { why: "id in an unclosed fence", text: "```\nCloses #107", config: DEFAULTS },
    { why: "id in an indented block", text: "Example:\n\n    Closes #107\n", config: DEFAULTS },
    { why: "id in a tab-indented block", text: "Example:\n\n\tCloses #107\n", config: DEFAULTS },
    { why: "id in an HTML comment", text: "<!-- Closes #107 -->", config: DEFAULTS },
    { why: "id in a multi-line HTML comment", text: "<!--\nAdd a line such as\nCloses #107\n-->", config: DEFAULTS },
    { why: "id in an unclosed HTML comment that starts a line", text: "<!-- Closes #107", config: DEFAULTS },
    { why: "empty text", text: "", config: DEFAULTS },
  ];
  for (const { why, text, config } of cases) it(why, () => assert.deepEqual(extractRefs([text], config), []));
});

describe("extractRefs: code and comments do not hide real references", () => {
  const cases = [
    { why: "after a fenced block", text: "```\nCloses #1\n```\nCloses #2", ids: ["2"] },
    { why: "after a code span", text: "`Closes #1` and Closes #2", ids: ["2"] },
    { why: "an unmatched backtick is literal", text: "it`s done. Closes #2", ids: ["2"] },
    { why: "after an HTML comment", text: "<!-- Closes #1 -->\nCloses #2", ids: ["2"] },
    { why: "an indented line inside a paragraph is not a code block", text: "Details\n    Closes #2", ids: ["2"] },
    { why: "a code span does not cross a blank line", text: "a ` b\n\nCloses #2 ` c", ids: ["2"] },
    { why: "an unclosed comment is literal mid-line", text: "a <!-- b\nCloses #2", ids: ["2"] },
    { why: "a fence line with backticks in its info is a code span, not a fence", text: "```x``` then\nCloses #2", ids: ["2"] },
  ];
  for (const { why, text, ids } of cases) it(why, () => assert.deepEqual(extractRefs([text], DEFAULTS), ids));
});

describe("extractRefs: one construct inside another does not swallow the text", () => {
  const cases = [
    { why: "an opening comment marker in a code span", text: "Use `<!--` to open a comment.\n\nCloses #107\n", ids: ["107"] },
    { why: "a fence inside a comment", text: "<!--\nPaste logs after the line below:\n```\n-->\n\nCloses #107\n", ids: ["107"] },
    { why: "an unclosed comment inside an indented block", text: "Example:\n\n    <!-- hidden\n\nCloses #107", ids: ["107"] },
    { why: "an unclosed comment in the middle of a line", text: "x <!-- unclosed\n\nCloses #1", ids: ["1"] },
    { why: "a comment inside a fence", text: "```html\n<!--\n```\nCloses #107", ids: ["107"] },
    { why: "a backtick inside a comment", text: "<!-- it`s -->\nCloses #1 and `Closes #2`", ids: ["1"] },
  ];
  for (const { why, text, ids } of cases) it(why, () => assert.deepEqual(extractRefs([text], DEFAULTS), ids));

  it("hides everything after an unclosed comment that starts a line", () => {
    assert.deepEqual(extractRefs(["<!-- unclosed\n\nCloses #1"], DEFAULTS), []);
  });
});

describe("extractRefs: list items", () => {
  const cases = [
    { why: "an ordered item's continuation paragraph", text: "Steps:\n\n1. Rounds half up.\n\n    Closes #107\n" },
    { why: "a bullet item's continuation paragraph", text: "- item\n\n    Closes #107" },
    { why: "a nested item", text: "- a\n\n    - Closes #107" },
    { why: "a tab-indented continuation", text: "* item\n\n\tCloses #107" },
  ];
  for (const { why, text } of cases) it(`links ${why}`, () => assert.deepEqual(extractRefs([text], DEFAULTS), ["107"]));

  it("still ignores an indented block after the list has ended", () => {
    assert.deepEqual(extractRefs(["- item\n\nPlain paragraph.\n\n    Closes #107\n"], DEFAULTS), []);
  });

  it("still ignores an indented block with no list", () => {
    assert.deepEqual(extractRefs(["Text\n\n    Closes #107\n"], DEFAULTS), []);
  });
});

describe("extractRefs: the keyword", () => {
  it("is not preceded by a hyphen", () => {
    assert.deepEqual(extractRefs(["un-closes 107"], DEFAULTS), []);
    assert.deepEqual(extractRefs(["- closes 107"], DEFAULTS), ["107"]);
  });

  it("stays linear on a long run of spaces", () => {
    const text = `Closes${" ".repeat(40000)}x`;
    const started = performance.now();
    assert.deepEqual(extractRefs([text], DEFAULTS), []);
    assert.ok(performance.now() - started < 100);
  });

  it("stays fast on many backtick runs of distinct lengths", () => {
    const text = Array.from({ length: 330 }, (_, n) => "`".repeat(n + 1)).join(" ");
    const started = performance.now();
    extractRefs([text], DEFAULTS);
    assert.ok(performance.now() - started < 500);
  });
});

describe("extractRefs: an alternation ticket pattern", () => {
  it("matches either alternative in full", () => {
    const config = resolveConfig({ ticket: "t2dv-\\d+|\\d+" });
    assert.deepEqual(extractRefs(["Closes T2DV-74, 107 and #108"], config), ["T2DV-74", "107", "108"]);
  });
});

describe("extractRefs: several texts", () => {
  it("merges in order and de-duplicates across texts", () => {
    assert.deepEqual(extractRefs(["Closes T2DV-74", "Closes t2dv-74, T2DV-75"], tracker), ["T2DV-74", "T2DV-75"]);
  });

  it("does not let an unclosed comment in one text hide the next", () => {
    assert.deepEqual(extractRefs(["<!-- oops", "Closes #5"], DEFAULTS), ["5"]);
  });
});
