import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const CLI = path.resolve(import.meta.dirname, "../src/cli.ts");
const EVENT = path.resolve(import.meta.dirname, "fixtures/pull-request-event.json");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cratylus-cli-"));

function cratylus(args: string[], options: { input?: string; cwd?: string; env?: Record<string, string> } = {}) {
  const env = { ...process.env, ...options.env };
  if (!options.env?.GITHUB_EVENT_PATH) delete env.GITHUB_EVENT_PATH;
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", input: options.input ?? "", cwd: options.cwd ?? scratch, env });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function write(name: string, content: string): string {
  const file = path.join(scratch, name);
  fs.writeFileSync(file, content);
  return file;
}

function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

const tracker = write("tracker.json", JSON.stringify({ ticket: "t2dv-\\d+" }));

describe("help and errors", () => {
  it("prints help", () => {
    const { status, stdout } = cratylus(["--help"]);
    assert.equal(status, 0);
    assert.match(stdout, /^Usage: cratylus <command> \[options\]/);
  });

  it("fails without a command", () => {
    const { status, stderr } = cratylus([]);
    assert.equal(status, 1);
    assert.match(stderr, /^cratylus: Missing command/);
  });

  it("fails on an unknown command", () => {
    const { status, stderr } = cratylus(["frobnicate"]);
    assert.equal(status, 1);
    assert.match(stderr, /^cratylus: Unknown command frobnicate/);
  });

  it("fails on an unknown option", () => {
    const { status, stderr } = cratylus(["branch", "--nope"]);
    assert.equal(status, 1);
    assert.match(stderr, /^cratylus: /);
  });

  it("fails on a bad config, naming the file", () => {
    const file = write("bad.json", JSON.stringify({ ticket: "(" }));
    const { status, stderr } = cratylus(["branch", "chore/x-15112026", "-c", file]);
    assert.equal(status, 1);
    assert.match(stderr, /^cratylus: .*bad\.json: ticket is not a valid regular expression/);
  });
});

describe("init", () => {
  it("writes a starter config and refuses to overwrite it", () => {
    const dir = fs.mkdtempSync(path.join(scratch, "init-"));
    const first = cratylus(["init"], { cwd: dir });
    assert.equal(first.status, 0);
    assert.equal(first.stdout, "wrote cratylus.config.json\n");
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "cratylus.config.json"), "utf8")).noTicketLabel, "no-ticket");
    const second = cratylus(["init"], { cwd: dir });
    assert.equal(second.status, 1);
    assert.match(second.stderr, /^cratylus: cratylus\.config\.json already exists/);
  });

  it("picks up the config it wrote", () => {
    const dir = fs.mkdtempSync(path.join(scratch, "init-"));
    cratylus(["init"], { cwd: dir });
    assert.equal(cratylus(["branch", "fix/107-rounding"], { cwd: dir }).status, 0);
  });
});

describe("branch", () => {
  it("accepts a valid name", () => {
    const { status, stdout } = cratylus(["branch", "feat/t2dv-74-cancel-endpoint", "-c", tracker]);
    assert.equal(status, 0);
    assert.equal(stdout, "valid: feat/t2dv-74-cancel-endpoint\n");
  });

  it("rejects an invalid name with its reasons on stderr", () => {
    const { status, stdout, stderr } = cratylus(["branch", "feat/cancel-endpoint-15112026"]);
    assert.equal(status, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /invalid branch name "feat\/cancel-endpoint-15112026"\n {2}- feat branches need a ticket id/);
  });

  it("prints one JSON object for a valid name", () => {
    const { status, stdout } = cratylus(["branch", "chore/tidy-15112026", "--json"]);
    assert.equal(status, 0);
    assert.deepEqual(JSON.parse(stdout), { name: "chore/tidy-15112026", valid: true, parts: { type: "chore", description: "tidy", date: "15112026" } });
  });

  it("prints one JSON object for an invalid name and still exits 1", () => {
    const { status, stdout, stderr } = cratylus(["branch", "chore/tidy-31022026", "--json"]);
    assert.equal(status, 1);
    assert.equal(stderr, "");
    const result = JSON.parse(stdout);
    assert.equal(result.valid, false);
    assert.match(result.reasons[0], /not a real calendar date/);
  });

  describe("current branch", () => {
    const repo = fs.mkdtempSync(path.join(scratch, "repo-"));
    git(repo, "init", "-q", "-b", "feat/107-refund-rounding");

    it("checks the branch git reports", () => {
      const { status, stdout } = cratylus(["branch"], { cwd: repo });
      assert.equal(status, 0);
      assert.equal(stdout, "valid: feat/107-refund-rounding\n");
    });

    it("fails clearly on a detached HEAD", () => {
      git(repo, "commit", "-q", "--allow-empty", "-m", "x");
      git(repo, "checkout", "-q", "--detach");
      const { status, stderr } = cratylus(["branch"], { cwd: repo });
      assert.equal(status, 1);
      assert.match(stderr, /^cratylus: HEAD is detached/);
    });

    it("fails clearly outside a repository", () => {
      const { status, stderr } = cratylus(["branch"], { cwd: fs.mkdtempSync(path.join(scratch, "bare-")), env: { GIT_CEILING_DIRECTORIES: scratch } });
      assert.equal(status, 1);
      assert.match(stderr, /^cratylus: Could not read the current branch/);
    });
  });
});

