import type { Config } from "./config.ts";
import { extractRefs } from "./refs.ts";

export interface PullRequest {
  title: string;
  body: string | null;
  labels: string[];
  bot: boolean;
}

export type PullRequestCheck =
  | { ok: true; reason: "bot" }
  | { ok: true; reason: "label" }
  | { ok: true; reason: "ticket"; ids: string[] }
  | { ok: false; message: string };

export function checkPullRequest(pr: PullRequest, config: Config): PullRequestCheck {
  if (pr.bot) return { ok: true, reason: "bot" };
  if (pr.labels.some((label) => label.toLowerCase() === config.noTicketLabel.toLowerCase())) return { ok: true, reason: "label" };

  const keyword = config.keywords[0][0].toUpperCase() + config.keywords[0].slice(1).toLowerCase();
  const ids = extractRefs([pr.title, pr.body ?? ""], config);
  if (ids.length) return { ok: true, reason: "ticket", ids };
  return {
    ok: false,
    message: `This pull request names no ticket. Add a line such as "${keyword} <id>" to the description, or add the "${config.noTicketLabel}" label if the change has no ticket.`,
  };
}
