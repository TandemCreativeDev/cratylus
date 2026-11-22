import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULTS, resolveConfig } from "../src/config.ts";
import { extractRefs } from "../src/refs.ts";

const tracker = resolveConfig({ ticket: "t2dv-\\d+" });

/** Ten times the input may take about ten times as much CPU time; quadratic behaviour takes about a hundred. */
const MAX_GROWTH = 60;

function cpuMs(): number {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
}

function growth(build: (size: number) => string, size: number): number {
  const fastest = (input: string, runs: number): number => {
    let best = Infinity;
    for (let run = 0; run < runs; run++) {
      const started = cpuMs();
      extractRefs([input], DEFAULTS);
      best = Math.min(best, cpuMs() - started);
    }
    return best;
  };
  return fastest(build(size * 10), 3) / Math.max(fastest(build(size), 5), 1);
}

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

describe("extractRefs: CRLF line endings behave as LF", () => {
  const cases = [
    { why: "a stray backtick does not reach past a blank line", text: "Rename the ` key binding.\n\nCloses #107\n\nRun `pnpm test`.\n", ids: ["107"] },
    { why: "a code span does not cross a blank line", text: "a ` b\n\nCloses #2 ` c", ids: ["2"] },
    { why: "a code span across a line break hides its text", text: "`a\nCloses #1` Closes #2", ids: ["2"] },
    { why: "a backtick fence", text: "Example:\n```md\nCloses #1\n```\nCloses #2", ids: ["2"] },
    { why: "a tilde fence", text: "~~~\nCloses #1\n~~~\nCloses #2", ids: ["2"] },
    { why: "an indented block", text: "Example:\n\n    Closes #1\n\nCloses #2", ids: ["2"] },
    { why: "a closed comment", text: "<!--\nCloses #1\n-->\nCloses #2", ids: ["2"] },
    { why: "an unclosed comment that starts a line", text: "<!-- x\n\nCloses #1", ids: [] },
    { why: "an unclosed comment mid-line", text: "x <!-- y\n\nCloses #1", ids: ["1"] },
    { why: "a list continuation", text: "- item\n\n    Closes #2", ids: ["2"] },
    { why: "a list that has ended", text: "- item\n\nPlain.\n\n    Closes #1\n\nCloses #2", ids: ["2"] },
    { why: "a blockquote fence", text: "> ~~~\n> Closes #1\n> ~~~\n\nCloses #2", ids: ["2"] },
  ];
  for (const { why, text, ids } of cases)
    it(why, () => {
      assert.deepEqual(extractRefs([text], DEFAULTS), ids);
      assert.deepEqual(extractRefs([text.replace(/\n/g, "\r\n")], DEFAULTS), ids);
      assert.deepEqual(extractRefs([text.replace(/\n/g, "\r")], DEFAULTS), ids);
    });
});

describe("extractRefs: fences win over earlier constructs", () => {
  it("a stray backtick above a fence does not swallow the fence", () => {
    assert.deepEqual(extractRefs(["Escape the ` char:\n```sh\necho \\`\n```\n\nCloses #2"], DEFAULTS), ["2"]);
  });

  it("a tilde fence inside a blockquote is ignored", () => {
    assert.deepEqual(extractRefs(["> ~~~\n> Closes 1\n> ~~~\n\nCloses 2"], DEFAULTS), ["2"]);
  });

  it("a backtick fence inside a blockquote is ignored", () => {
    assert.deepEqual(extractRefs(["> ```\n> Closes 1\n> ```\n\nCloses 2"], DEFAULTS), ["2"]);
  });
});

