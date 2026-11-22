import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBranchName, isRealDate, slugify, validateBranch } from "../src/branch.ts";
import { DEFAULTS, resolveConfig } from "../src/config.ts";

const tracker = resolveConfig({ ticket: "t2dv-\\d+" });

describe("validateBranch: valid names", () => {
  const cases = [
    { name: "feat/t2dv-74-cancel-endpoint", config: tracker, parts: { type: "feat", ticket: "t2dv-74", description: "cancel-endpoint" } },
    { name: "fix/107-refund-rounding", config: DEFAULTS, parts: { type: "fix", ticket: "107", description: "refund-rounding" } },
    { name: "chore/upgrade-dependencies-15112026", config: DEFAULTS, parts: { type: "chore", description: "upgrade-dependencies", date: "15112026" } },
    { name: "docs/12-readme", config: DEFAULTS, parts: { type: "docs", ticket: "12", description: "readme" } },
    { name: "ci/pin-actions-29022028", config: DEFAULTS, parts: { type: "ci", description: "pin-actions", date: "29022028" } },
    { name: "fix/107-2fa-codes", config: DEFAULTS, parts: { type: "fix", ticket: "107", description: "2fa-codes" } },
  ];
  for (const { name, config, parts } of cases)
    it(name, () => assert.deepEqual(validateBranch(name, config), { valid: true, parts }));
});

describe("validateBranch: an alternation ticket pattern", () => {
  const either = resolveConfig({ ticket: "t2dv-\\d+|\\d+" });
  for (const [name, ticket] of [["feat/t2dv-74-cancel", "t2dv-74"], ["feat/74-cancel", "74"]])
    it(name, () => assert.deepEqual(validateBranch(name, either), { valid: true, parts: { type: "feat", ticket, description: "cancel" } }));
});

describe("validateBranch: invalid names", () => {
  const cases = [
    { why: "type not in types", name: "wip/107-thing", config: DEFAULTS, expect: /"wip" is not an allowed type/ },
    { why: "no slash", name: "feature-107-thing", config: DEFAULTS, expect: /Start the name with a type and a slash/ },
    { why: "required type in the dated form", name: "feat/cancel-endpoint-15112026", config: DEFAULTS, expect: /feat branches need a ticket id.*not accepted for feat/ },
    { why: "required type with no ticket or date", name: "fix/refund-rounding", config: DEFAULTS, expect: /fix branches need a ticket id/ },
    { why: "impossible date", name: "chore/tidy-31022026", config: DEFAULTS, expect: /"31022026" is not a real calendar date/ },
    { why: "29 February in a common year", name: "chore/tidy-29022027", config: DEFAULTS, expect: /not a real calendar date/ },
    { why: "month 13", name: "chore/tidy-01132026", config: DEFAULTS, expect: /not a real calendar date/ },
    { why: "upper case", name: "Feat/107-Refund", config: DEFAULTS, expect: /Use lower case only: "feat\/107-refund"/ },
    { why: "double hyphen after a ticket", name: "fix/107-refund--rounding", config: DEFAULTS, expect: /single hyphens/ },
    { why: "double hyphen before a date", name: "chore/tidy--up-15112026", config: DEFAULTS, expect: /single hyphens/ },
    { why: "trailing hyphen", name: "chore/tidy-up-", config: DEFAULTS, expect: /single hyphens/ },
    { why: "underscore in description", name: "chore/tidy_up-15112026", config: DEFAULTS, expect: /single hyphens/ },
    { why: "optional type with neither ticket nor date", name: "chore/upgrade-dependencies", config: DEFAULTS, expect: /Add a ticket id after the slash/ },
    { why: "required type with a ticket and no description", name: "fix/107", config: DEFAULTS, expect: /^Add a short description after the ticket id, as fix\/107-<description>\.$/ },
    { why: "required type with a ticket and a trailing hyphen", name: "fix/107-", config: DEFAULTS, expect: /^Add a short description after the ticket id/ },
    { why: "required type with a ticket and a doubled hyphen", name: "feat/107-refund--rounding", config: DEFAULTS, expect: /^Write the description as words/ },
    { why: "lettered ticket with a malformed description", name: "feat/t2dv-74-Cancel_it", config: tracker, expect: /^Use lower case only.*\n.*Write the description as words/s },
    { why: "optional type with a ticket and no description", name: "chore/107", config: DEFAULTS, expect: /^Add a short description after the ticket id/ },
    { why: "ticket id runs into letters", name: "fix/107abc-refund", config: DEFAULTS, expect: /fix branches need a ticket id/ },
    { why: "letters in the ticket do not match a numeric pattern", name: "fix/t2dv-74-refund", config: DEFAULTS, expect: /fix branches need a ticket id/ },
    { why: "numeric ticket does not match a lettered pattern", name: "feat/74-cancel", config: tracker, expect: /feat branches need a ticket id.*t2dv/ },
  ];
  for (const { why, name, config, expect } of cases)
    it(why, () => {
      const result = validateBranch(name, config);
      assert.equal(result.valid, false);
      if (!result.valid) assert.match(result.reasons.join("\n"), expect);
    });

  it("does not blame the ticket or the date when the ticket is present", () => {
    for (const name of ["feat/107", "feat/107-refund--rounding"]) {
      const result = validateBranch(name, DEFAULTS);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.reasons.length, 1);
        assert.doesNotMatch(result.reasons[0], /ticket id right after the slash|date suffix/);
      }
    }
  });

  it("reports a single reason for upper case alone", () => {
    const result = validateBranch("fix/107-Refund", DEFAULTS);
    assert.deepEqual(result, { valid: false, reasons: ['Use lower case only: "fix/107-refund".'] });
  });
});

