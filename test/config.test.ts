import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { branchTicket, DEFAULTS, loadConfig, refTicket, resolveConfig } from "../src/config.ts";

describe("resolveConfig", () => {
  it("fills in defaults", () => {
    assert.deepEqual(resolveConfig({}), DEFAULTS);
  });

  it("keeps given options over defaults", () => {
    const config = resolveConfig({ ticket: "t2dv-\\d+", types: ["feat", "chore"], ticketRequired: ["feat"], noTicketLabel: "skip" });
    assert.deepEqual(config, { ...DEFAULTS, ticket: "t2dv-\\d+", types: ["feat", "chore"], ticketRequired: ["feat"], noTicketLabel: "skip" });
  });

  it("allows $schema", () => {
    assert.deepEqual(resolveConfig({ $schema: "https://example.com/schema.json" }), DEFAULTS);
  });

  it("rejects unknown options, so typos surface", () => {
    assert.throws(() => resolveConfig({ ticketRequire: ["feat"] }), /cratylus\.config\.json: unknown option ticketRequire/);
  });

  it("rejects a pattern that does not compile", () => {
    assert.throws(() => resolveConfig({ ticket: "t2dv-(\\d+" }), /cratylus\.config\.json: ticket is not a valid regular expression/);
  });

  it("rejects a ticketRequired entry that is not in types", () => {
    assert.throws(
      () => resolveConfig({ types: ["feat", "chore"], ticketRequired: ["feat", "fix"] }),
      /ticketRequired has fix, which is not in types/,
    );
  });

  it("rejects defaults that no longer fit a shorter types list", () => {
    assert.throws(() => resolveConfig({ types: ["chore"] }), /ticketRequired has feat, fix, refactor, perf, which are not in types/);
  });

  const badTickets = [
    { why: "a pattern that matches the empty string", ticket: "\\d*", expect: /ticket must not match the empty string/ },
    { why: "an alternative that matches the empty string", ticket: "t2dv-\\d+|\\d*", expect: /ticket must not match the empty string/ },
    { why: "a named capture group", ticket: "(?<id>\\d+)", expect: /ticket must not contain a capture group; write \(\?:\.\.\.\)/ },
    { why: "a numbered capture group", ticket: "(t2dv)-\\d+", expect: /ticket must not contain a capture group/ },
    { why: "a backreference with its group", ticket: "([a-z])\\1-\\d+", expect: /ticket must not contain a capture group/ },
    { why: "a leading anchor", ticket: "^\\d+", expect: /ticket must not start with \^ or end with \$/ },
    { why: "a trailing anchor", ticket: "\\d+$", expect: /ticket must not start with \^ or end with \$/ },
    { why: "both anchors", ticket: "^\\d+$", expect: /ticket must not start with \^ or end with \$/ },
  ];
  for (const { why, ticket, expect } of badTickets)
    it(`rejects ${why}`, () => assert.throws(() => resolveConfig({ ticket }), expect));

  it("accepts alternation, non-capturing groups and an escaped dollar", () => {
    assert.equal(resolveConfig({ ticket: "t2dv-\\d+|\\d+" }).ticket, "t2dv-\\d+|\\d+");
    assert.equal(resolveConfig({ ticket: "(?:t2dv-)?\\d+" }).ticket, "(?:t2dv-)?\\d+");
    assert.equal(resolveConfig({ ticket: "\\$\\d+" }).ticket, "\\$\\d+");
    assert.equal(resolveConfig({ ticket: "\\d+\\$" }).ticket, "\\d+\\$");
  });

  const malformed = [
    { why: "a non-object", raw: [], expect: /must be a JSON object/ },
    { why: "a non-string ticket", raw: { ticket: 1 }, expect: /ticket must be a non-empty string/ },
    { why: "an empty ticket", raw: { ticket: "" }, expect: /ticket must be a non-empty string/ },
    { why: "types that are not an array of strings", raw: { types: "feat" }, expect: /types must be an array of strings/ },
    { why: "empty types", raw: { types: [], ticketRequired: [] }, expect: /types must not be empty/ },
    { why: "a type with upper case", raw: { types: ["Feat"], ticketRequired: [] }, expect: /types must be lower case words joined by hyphens, not Feat/ },
    { why: "a non-string label", raw: { noTicketLabel: false }, expect: /noTicketLabel must be a non-empty string/ },
    { why: "an empty branchTicket", raw: { branchTicket: "" }, expect: /branchTicket must be a non-empty string/ },
    { why: "a refTicket that does not compile", raw: { refTicket: "(" }, expect: /refTicket is not a valid regular expression/ },
    { why: "a branchTicket with a capture group", raw: { branchTicket: "(x)-\\d+" }, expect: /branchTicket must not contain a capture group/ },
    { why: "a refTicket that matches the empty string", raw: { refTicket: "\\d*" }, expect: /refTicket must not match the empty string/ },
    { why: "keywords that are not an array", raw: { keywords: "fixes" }, expect: /keywords must be an array of strings/ },
    { why: "empty keywords", raw: { keywords: [] }, expect: /keywords must not be empty/ },
    { why: "a keyword that is not one word", raw: { keywords: ["fix es", "close*"] }, expect: /keywords must be single words of letters, not fix es, close\*/ },
    { why: "ignore that is not an array", raw: { ignore: "main" }, expect: /ignore must be an array of strings/ },
    { why: "an empty glob", raw: { ignore: [""] }, expect: /ignore must not contain an empty glob/ },
  ];
  for (const { why, raw, expect } of malformed) it(`rejects ${why}`, () => assert.throws(() => resolveConfig(raw), expect));

  it("leaves branchTicket and refTicket unset unless given, so they follow ticket", () => {
    const config = resolveConfig({ ticket: "t2dv-\\d+" });
    assert.equal(config.branchTicket, undefined);
    assert.equal(config.refTicket, undefined);
    assert.equal(branchTicket(config), "t2dv-\\d+");
    assert.equal(refTicket(resolveConfig({ ticket: "t2dv-\\d+", refTicket: "\\d+" })), "\\d+");
  });

  it("prefixes errors with the file it was given", () => {
    assert.throws(() => resolveConfig({ nope: 1 }, "ci/names.json"), /^Error: ci\/names\.json: unknown option nope/);
  });
});

describe("loadConfig", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cratylus-config-"));

  it("reads and validates a file", () => {
    const file = path.join(dir, "names.json");
    fs.writeFileSync(file, JSON.stringify({ ticket: "t2dv-\\d+" }));
    assert.equal(loadConfig(file).ticket, "t2dv-\\d+");
  });

  it("names the file in an error", () => {
    const file = path.join(dir, "bad.json");
    fs.writeFileSync(file, JSON.stringify({ ticket: "(" }));
    assert.throws(() => loadConfig(file), new RegExp(`${file.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}: ticket is not a valid`));
  });

  it("rejects invalid JSON", () => {
    const file = path.join(dir, "broken.json");
    fs.writeFileSync(file, "{");
    assert.throws(() => loadConfig(file), /is not valid JSON/);
  });

  it("fails when a named file is missing", () => {
    assert.throws(() => loadConfig(path.join(dir, "missing.json")), /not found at/);
  });
});
