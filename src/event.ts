import { isRecord } from "./guards.ts";
import type { PullRequest } from "./pr.ts";

function readLabels(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("pull_request.labels must be an array");
  return value.map((label) => {
    if (!isRecord(label) || typeof label.name !== "string") throw new Error("pull_request.labels[].name must be a string");
    return label.name;
  });
}

/** Reads the pull request fields cratylus needs from a GitHub event payload. */
export function parsePullRequestEvent(payload: unknown): PullRequest {
  if (!isRecord(payload) || !isRecord(payload.pull_request)) throw new Error("has no pull_request, so it is not a pull request event");
  const { title, body, labels, user, head } = payload.pull_request;
  if (typeof title !== "string") throw new Error("pull_request.title must be a string");
  if (body !== undefined && body !== null && typeof body !== "string") throw new Error("pull_request.body must be a string or null");
  if (user !== undefined && user !== null && !isRecord(user)) throw new Error("pull_request.user must be an object or null");

  const branch = isRecord(head) && typeof head.ref === "string" ? head.ref : undefined;
  return { title, body: body ?? null, labels: readLabels(labels), bot: isRecord(user) && user.type === "Bot", ...(branch === undefined ? {} : { branch }) };
}
