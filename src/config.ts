import fs from "node:fs";
import path from "node:path";

import { isRecord, isStringArray } from "./guards.ts";

export interface Config {
  /** Regular expression source for one ticket id, matched case-insensitively. */
  ticket: string;
  /** Words that introduce a pull request reference, matched case-insensitively. */
  keywords: string[];
  /** Allowed branch types. */
  types: string[];
  /** Types whose branch must carry a ticket id. Every entry is also in `types`. */
  ticketRequired: string[];
  /** Pull request label that clears the ticket requirement. */
  noTicketLabel: string;
}

export const CONFIG_FILE = "cratylus.config.json";

export const DEFAULTS: Config = {
  ticket: "\\d+",
  keywords: ["closes"],
  types: ["feat", "fix", "refactor", "perf", "docs", "test", "chore", "build", "ci"],
  ticketRequired: ["feat", "fix", "refactor", "perf"],
  noTicketLabel: "no-ticket",
};

const TYPE_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEYWORD_FORMAT = /^[a-z]+$/i;

/** Merges a parsed config file over the defaults, rejecting anything malformed. */
export function resolveConfig(raw: unknown, file: string = CONFIG_FILE): Config {
  const fail = (message: string): never => {
    throw new Error(`${file}: ${message}`);
  };

  if (!isRecord(raw)) return fail("must be a JSON object");
  const known = new Set([...Object.keys(DEFAULTS), "$schema"]);
  const unknown = Object.keys(raw).filter((key) => !known.has(key));
  if (unknown.length) fail(`unknown option ${unknown.join(", ")}`);

  for (const key of ["ticket", "noTicketLabel"] as const)
    if (raw[key] !== undefined && (typeof raw[key] !== "string" || !raw[key])) fail(`${key} must be a non-empty string`);
  for (const key of ["keywords", "types", "ticketRequired"] as const)
    if (raw[key] !== undefined && !isStringArray(raw[key])) fail(`${key} must be an array of strings`);

  const { $schema: _schema, ...options } = raw;
  const config: Config = { ...DEFAULTS, ...(options as Partial<Config>) };

  let ticket: RegExp;
  try {
    ticket = new RegExp(config.ticket, "i");
  } catch (error) {
    return fail(`ticket is not a valid regular expression: ${(error as Error).message}`);
  }
  if (new RegExp(`${config.ticket}|`).exec("")!.length > 1)
    fail("ticket must not contain a capture group; write (?:...) for a group that only groups");
  if (ticket.test("")) fail("ticket must not match the empty string");
  if (config.ticket.startsWith("^") || /(?<!\\)(?:\\\\)*\$$/.test(config.ticket))
    fail("ticket must not start with ^ or end with $, since it is matched inside a longer name");
  if (config.keywords.length === 0) fail("keywords must not be empty");
  const badKeywords = config.keywords.filter((keyword) => !KEYWORD_FORMAT.test(keyword));
  if (badKeywords.length) fail(`keywords must be single words of letters, not ${badKeywords.join(", ")}`);
  if (config.types.length === 0) fail("types must not be empty");
  const badTypes = config.types.filter((type) => !TYPE_FORMAT.test(type));
  if (badTypes.length) fail(`types must be lower case words joined by hyphens, not ${badTypes.join(", ")}`);
  const missing = config.ticketRequired.filter((type) => !config.types.includes(type));
  if (missing.length) fail(`ticketRequired has ${missing.join(", ")}, which ${missing.length > 1 ? "are" : "is"} not in types`);

  return config;
}

export function loadConfig(file?: string): Config {
  const configPath = path.resolve(file ?? CONFIG_FILE);
  const name = file ?? CONFIG_FILE;
  if (!fs.existsSync(configPath)) {
    if (file) throw new Error(`${name}: not found at ${configPath}`);
    return DEFAULTS;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(`${name}: is not valid JSON: ${(error as Error).message}`);
  }
  return resolveConfig(raw, name);
}