describe("validateBranch: a lettered ticket pattern and the dated form", () => {
  const lettered = resolveConfig({ ticket: "[a-z]+-\\d+" });
  const alternation = resolveConfig({ ticket: "(?:t2dv|ops)-\\d+" });

  it("reads a one-word dated name as dated", () => {
    assert.deepEqual(validateBranch("chore/cleanup-22112026", lettered), {
      valid: true,
      parts: { type: "chore", description: "cleanup", date: "22112026" },
    });
    assert.deepEqual(validateBranch("chore/ops-22112026", alternation), {
      valid: true,
      parts: { type: "chore", description: "ops", date: "22112026" },
    });
  });

  it("still reads a ticket form first", () => {
    assert.deepEqual(validateBranch("chore/abc-12-tidy", lettered), { valid: true, parts: { type: "chore", ticket: "abc-12", description: "tidy" } });
  });

  const cases = [
    { name: "chore/abc-12", expect: /^Add a short description after the ticket id, as chore\/abc-12-<description>\.$/ },
    { name: "docs/22112026", expect: /Add a ticket id after the slash/ },
    { name: "chore/107", expect: /Add a ticket id after the slash/ },
    { name: "feat/x-22112026", expect: /^Add a short description after the ticket id, as feat\/x-22112026-<description>\.$/ },
    { name: "chore/cleanup-31022026", expect: /not a real calendar date/ },
  ];
  for (const { name, expect } of cases)
    it(`keeps the reason for ${name}`, () => {
      const result = validateBranch(name, lettered);
      assert.equal(result.valid, false);
      if (!result.valid) assert.match(result.reasons.join("\n"), expect);
    });

  it("builds a one-word dated name", () => {
    assert.equal(buildBranchName({ type: "chore", title: "Cleanup", date: new Date(2026, 10, 22) }, lettered), "chore/cleanup-22112026");
  });
});

