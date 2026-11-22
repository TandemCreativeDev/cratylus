import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { DEFAULTS, loadConfig, resolveConfig } from "../src/config.ts";

describe("resolveConfig", () => {
  it("fills in defaults", () => {
    assert.deepEqual(resolveConfig({}), DEFAULTS);
  });

  it("keeps given options over defaults", () => {
    const config = resolveConfig({ ticket: "t2dv-\\d+", types: ["feat", "chore"], ticketRequired: ["feat"], noTicketLabel: "skip" });
    assert.deepEqual(config, { ticket: "t2dv-\\d+", types: ["feat", "chore"], ticketRequired: ["feat"], noTicketLabel: "skip" });
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

  const malformed = [
    { why: "a non-object", raw: [], expect: /must be a JSON object/ },
    { why: "a non-string ticket", raw: { ticket: 1 }, expect: /ticket must be a non-empty string/ },
    { why: "an empty ticket", raw: { ticket: "" }, expect: /ticket must be a non-empty string/ },
    { why: "types that are not an array of strings", raw: { types: "feat" }, expect: /types must be an array of strings/ },
    { why: "empty types", raw: { types: [], ticketRequired: [] }, expect: /types must not be empty/ },
    { why: "a type with upper case", raw: { types: ["Feat"], ticketRequired: [] }, expect: /types must be lower case words joined by hyphens, not Feat/ },
    { why: "a non-string label", raw: { noTicketLabel: false }, expect: /noTicketLabel must be a non-empty string/ },
  ];
  for (const { why, raw, expect } of malformed) it(`rejects ${why}`, () => assert.throws(() => resolveConfig(raw), expect));

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
