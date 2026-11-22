import type { Config } from "./config.ts";

export interface BranchParts {
  type: string;
  ticket?: string;
  description: string;
  /** `DDMMYYYY`, present only when the name has no ticket id. */
  date?: string;
}

export type BranchResult = { valid: true; parts: BranchParts } | { valid: false; reasons: string[] };

export interface BranchInput {
  type: string;
  ticket?: string;
  title: string;
  date: Date;
}

const WORDS = "[a-z0-9]+(?:-[a-z0-9]+)*";
const WORDS_ONLY = new RegExp(`^${WORDS}$`);
const DATE_SUFFIX = /^(.*)-(\d{8})$/;
const MAX_WORDS = 5;

export function isRealDate(ddmmyyyy: string): boolean {
  const day = Number(ddmmyyyy.slice(0, 2));
  const month = Number(ddmmyyyy.slice(2, 4));
  const year = Number(ddmmyyyy.slice(4));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateBranch(name: string, config: Config): BranchResult {
  const reasons: string[] = [];
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
  const ticketForm = new RegExp(`^(?<ticket>(?:${config.ticket}))-(?<description>${WORDS})$`, "i").exec(rest)?.groups;
  const dateForm = new RegExp(`^(?<description>${WORDS})-(?<date>\\d{8})$`).exec(rest)?.groups;
  const required = config.ticketRequired.includes(type);

  if (ticketForm) {
    if (reasons.length === 0) return { valid: true, parts: { type, ticket: ticketForm.ticket, description: ticketForm.description } };
  } else if (required) {
    reasons.push(
      `${type} branches need a ticket id right after the slash, as ${type}/<ticket>-<description>, with a ticket matching /${config.ticket}/. A date suffix is not accepted for ${type}.`,
    );
  } else if (dateForm && isRealDate(dateForm.date)) {
    if (reasons.length === 0) return { valid: true, parts: { type, description: dateForm.description, date: dateForm.date } };
  } else {
    const dated = DATE_SUFFIX.exec(rest);
    if (dated && !isRealDate(dated[2])) reasons.push(`"${dated[2]}" is not a real calendar date. Write the date as DDMMYYYY.`);
    else if (!dated) reasons.push(`Add a ticket id after the slash (matching /${config.ticket}/) or end the name with the date as -DDMMYYYY.`);
  }

  if (!ticketForm && !WORDS_ONLY.test(DATE_SUFFIX.exec(rest)?.[1] ?? rest))
    reasons.push("Write the description as words of lower case letters and digits joined by single hyphens, with none at the start or end.");
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

  const name = input.ticket
    ? `${input.type}/${input.ticket.toLowerCase()}-${description}`
    : `${input.type}/${description}-${formatDate(input.date)}`;
  const result = validateBranch(name, config);
  if (!result.valid) throw new Error(result.reasons.join(" "));
  return name;
}
