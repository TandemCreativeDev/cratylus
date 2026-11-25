import { validateBranch } from "./branch.ts";
import type { Config } from "./config.ts";
import { extractRefs } from "./refs.ts";

export interface PullRequest {
  title: string;
  body: string | null;
  labels: string[];
  bot: boolean;
  /** The head branch name, read for `matchBranchTicket`. */
  branch?: string;
}

export type PullRequestCheck =
  | { ok: true; reason: "bot" }
  | { ok: true; reason: "label" }
  | { ok: true; reason: "ticket"; ids: string[] }
  | { ok: false; message: string };

function branchTicketOf(branch: string | undefined, config: Config): string | undefined {
  if (!config.matchBranchTicket || branch === undefined) return undefined;
  const result = validateBranch(branch, config);
  return result.valid && "parts" in result ? result.parts.ticket : undefined;
}

export function checkPullRequest(pr: PullRequest, config: Config): PullRequestCheck {
  if (pr.bot) return { ok: true, reason: "bot" };
  if (pr.labels.some((label) => label.toLowerCase() === config.noTicketLabel.toLowerCase())) return { ok: true, reason: "label" };

  const keyword = config.keywords[0][0].toUpperCase() + config.keywords[0].slice(1).toLowerCase();
  const ids = extractRefs([pr.title, pr.body ?? ""], config);
  const branchTicket = branchTicketOf(pr.branch, config);
  if (ids.length && branchTicket && !ids.some((id) => id.toLowerCase() === branchTicket.toLowerCase()))
    return {
      ok: false,
      message: `The branch names ticket ${branchTicket}, but this pull request references only ${ids.join(", ")}. Add a line such as "${keyword} ${branchTicket}" to the description.`,
    };
  if (ids.length) return { ok: true, reason: "ticket", ids };
  return {
    ok: false,
    message: `This pull request names no ticket. Add a line such as "${keyword} <id>" to the description, or add the "${config.noTicketLabel}" label if the change has no ticket.`,
  };
}