describe("extractRefs: scanner details", () => {
  const cases = [
    { why: "a fence indented three spaces", text: "   ```\nCloses #1\n   ```\nCloses #2", ids: ["2"] },
    { why: "a fence inside a list item", text: "- item\n\n    ```\n    Closes #1\n    ```\n\nCloses #2", ids: ["2"] },
    { why: "a 1) ordered marker opens a list", text: "1) item\n\n    Closes #2", ids: ["2"] },
    { why: "a bullet needs a space to be a marker", text: "-item\n\n    Closes #1", ids: [] },
    { why: "an ordered marker needs a space to be a marker", text: "1.item\n\n    Closes #1", ids: [] },
    { why: "a fence is not closed by the other character", text: "```\nCloses #1\n~~~\nCloses #2\n```\nCloses #3", ids: ["3"] },
    { why: "two tildes are not a fence", text: "~~\nCloses #1\n~~\nCloses #2", ids: ["1", "2"] },
    { why: "two backticks with no closer are not a fence", text: "``\nCloses #1", ids: ["1"] },
    { why: "a marker indented four spaces after a paragraph is not a list", text: "Text\n    - item\n\n    Closes #1", ids: [] },
    { why: "a bare bullet opens a list", text: "-\n\n    Closes #1", ids: ["1"] },
    { why: "a plus bullet opens a list", text: "+ item\n\n    Closes #1", ids: ["1"] },
    { why: "a tilde fence ends a span from a line above", text: "a ` b\n~~~\nx `\n~~~\nCloses #2", ids: ["2"] },
    { why: "and must be a whole word after a space", text: "Closes 1 and2", ids: ["1"] },
    { why: "and must be a whole word after a comma", text: "Closes 1, and2", ids: ["1"] },
    { why: "a closing fence may have surrounding whitespace", text: "```\nCloses #1\n  ```  \nCloses #2", ids: ["2"] },
    { why: "a closing fence must be as long as the opening", text: "````\nCloses #1\n```\nCloses #2\n````\nCloses #3", ids: ["3"] },
    { why: "a longer backtick run does not close a shorter span", text: "`a ``` Closes #1 b` Closes #2", ids: ["2"] },
    { why: "a shorter backtick run does not close a longer span", text: "``a ` Closes #1 b`` Closes #2", ids: ["2"] },
    { why: "an indented block straight after a fence", text: "```\nx\n```\n    Closes #1\n\nCloses #2", ids: ["2"] },
    { why: "an unclosed comment that starts a later line", text: "text\n<!-- unclosed\nCloses #1", ids: [] },
    { why: "an unclosed comment that starts a later indented line", text: "text\n  <!-- unclosed\nCloses #1", ids: [] },
    { why: "an unclosed comment after a code span on the same line", text: "`x` <!-- unclosed\nCloses #1", ids: ["1"] },
    { why: "an unclosed comment after a closed comment on the same line", text: "<!-- a --> <!-- unclosed\nCloses #1", ids: ["1"] },
    { why: "a masked span leaves no keyword and id to join", text: "Closes `x` 107", ids: [] },
    { why: "a masked comment leaves no keyword and id to join", text: "Closes <!-- x --> 107", ids: [] },
    { why: "closes with no separator before the id", text: "closes107", ids: [] },
    { why: "closes with a hash and no space", text: "Closes#107", ids: ["107"] },
    { why: "closes with a colon and no space", text: "Closes:107", ids: ["107"] },
  ];
  for (const { why, text, ids } of cases) it(why, () => assert.deepEqual(extractRefs([text], DEFAULTS), ids));

  it("stops rescanning for comment ends once there are none", () => {
    assert.ok(growth((count) => `a ${"<!-- ".repeat(count)}`, 1000) < MAX_GROWTH);
  });
});

describe("extractRefs: an empty match is never a ticket id", () => {
  for (const ticket of ["\\b", "(?=-)", "\\d*(?=-)", "(?:t2dv-)?\\d*\\b", "\\d*\\b"])
    it(ticket, () => {
      const config = resolveConfig({ ticket });
      assert.deepEqual(extractRefs(["Closes , and reopens the dialog"], config), []);
      assert.deepEqual(extractRefs(["Closes #, and Closes "], config), []);
    });

  it("still finds real ids beside empty matches", () => {
    const config = resolveConfig({ ticket: "(?:t2dv-)?\\d*\\b" });
    assert.deepEqual(extractRefs(["Closes , 107 and t2dv-8"], config), ["107", "t2dv-8"]);
  });
});