describe("name", () => {
  const today = new Date();
  const dated = `${String(today.getDate()).padStart(2, "0")}${String(today.getMonth() + 1).padStart(2, "0")}${today.getFullYear()}`;

  it("prints a ticket name", () => {
    const { status, stdout } = cratylus(["name", "--type", "feat", "--ticket", "T2DV-74", "--title", "Cancel endpoint", "-c", tracker]);
    assert.equal(status, 0);
    assert.equal(stdout, "feat/t2dv-74-cancel-endpoint\n");
  });

  it("prints a dated name for today", () => {
    const { stdout } = cratylus(["name", "--type", "chore", "--title", "Upgrade dependencies"]);
    assert.equal(stdout, `chore/upgrade-dependencies-${dated}\n`);
  });

  it("prints JSON", () => {
    const { stdout } = cratylus(["name", "--type", "chore", "--title", "Tidy", "--json"]);
    assert.deepEqual(JSON.parse(stdout), { name: `chore/tidy-${dated}` });
  });

  it("fails without a ticket for a required type", () => {
    const { status, stdout, stderr } = cratylus(["name", "--type", "fix", "--title", "Refund"]);
    assert.equal(status, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /^cratylus: A ticket id is required for fix branches/);
  });

  it("fails without --type or --title", () => {
    assert.match(cratylus(["name", "--title", "x"]).stderr, /name needs --type and --title/);
    assert.match(cratylus(["name", "--type", "chore"]).stderr, /name needs --type and --title/);
  });
});

describe("refs", () => {
  const text = "Closes #107\n\n`Closes #1`\n\ncloses: 108 and 109\n";

  it("reads stdin", () => {
    const { status, stdout } = cratylus(["refs"], { input: text });
    assert.equal(status, 0);
    assert.equal(stdout, "107\n108\n109\n");
  });

  it("reads a file", () => {
    const { status, stdout } = cratylus(["refs", write("body.md", text)]);
    assert.equal(status, 0);
    assert.equal(stdout, "107\n108\n109\n");
  });

  it("uses the configured ticket pattern", () => {
    const { stdout } = cratylus(["refs", "-c", tracker], { input: "Closes T2DV-74, #107" });
    assert.equal(stdout, "T2DV-74\n");
  });

  it("prints nothing and exits 0 when there are none", () => {
    const { status, stdout } = cratylus(["refs"], { input: "Fixes #1" });
    assert.equal(status, 0);
    assert.equal(stdout, "");
  });

  it("prints JSON", () => {
    assert.deepEqual(JSON.parse(cratylus(["refs", "--json"], { input: text }).stdout), { ids: ["107", "108", "109"] });
  });

  it("fails on a missing file", () => {
    const { status, stderr } = cratylus(["refs", path.join(scratch, "nope.md")]);
    assert.equal(status, 1);
    assert.match(stderr, /^cratylus: ENOENT/);
  });
});