describe("validateBranch: a bad description before a bad date", () => {
  for (const name of ["chore/12--31022026", "chore/12-foo_bar-31022026"])
    it(name, () => {
      const result = validateBranch(name, DEFAULTS);
      assert.equal(result.valid, false);
      if (!result.valid) {
        assert.equal(result.reasons.length, 1);
        assert.match(result.reasons[0], /^Write the description as words/);
      }
    });

  it("still blames the date when the description is fine", () => {
    const result = validateBranch("chore/tidy-31022026", DEFAULTS);
    assert.equal(result.valid, false);
    if (!result.valid) assert.match(result.reasons[0], /not a real calendar date/);
  });

  it("asks for a description after a one-character ticket", () => {
    const result = validateBranch("feat/7", DEFAULTS);
    assert.deepEqual(result, { valid: false, reasons: ["Add a short description after the ticket id, as feat/7-<description>."] });
  });
});

describe("validateBranch: details", () => {
  it("explains a bad description in a dated name with one reason", () => {
    assert.deepEqual(validateBranch("chore/tidy--up-15112026", DEFAULTS), {
      valid: false,
      reasons: ["Write the description as words of lower case letters and digits joined by single hyphens, with none at the start or end."],
    });
  });

  it("asks a required type for a ticket, not a date, when the date is impossible", () => {
    const result = validateBranch("feat/tidy-31022026", DEFAULTS);
    assert.equal(result.valid, false);
    if (!result.valid) assert.match(result.reasons.join("\n"), /feat branches need a ticket id/);
  });

  it("asks for a type when the name starts with a slash", () => {
    const result = validateBranch("/tidy-15112026", DEFAULTS);
    assert.equal(result.valid, false);
    if (!result.valid) assert.match(result.reasons[0], /Start the name with a type and a slash/);
  });

  it("needs exactly eight digits for a date", () => {
    for (const name of ["chore/x-1511200", "chore/x-151120"]) {
      const result = validateBranch(name, DEFAULTS);
      assert.equal(result.valid, false);
      if (!result.valid) assert.match(result.reasons[0], /Add a ticket id after the slash/);
    }
  });

  it("reads a capital-letter ticket pattern in a name that has no description", () => {
    const config = resolveConfig({ ticket: "[A-Z]+-\\d+" });
    const result = validateBranch("feat/abc-12", config);
    assert.equal(result.valid, false);
    if (!result.valid) assert.match(result.reasons[0], /^Add a short description after the ticket id/);
  });

  it("reads an upper-case dated name as one case fault", () => {
    assert.deepEqual(validateBranch("Chore/Tidy-15112026", DEFAULTS), { valid: false, reasons: ['Use lower case only: "chore/tidy-15112026".'] });
  });

  it("matches a ticket pattern written in capitals against a lower-case name", () => {
    const config = resolveConfig({ ticket: "[A-Z]+-\\d+" });
    assert.deepEqual(validateBranch("feat/abc-12-thing", config), { valid: true, parts: { type: "feat", ticket: "abc-12", description: "thing" } });
  });

  it("rejects a year below 100", () => {
    const result = validateBranch("chore/x-01010099", DEFAULTS);
    assert.equal(result.valid, false);
    if (!result.valid) assert.match(result.reasons[0], /not a real calendar date/);
  });

  it("never reads an empty match as a ticket", () => {
    const config = resolveConfig({ ticket: "\\d*(?=-)" });
    const result = validateBranch("feat/-foo", config);
    assert.equal(result.valid, false);
    if (!result.valid) assert.match(result.reasons.join("\n"), /feat branches need a ticket id/);
    assert.equal(validateBranch("chore/-foo", config).valid, false);
  });
});

describe("isRealDate", () => {
  const cases: [string, boolean][] = [
    ["15112026", true],
    ["29022028", true],
    ["29022026", false],
    ["31042026", false],
    ["00012026", false],
    ["01010099", false],
    ["01010100", true],
    ["31122026", true],
  ];
  for (const [date, expected] of cases) it(`${date} is ${expected}`, () => assert.equal(isRealDate(date), expected));
});