describe("extractRefs: fences opened on a list or quote line", () => {
  const cases = [
    { why: "an ordered item with a fenced command", text: "Steps to test:\n\n1. ```sh\n   pnpm test\n   ```\n2. Open the page\n\nCloses #107\n", ids: ["107"] },
    { why: "a bullet with a backtick fence", text: "- ```sh\n  pnpm test\n  ```\n\nCloses #107", ids: ["107"] },
    { why: "a bullet with a tilde fence", text: "- ~~~\n  pnpm test\n  ~~~\n\nCloses #107", ids: ["107"] },
    { why: "a bullet fence that holds a reference", text: "- ```\n  Closes #999\n  ```\n\nCloses #107", ids: ["107"] },
    { why: "a fence in a list inside a quote", text: "> - ```\n>   Closes #999\n>   ```\n\nCloses #107", ids: ["107"] },
    { why: "a fence whose closer repeats the marker", text: "- ```\n  Closes #999\n- ```\nCloses #107", ids: ["107"] },
    { why: "an ordered item with a two-digit number and a paren", text: "10) ```\n    Closes #999\n    ```\n\nCloses #107", ids: ["107"] },
  ];
  for (const { why, text, ids } of cases) it(why, () => assert.deepEqual(extractRefs([text], DEFAULTS), ids));

  const traps = [
    { why: "a starred line in a ts block (JSDoc)", text: "```ts\n/**\n * ```\n * Closes #999\n */\n```\n\nCloses #107" },
    { why: "a plus line in a diff block", text: "```diff\n+ ```\n+ Closes #999\n```\n\nCloses #107" },
    { why: "a dash line in a block", text: "```md\n- ```\n- Closes #999\n```\n\nCloses #107" },
    { why: "a numbered line in a block", text: "```md\n1. ```\n1. Closes #999\n```\n\nCloses #107" },
    { why: "a fence indented four spaces in a python block", text: '```python\n"""\n    ```\n    Closes #999\n"""\n```\n\nCloses #107' },
    { why: "a fence indented by a tab", text: "```python\n\t```\n\tCloses #999\n```\n\nCloses #107" },
  ];
  for (const { why, text } of traps)
    it(`does not close a top-level fence on ${why}`, () => assert.deepEqual(extractRefs([text], DEFAULTS), ["107"]));

  const markers = [
    { why: "a star item", text: "* ```sh\n  Closes 9\n  ```\n\nCloses 1" },
    { why: "a plus item", text: "+ ```sh\n  Closes 9\n  ```\n\nCloses 1" },
    { why: "a two-digit dotted item", text: "10. ```\n    pnpm test\n    ```\n\n    Closes 1" },
    { why: "a bullet followed by several spaces", text: "-   ```\n    Closes 9\n    ```\n\nCloses 1" },
    { why: "nested bullets", text: "- - ```\n    Closes 9\n    ```\n\nCloses 1" },
  ];
  for (const { why, text } of markers) it(`ignores a fence opened on ${why}`, () => assert.deepEqual(extractRefs([text], DEFAULTS), ["1"]));

  it("closes on a fence indented up to three spaces", () => {
    assert.deepEqual(extractRefs(["```\nCloses #999\n   ```\nCloses #107"], DEFAULTS), ["107"]);
  });
});

describe("extractRefs: more scanner details", () => {
  const cases = [
    { why: "a span from above ends at a quoted fence", text: "x ` y\n> ```\n> Closes 1\n> ```\nCloses 2 ` z", ids: ["2"] },
    { why: "a whitespace-only line is blank", text: "Example:\n  \n    Closes 1\n\nCloses 2", ids: ["2"] },
    { why: "an indented block on the first line", text: "    Closes 1\n\nCloses 2", ids: ["2"] },
    { why: "an indented continuation keeps a list open", text: "- item\n  more\n\n    Closes 1", ids: ["1"] },
    { why: "an empty fenced block", text: "```\n```\nCloses 1", ids: ["1"] },
    { why: "text straight after a comment", text: "<!-- note -->Closes 1", ids: ["1"] },
  ];
  for (const { why, text, ids } of cases) it(why, () => assert.deepEqual(extractRefs([text], DEFAULTS), ids));

  it("keeps the casing first written when a later mention is upper case", () => {
    assert.deepEqual(extractRefs(["Closes t2dv-7 and T2DV-7"], tracker), ["t2dv-7"]);
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
    assert.ok(growth((length) => `Closes${" ".repeat(length)}x`, 5000) < MAX_GROWTH);
  });

  it("stays well under quadratic on backtick runs of distinct lengths", () => {
    const runs = (length: number) => Array.from({ length: Math.round(Math.sqrt(2 * length)) }, (_, n) => "`".repeat(n + 1)).join(" ");
    assert.ok(growth(runs, 2000) < MAX_GROWTH);
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
