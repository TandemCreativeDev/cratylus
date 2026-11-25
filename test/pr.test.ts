import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULTS, resolveConfig } from "../src/config.ts";
import { parsePullRequestEvent } from "../src/event.ts";
import { checkPullRequest } from "../src/pr.ts";

const pr = { title: "Round refunds", body: null, labels: [], bot: false };

describe("checkPullRequest", () => {
  it("passes a bot, whatever it says", () => {
    assert.deepEqual(checkPullRequest({ ...pr, bot: true }, DEFAULTS), { ok: true, reason: "bot" });
  });

  it("passes the no-ticket label", () => {
    assert.deepEqual(checkPullRequest({ ...pr, labels: ["bug", "no-ticket"] }, DEFAULTS), { ok: true, reason: "label" });
  });

  it("matches the label without regard to case", () => {
    assert.deepEqual(checkPullRequest({ ...pr, labels: ["No-Ticket"] }, DEFAULTS), { ok: true, reason: "label" });
  });

  it("matches a mixed-case configured label without regard to case", () => {
    const config = resolveConfig({ noTicketLabel: "No-Ticket" });
    assert.deepEqual(checkPullRequest({ ...pr, labels: ["no-ticket"] }, config), { ok: true, reason: "label" });
  });

  it("uses the configured label", () => {
    const config = resolveConfig({ noTicketLabel: "chore-only" });
    assert.equal(checkPullRequest({ ...pr, labels: ["no-ticket"] }, config).ok, false);
    assert.deepEqual(checkPullRequest({ ...pr, labels: ["chore-only"] }, config), { ok: true, reason: "label" });
  });

  it("passes a reference in the description", () => {
    assert.deepEqual(checkPullRequest({ ...pr, body: "Closes #107" }, DEFAULTS), { ok: true, reason: "ticket", ids: ["107"] });
  });

  it("passes a reference in the title and merges with the description", () => {
    const result = checkPullRequest({ ...pr, title: "Closes #1", body: "Also closes #2 and #1" }, DEFAULTS);
    assert.deepEqual(result, { ok: true, reason: "ticket", ids: ["1", "2"] });
  });

  it("fails a null body with no label", () => {
    assert.equal(checkPullRequest(pr, DEFAULTS).ok, false);
  });

  it("fails with one message saying how to fix it", () => {
    assert.deepEqual(checkPullRequest({ ...pr, body: "Fixes #107\n<!-- Closes #1 -->" }, DEFAULTS), {
      ok: false,
      message:
        'This pull request names no ticket. Add a line such as "Closes <id>" to the description, or add the "no-ticket" label if the change has no ticket.',
    });
  });

  it("checks the bot before the label and the label before the references", () => {
    assert.deepEqual(checkPullRequest({ ...pr, bot: true, labels: ["no-ticket"], body: "Closes #1" }, DEFAULTS), { ok: true, reason: "bot" });
    assert.deepEqual(checkPullRequest({ ...pr, labels: ["no-ticket"], body: "Closes #1" }, DEFAULTS), { ok: true, reason: "label" });
  });
});

