#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { parseArgs } from "node:util";

import { buildBranchName, validateBranch } from "./branch.ts";
import type { BranchResult } from "./branch.ts";
import { CONFIG_FILE, DEFAULTS, loadConfig } from "./config.ts";
import type { Config } from "./config.ts";
import { parsePullRequestEvent } from "./event.ts";
import { checkPullRequest } from "./pr.ts";
import type { PullRequest, PullRequestCheck } from "./pr.ts";
import { extractRefs } from "./refs.ts";

const HELP = `Usage: cratylus <command> [options]

Checks branch names and pull request ticket references against one naming convention.

Commands:
  init                       Write a starter ${CONFIG_FILE} (refuse if it exists)
  branch [name]              Check a branch name (default: the current branch). Exit 1 if invalid
  name --type <t> [--ticket <id>] --title <text>
                             Print the branch name for a piece of work (date: today)
  refs [file]                Print the ticket ids referenced in the text (default: stdin), one per line
  pr [--title <t>] [--body-file <f>] [--label <l>]... [--bot] [--event <file>]
                             Check a pull request names a ticket. Exit 1 if not
                             With no --title, --body-file or --event, reads the GitHub
                             event payload at $GITHUB_EVENT_PATH

Options:
  -c, --config <file>        Config file (default: ${CONFIG_FILE}, optional)
      --json                 Print the result as JSON
  -h, --help                 Show this help
`;

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function currentBranch(): string {
  let branch: string;
  try {
    branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    throw new Error("Could not read the current branch. Run inside a git repository, or pass a branch name.");
  }
  if (!branch) throw new Error("HEAD is detached, so there is no current branch. Pass a branch name.");
  return branch;
}

function init(json: boolean): number {
  if (fs.existsSync(CONFIG_FILE)) throw new Error(`${CONFIG_FILE} already exists`);
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(DEFAULTS, null, 2)}\n`);
  if (json) printJson({ wrote: CONFIG_FILE });
  else console.log(`wrote ${CONFIG_FILE}`);
  return 0;
}

function branch(name: string | undefined, config: Config, json: boolean): number {
  const checked = name ?? currentBranch();
  const result: BranchResult = validateBranch(checked, config);
  if (json) printJson({ name: checked, ...result });
  else if (result.valid) console.log(`valid: ${checked}`);
  else console.error([`cratylus: invalid branch name "${checked}"`, ...result.reasons.map((reason) => `  - ${reason}`)].join("\n"));
  return result.valid ? 0 : 1;
}

function name(type: string | undefined, ticket: string | undefined, title: string | undefined, config: Config, json: boolean): number {
  if (!type || !title) throw new Error("name needs --type and --title");
  const built = buildBranchName({ type, ticket, title, date: new Date() }, config);
  if (json) printJson({ name: built });
  else console.log(built);
  return 0;
}

function refs(file: string | undefined, config: Config, json: boolean): number {
  const ids = extractRefs([fs.readFileSync(file ?? 0, "utf8")], config);
  if (json) printJson({ ids });
  else for (const id of ids) console.log(id);
  return 0;
}

function readEvent(file: string): PullRequest {
  try {
    return parsePullRequestEvent(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`);
  }
}

function describe(check: PullRequestCheck, config: Config): string {
  if (!check.ok) return check.message;
  if (check.reason === "bot") return "ok: bot author, no ticket needed";
  if (check.reason === "label") return `ok: labelled ${config.noTicketLabel}, no ticket needed`;
  return `ok: references ${check.ids.join(", ")}`;
}

function pr(
  flags: { title?: string; bodyFile?: string; labels: string[]; bot: boolean; event?: string },
  config: Config,
  json: boolean,
): number {
  const eventFile = flags.event ?? (flags.title === undefined && flags.bodyFile === undefined ? process.env.GITHUB_EVENT_PATH : undefined);
  if (!eventFile && flags.title === undefined && flags.bodyFile === undefined)
    throw new Error("No pull request to check. Pass --title, --body-file or --event, or run where GITHUB_EVENT_PATH is set.");

  const base: PullRequest = eventFile ? readEvent(eventFile) : { title: "", body: null, labels: [], bot: false };
  const check = checkPullRequest(
    {
      title: flags.title ?? base.title,
      body: flags.bodyFile === undefined ? base.body : fs.readFileSync(flags.bodyFile, "utf8"),
      labels: [...base.labels, ...flags.labels],
      bot: base.bot || flags.bot,
    },
    config,
  );
  if (json) printJson(check);
  else if (check.ok) console.log(describe(check, config));
  else console.error(`cratylus: ${describe(check, config)}`);
  return check.ok ? 0 : 1;
}

function run(): number {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string", short: "c" },
      json: { type: "boolean" },
      type: { type: "string" },
      ticket: { type: "string" },
      title: { type: "string" },
      "body-file": { type: "string" },
      label: { type: "string", multiple: true },
      bot: { type: "boolean" },
      event: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const [command, ...args] = positionals;
  if (!command) throw new Error("Missing command. Run cratylus --help.");
  const json = values.json ?? false;

  if (command === "init") return init(json);
  const config = loadConfig(values.config);
  if (args.length > 1) throw new Error(`Unexpected argument ${args[1]}. Run cratylus --help.`);

  switch (command) {
    case "branch":
      return branch(args[0], config, json);
    case "name":
      return name(values.type, values.ticket, values.title, config, json);
    case "refs":
      return refs(args[0], config, json);
    case "pr":
      return pr(
        { title: values.title, bodyFile: values["body-file"], labels: values.label ?? [], bot: values.bot ?? false, event: values.event },
        config,
        json,
      );
    default:
      throw new Error(`Unknown command ${command}. Run cratylus --help.`);
  }
}

try {
  process.exitCode = run();
} catch (error) {
  console.error(`cratylus: ${(error as Error).message}`);
  process.exitCode = 1;
}