describe("pr with flags", () => {
  const body = write("pr-body.md", "Adds refunds.\n\nCloses #107\n");
  const empty = write("pr-empty.md", "<!-- Closes #1 -->\n");

  it("passes on a reference in the body file", () => {
    const { status, stdout } = cratylus(["pr", "--title", "Add refunds", "--body-file", body]);
    assert.equal(status, 0);
    assert.equal(stdout, "ok: references 107\n");
  });

  it("passes on a reference in the title", () => {
    const { status } = cratylus(["pr", "--title", "Closes #5"]);
    assert.equal(status, 0);
  });

  it("passes on the label", () => {
    const { status, stdout } = cratylus(["pr", "--title", "Tidy", "--label", "bug", "--label", "no-ticket"]);
    assert.equal(status, 0);
    assert.equal(stdout, "ok: labelled no-ticket, no ticket needed\n");
  });

  it("passes a bot", () => {
    const { status, stdout } = cratylus(["pr", "--title", "Bump x", "--bot"]);
    assert.equal(status, 0);
    assert.equal(stdout, "ok: bot author, no ticket needed\n");
  });

  it("fails with the fix on stderr", () => {
    const { status, stdout, stderr } = cratylus(["pr", "--title", "Tidy", "--body-file", empty]);
    assert.equal(status, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /^cratylus: This pull request names no ticket\. Add a line such as "Closes <id>"/);
  });

  it("prints JSON on success and on failure", () => {
    const pass = cratylus(["pr", "--title", "Closes #5", "--json"]);
    assert.equal(pass.status, 0);
    assert.deepEqual(JSON.parse(pass.stdout), { ok: true, reason: "ticket", ids: ["5"] });
    const fail = cratylus(["pr", "--title", "Tidy", "--json"]);
    assert.equal(fail.status, 1);
    assert.equal(fail.stderr, "");
    assert.equal(JSON.parse(fail.stdout).ok, false);
  });

  it("fails on a missing body file", () => {
    assert.equal(cratylus(["pr", "--title", "x", "--body-file", path.join(scratch, "nope.md")]).status, 1);
  });
});

describe("pr with an event payload", () => {
  it("reads the file named by --event", () => {
    const { status, stdout } = cratylus(["pr", "--event", EVENT]);
    assert.equal(status, 0);
    assert.equal(stdout, "ok: references 107\n");
  });

  it("reads $GITHUB_EVENT_PATH when no flags are given", () => {
    const { status, stdout } = cratylus(["pr"], { env: { GITHUB_EVENT_PATH: EVENT } });
    assert.equal(status, 0);
    assert.equal(stdout, "ok: references 107\n");
  });

  it("lets --title and --body-file replace the payload's", () => {
    const { status } = cratylus(["pr", "--event", EVENT, "--title", "Tidy", "--body-file", write("blank.md", "")]);
    assert.equal(status, 1);
  });

  it("adds --label to the payload's labels", () => {
    const file = write("unlinked.json", JSON.stringify({ pull_request: { title: "Tidy", body: null, labels: [{ name: "bug" }], user: { type: "User" } } }));
    assert.equal(cratylus(["pr", "--event", file]).status, 1);
    assert.equal(cratylus(["pr", "--event", file, "--label", "no-ticket"]).status, 0);
  });

  it("passes a bot payload", () => {
    const file = write("bot.json", JSON.stringify({ pull_request: { title: "Bump x", body: null, labels: [], user: { type: "Bot" } } }));
    assert.equal(cratylus(["pr", "--event", file, "--json"]).stdout.includes('"reason": "bot"'), true);
  });

  it("fails on a payload with a null body and nothing else", () => {
    const file = write("null-body.json", JSON.stringify({ pull_request: { title: "Tidy", body: null, labels: [], user: { type: "User" } } }));
    assert.equal(cratylus(["pr", "--event", file]).status, 1);
  });

  it("fails clearly when there is no pull_request", () => {
    const file = write("push.json", JSON.stringify({ ref: "refs/heads/main" }));
    const { status, stderr } = cratylus(["pr", "--event", file]);
    assert.equal(status, 1);
    assert.match(stderr, /^cratylus: .*push\.json: has no pull_request/);
  });

  it("fails clearly on a payload that is not JSON", () => {
    const { status, stderr } = cratylus(["pr", "--event", write("junk.json", "{")]);
    assert.equal(status, 1);
    assert.match(stderr, /junk\.json: /);
  });

  it("fails clearly with neither flags nor a payload", () => {
    const { status, stderr } = cratylus(["pr"]);
    assert.equal(status, 1);
    assert.match(stderr, /^cratylus: No pull request to check\. Pass --title, --body-file or --event/);
  });
});
