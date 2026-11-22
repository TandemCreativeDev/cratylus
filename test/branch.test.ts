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
    { why: "ticket without a description", name: "fix/107", config: DEFAULTS, expect: /fix branches need a ticket id/ },
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

  it("reports a single reason for upper case alone", () => {
    const result = validateBranch("fix/107-Refund", DEFAULTS);
    assert.deepEqual(result, { valid: false, reasons: ['Use lower case only: "fix/107-refund".'] });
  });
});

describe("isRealDate", () => {
  const cases: [string, boolean][] = [
    ["15112026", true],
    ["29022028", true],
    ["29022026", false],
    ["31042026", false],
    ["00012026", false],
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

  it("builds names that validate", () => {
    const name = buildBranchName({ type: "fix", ticket: "107", title: "Refund rounding, finally", date }, DEFAULTS);
    assert.equal(validateBranch(name, DEFAULTS).valid, true);
  });
});
