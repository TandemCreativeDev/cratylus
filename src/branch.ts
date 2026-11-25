import { branchTicket } from "./config.ts";
import type { Config } from "./config.ts";

export interface BranchParts {
  type: string;
  ticket?: string;
  description: string;
  /** `DDMMYYYY`, present only when the name has no ticket id. */
  date?: string;
}

export type BranchResult = { valid: true; parts: BranchParts } | { valid: true; ignored: true } | { valid: false; reasons: string[] };

export interface BranchInput {
  type: string;
  ticket?: string;
  title: string;
  date: Date;
}

const WORDS = "[a-z0-9]+(?:-[a-z0-9]+)*";
const WORDS_ONLY = new RegExp(`^${WORDS}$`);
const DATE_SUFFIX = /^(.*)-(\d{8})$/;
const WORDS_MESSAGE =
  "Write the description as words of lower case letters and digits joined by single hyphens, with none at the start or end.";
const MAX_WORDS = 5;
const EARLIEST_YEAR = 2000;

export function isRealDate(ddmmyyyy: string): boolean {
  const day = Number(ddmmyyyy.slice(0, 2));
  const month = Number(ddmmyyyy.slice(2, 4));
  const year = Number(ddmmyyyy.slice(4));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Says what is wrong with a branch date, which must be a real day from 2000 up to the day after `today`. */
function dateFault(ddmmyyyy: string, today: Date): string | undefined {
  if (!isRealDate(ddmmyyyy)) return `"${ddmmyyyy}" is not a real calendar date. Write the date as DDMMYYYY.`;
  const year = Number(ddmmyyyy.slice(4));
  if (year < EARLIEST_YEAR) return `"${ddmmyyyy}" is before ${EARLIEST_YEAR}. Write the day the branch is cut as DDMMYYYY.`;
  const time = Date.UTC(year, Number(ddmmyyyy.slice(2, 4)) - 1, Number(ddmmyyyy.slice(0, 2)));
  const latest = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (time > latest) return `"${ddmmyyyy}" is in the future. Write the day the branch is cut as DDMMYYYY.`;
  return undefined;
}

/** Matches a whole name against a glob, where `*` matches any run of characters, slashes included, and `?` any one. */
export function matchesGlob(name: string, glob: string): boolean {
  const source = glob
    .split(/(\*+|\?)/)
    .map((part) => (part.startsWith("*") ? ".*" : part === "?" ? "." : part.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${source}$`).test(name);
}

export function validateBranch(name: string, config: Config, today: Date = new Date()): BranchResult {
  if (config.ignore.some((glob) => matchesGlob(name, glob))) return { valid: true, ignored: true };
  const reasons: string[] = [];
  const ticket = branchTicket(config);
  const lower = name.toLowerCase();
  if (lower !== name) reasons.push(`Use lower case only: "${lower}".`);

  const slash = lower.indexOf("/");
  if (slash < 1) {
    reasons.push(`Start the name with a type and a slash, as in <type>/<description>. Types: ${config.types.join(", ")}.`);
    return { valid: false, reasons };
  }
  const type = lower.slice(0, slash);
  if (!config.types.includes(type)) {
    reasons.push(`"${type}" is not an allowed type. Use one of: ${config.types.join(", ")}.`);
    return { valid: false, reasons };
  }

  const rest = lower.slice(slash + 1);
  const ticketPattern = new RegExp(`^(?<ticket>(?:${ticket}))-(?<description>${WORDS})$`, "i").exec(rest)?.groups;
  const ticketForm = ticketPattern?.ticket ? ticketPattern : undefined;
  const dateForm = new RegExp(`^(?<description>${WORDS})-(?<date>\\d{8})$`).exec(rest)?.groups;
  const ticketStart = new RegExp(`^(?:${ticket})(?=-|$)`, "i").exec(rest);
  const ticketLength = ticketStart?.[0].length ?? 0;
  const dated = DATE_SUFFIX.exec(rest);
  const fault = dated ? dateFault(dated[2], today) : undefined;
  const required = config.ticketRequired.includes(type);

  if (ticketForm) {
    if (reasons.length === 0) return { valid: true, parts: { type, ticket: ticketForm.ticket, description: ticketForm.description } };
  } else if (!required && dateForm && !fault) {
    if (reasons.length === 0) return { valid: true, parts: { type, description: dateForm.description, date: dateForm.date } };
  } else if (!required && fault && (ticketLength === 0 || WORDS_ONLY.test(dated![1]))) {
    reasons.push(fault);
  } else if (ticketLength > 0) {
    if (rest.slice(ticketLength + 1) === "") reasons.push(`Add a short description after the ticket id, as ${type}/${ticketStart![0]}-<description>.`);
    else reasons.push(WORDS_MESSAGE);
  } else if (required) {
    reasons.push(
      `${type} branches need a ticket id right after the slash, as ${type}/<ticket>-<description>, with a ticket matching /${ticket}/. A date suffix is not accepted for ${type}.`,
    );
  } else if (!dated) {
    reasons.push(`Add a ticket id after the slash (matching /${ticket}/) or end the name with the date as -DDMMYYYY.`);
  }

  if (!ticketForm && ticketLength === 0 && !WORDS_ONLY.test(rest)) reasons.push(WORDS_MESSAGE);
  return { valid: false, reasons };
}

export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, MAX_WORDS)
    .join("-");
}

function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}${month}${date.getFullYear()}`;
}

/** Builds a branch name that passes `validateBranch`, or throws saying why it cannot. */
export function buildBranchName(input: BranchInput, config: Config): string {
  const description = slugify(input.title);
  if (!description) throw new Error("The title has no letters or digits to build a description from.");
  if (!input.ticket && config.ticketRequired.includes(input.type))
    throw new Error(`A ticket id is required for ${input.type} branches.`);
  const pattern = branchTicket(config);
  if (input.ticket && !new RegExp(`^(?:${pattern})$`, "i").test(input.ticket))
    throw new Error(`"${input.ticket}" is not a ticket id matching /${pattern}/.`);

  const ticket = input.ticket?.toLowerCase();
  const name = ticket ? `${input.type}/${ticket}-${description}` : `${input.type}/${description}-${formatDate(input.date)}`;
  const result = validateBranch(name, config, input.date);
  if (!result.valid) throw new Error(result.reasons.join(" "));
  if ("ignored" in result) return name;
  if (ticket && result.parts.ticket !== ticket)
    throw new Error(`The name "${name}" reads back with the ticket id "${result.parts.ticket}", not "${ticket}". Reword the title.`);
  if (!ticket && result.parts.ticket)
    throw new Error(
      `The title starts with "${result.parts.ticket}", which reads as a ticket id. Pass it as the ticket (--ticket) or reword the title.`,
    );
  return name;
}