describe("checkPullRequest: keywords in the message", () => {
  it("names the first configured keyword", () => {
    const result = checkPullRequest(pr, resolveConfig({ keywords: ["fixes", "closes"] }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /Add a line such as "Fixes <id>"/);
  });
});

describe("checkPullRequest: matchBranchTicket", () => {
  const config = resolveConfig({ matchBranchTicket: true });

  it("passes when the references include the branch's ticket", () => {
    const result = checkPullRequest({ ...pr, body: "Closes #5 and #107", branch: "fix/107-refund" }, config);
    assert.deepEqual(result, { ok: true, reason: "ticket", ids: ["5", "107"] });
  });

  it("fails when the references leave out the branch's ticket", () => {
    assert.deepEqual(checkPullRequest({ ...pr, body: "Closes #5", branch: "fix/107-refund" }, config), {
      ok: false,
      message: 'The branch names ticket 107, but this pull request references only 5. Add a line such as "Closes 107" to the description.',
    });
  });

  it("compares without regard to case", () => {
    const lettered = resolveConfig({ ticket: "t2dv-\\d+", matchBranchTicket: true });
    assert.equal(checkPullRequest({ ...pr, body: "Closes T2DV-74", branch: "feat/t2dv-74-x" }, lettered).ok, true);
  });

  it("passes when the branch has no ticket, or is invalid or ignored", () => {
    for (const branch of ["chore/tidy-15112026", "nonsense", "main"])
      assert.equal(checkPullRequest({ ...pr, body: "Closes #5", branch }, resolveConfig({ matchBranchTicket: true, ignore: ["main"] })).ok, true);
  });

  it("is off by default", () => {
    assert.equal(checkPullRequest({ ...pr, body: "Closes #5", branch: "fix/107-refund" }, DEFAULTS).ok, true);
  });

  it("still lets the label and bot pass", () => {
    assert.equal(checkPullRequest({ ...pr, labels: ["no-ticket"], branch: "fix/107-refund" }, config).ok, true);
    assert.equal(checkPullRequest({ ...pr, bot: true, body: "Closes #5", branch: "fix/107-refund" }, config).ok, true);
  });

  it("checks against branchTicket and refTicket separately", () => {
    const split = resolveConfig({ ticket: "\\d+", branchTicket: "proj-\\d+|\\d+", refTicket: "\\d+", matchBranchTicket: true });
    assert.equal(checkPullRequest({ ...pr, body: "Closes #12", branch: "feat/12-x" }, split).ok, true);
    assert.equal(checkPullRequest({ ...pr, body: "Closes #13", branch: "feat/12-x" }, split).ok, false);
  });
});

describe("parsePullRequestEvent", () => {
  const event = (pullRequest: unknown) => ({ pull_request: pullRequest });

  it("reads title, body, labels and a human author", () => {
    const parsed = parsePullRequestEvent(
      event({ title: "T", body: "B", labels: [{ name: "a" }, { name: "b" }], user: { type: "User" } }),
    );
    assert.deepEqual(parsed, { title: "T", body: "B", labels: ["a", "b"], bot: false });
  });

  it("reads the head branch", () => {
    assert.equal(parsePullRequestEvent(event({ title: "T", head: { ref: "fix/1-x" } })).branch, "fix/1-x");
    assert.equal("branch" in parsePullRequestEvent(event({ title: "T", head: null })), false);
  });

  it("treats a Bot user as a bot", () => {
    assert.equal(parsePullRequestEvent(event({ title: "T", user: { type: "Bot" } })).bot, true);
  });

  it("treats a null user as not a bot", () => {
    assert.equal(parsePullRequestEvent(event({ title: "T", user: null })).bot, false);
  });

  it("treats other user types as not a bot", () => {
    for (const type of ["User", "Organization"]) assert.equal(parsePullRequestEvent(event({ title: "T", user: { type } })).bot, false);
  });

  it("accepts a null or missing body and missing labels", () => {
    assert.deepEqual(parsePullRequestEvent(event({ title: "T", body: null })), { title: "T", body: null, labels: [], bot: false });
    assert.equal(parsePullRequestEvent(event({ title: "T" })).body, null);
  });

  const rejected = [
    { why: "no pull_request", payload: { action: "push" }, expect: /no pull_request/ },
    { why: "a payload that is not an object", payload: [], expect: /no pull_request/ },
    { why: "pull_request that is not an object", payload: { pull_request: "x" }, expect: /no pull_request/ },
    { why: "a missing title", payload: event({ body: "B" }), expect: /title must be a string/ },
    { why: "a numeric body", payload: event({ title: "T", body: 3 }), expect: /body must be a string or null/ },
    { why: "labels that are not an array", payload: event({ title: "T", labels: "bug" }), expect: /labels must be an array/ },
    { why: "a label without a name", payload: event({ title: "T", labels: [{}] }), expect: /labels\[\]\.name/ },
    { why: "a user that is not an object", payload: event({ title: "T", user: "me" }), expect: /user must be an object or null/ },
  ];
  for (const { why, payload, expect } of rejected) it(`rejects ${why}`, () => assert.throws(() => parsePullRequestEvent(payload), expect));
});