describe("slugify", () => {
  const cases: [string, string][] = [
    ["Cancel endpoint", "cancel-endpoint"],
    ["  Fix: the Café's  Crème brûlée!  ", "fix-the-cafe-s-creme"],
    ["one two three four five six seven", "one-two-three-four-five"],
    ["--Already--hyphenated--", "already-hyphenated"],
    ["Refund 2.5% rounding", "refund-2-5-rounding"],
    ["!!!", ""],
    ["Søren Åse", "s-ren-ase"],
  ];
  for (const [title, slug] of cases) it(JSON.stringify(title), () => assert.equal(slugify(title), slug));
});

describe("buildBranchName", () => {
  const date = new Date(2026, 10, 5);

  it("builds the ticket form with the ticket lower-cased", () => {
    assert.equal(buildBranchName({ type: "feat", ticket: "T2DV-74", title: "Cancel endpoint", date }, tracker), "feat/t2dv-74-cancel-endpoint");
  });

  it("builds the dated form, padding day and month", () => {
    assert.equal(buildBranchName({ type: "chore", title: "Upgrade dependencies", date }, DEFAULTS), "chore/upgrade-dependencies-05112026");
  });

  it("keeps a ticket on a type that does not require one", () => {
    assert.equal(buildBranchName({ type: "docs", ticket: "12", title: "Readme", date }, DEFAULTS), "docs/12-readme");
  });

  it("fails without a ticket for a required type", () => {
    assert.throws(() => buildBranchName({ type: "feat", title: "Cancel endpoint", date }, DEFAULTS), /ticket id is required for feat/);
  });

  it("fails on an unknown type", () => {
    assert.throws(() => buildBranchName({ type: "wip", title: "Thing", date }, DEFAULTS), /not an allowed type/);
  });

  it("fails on a ticket that does not match the pattern", () => {
    assert.throws(() => buildBranchName({ type: "feat", ticket: "74", title: "Thing", date }, tracker), /ticket id/);
  });

  it("fails when the title leaves no description", () => {
    assert.throws(() => buildBranchName({ type: "chore", title: "???", date }, DEFAULTS), /no letters or digits/);
  });

  it("pads the month", () => {
    assert.equal(buildBranchName({ type: "chore", title: "Tidy", date: new Date(2026, 0, 15) }, DEFAULTS), "chore/tidy-15012026");
  });

  it("refuses a ticket that does not match the pattern in full", () => {
    for (const ticket of ["12-34", "#107", "107abc"])
      assert.throws(
        () => buildBranchName({ type: "feat", ticket, title: "thing", date }, DEFAULTS),
        new RegExp(`"${ticket}" is not a ticket id matching /\\\\d\\+/\\.`),
      );
  });

  it("refuses a ticket that reads back differently", () => {
    const config = resolveConfig({ ticket: "\\d+|\\d+-\\d+" });
    assert.throws(
      () => buildBranchName({ type: "feat", ticket: "12-34", title: "thing", date }, config),
      /reads back with the ticket id "12", not "12-34"/,
    );
  });

  it("fails when a title without a ticket would read as one", () => {
    assert.throws(
      () => buildBranchName({ type: "chore", title: "2024 update", date }, DEFAULTS),
      /title starts with "2024", which reads as a ticket id\. Pass it as the ticket \(--ticket\) or reword the title/,
    );
    assert.throws(
      () => buildBranchName({ type: "docs", title: "T2DV-74 follow up", date }, tracker),
      /title starts with "t2dv-74"/,
    );
  });

  it("allows the same title when the ticket is passed", () => {
    assert.equal(buildBranchName({ type: "chore", ticket: "7", title: "2024 update", date }, DEFAULTS), "chore/7-2024-update");
  });

  it("allows a number later in the title", () => {
    assert.equal(buildBranchName({ type: "chore", title: "Update 2024", date }, DEFAULTS), "chore/update-2024-05112026");
  });

  it("builds names that validate", () => {
    const name = buildBranchName({ type: "fix", ticket: "107", title: "Refund rounding, finally", date }, DEFAULTS);
    assert.equal(validateBranch(name, DEFAULTS).valid, true);
  });
});
