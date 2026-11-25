# cratylus

Named after the philosopher in Plato's dialogue on naming, who held that every thing has one correct name. Cratylus holds one naming convention for branches and for the way a pull request names its ticket, so a git hook, a CI check and a tracker sync all read the same rules.

It is pure text processing. It makes no network calls, and git is used only to read the current branch name. A pre-push hook hands it the pushed refs on stdin.

- Checks a branch name, and says what is wrong with it in sentences a developer can act on.
- Builds a branch name from a type, a ticket id and a title.
- Finds the tickets a pull request closes, from an explicit keyword such as `Closes <id>` and nothing else.
- Checks that a pull request names a ticket, or carries the label that says it has none.

## Install

```sh
pnpm add -D @tandemcreativedev/cratylus
```

It needs Node 20 or later and has no runtime dependencies.

## Use

```sh
pnpm cratylus init        # writes a starter cratylus.config.json (or the file given with -c)
```

Check a branch name. With no name it checks the current branch, and exits 1 if the name is invalid. Put the name after `--`, and any options before it, so that a name starting with `-` is read as a name and not as a flag:

```sh
$ pnpm cratylus branch -- fix/107-refund-rounding
valid: fix/107-refund-rounding
$ pnpm cratylus branch -- feat/cancel-endpoint-15112026
cratylus: invalid branch name "feat/cancel-endpoint-15112026"
  - feat branches need a ticket id right after the slash, as feat/<ticket>-<description>, with a ticket matching /\d+/. A date suffix is not accepted for feat.
$ pnpm cratylus branch -- main      # with "ignore": ["main"]
ignored: main
```

Check every branch a push sends, from the lines git gives a pre-push hook on stdin (`<local ref> <local sha> <remote ref> <remote sha>`). It checks the remote branch name, so `git push origin HEAD:other` checks `other`. Deletes, tags and other refs are skipped, and so are the arguments git passes to the hook. It exits 1 if any branch is invalid:

```sh
$ printf 'HEAD %s refs/heads/fix/107-x %s\n' "$(git rev-parse HEAD)" 0000000000000000000000000000000000000000 | pnpm cratylus pre-push
valid: fix/107-x
```

These examples use the default `ticket` pattern, which is `\d+`. Set `ticket` in the config for ids such as `t2dv-74`.

Print the name for a piece of work. The date is today:

```sh
$ pnpm cratylus name --type fix --ticket 107 --title "Refund rounding"
fix/107-refund-rounding
$ pnpm cratylus name --type chore --title "Upgrade dependencies"
chore/upgrade-dependencies-22112026
```

Print the ticket ids a text closes, one per line. It reads a file, or stdin when there is none, and exits 0 even when it finds nothing:

```sh
$ printf 'Closes #107\nCloses: 108 and 109\n' | pnpm cratylus refs
107
108
109
```

Check that a pull request names a ticket. It exits 1 if it does not:

```sh
$ printf 'Closes #107\n' > body.md
$ pnpm cratylus pr --title "Round refunds" --body-file body.md
ok: references 107
$ pnpm cratylus pr --title "Tidy imports" --label no-ticket
ok: labelled no-ticket, no ticket needed
```

`--branch <name>` gives the head branch, which `matchBranchTicket` compares with the references. A payload gives it as `pull_request.head.ref`, and `--branch` replaces that.

With no `--title`, `--body-file` or `--event`, `pr` reads the GitHub event payload at `$GITHUB_EVENT_PATH`. `--event <file>` names a payload explicitly. `--title` and `--body-file` replace what the payload says, and `--label` and `--bot` add to it. With `--title` or `--body-file` and no `--event`, no payload is read. `--label` and `--bot` use `$GITHUB_EVENT_PATH` as the payload when it names a file, and otherwise decide on their own, so `pr --label no-ticket` and `pr --bot` are enough by themselves.

### Options

| Flag | Meaning |
| --- | --- |
| `-c, --config <file>` | Config file. Defaults to `cratylus.config.json` if present. |
| `--json` | Print the result as one JSON object and nothing else on stdout. A failed check still exits 1. An error that is not a check result prints `{ "error": "<message>" }` on stdout, with nothing on stderr and exit code 1. |
| `--type <type>` | `name`: the branch type. |
| `--ticket <id>` | `name`: the ticket id. Left out for work with no ticket. |
| `--title <text>` | `name`: the title to make the description from. `pr`: the pull request title. |
| `--body-file <file>` | `pr`: a file holding the pull request description. |
| `--label <label>` | `pr`: a label on the pull request. Repeat for several. |
| `--bot` | `pr`: the author is a bot. |
| `--branch <name>` | `pr`: the head branch. |
| `--event <file>` | `pr`: a GitHub event payload. |

Errors print as `cratylus: <message>` on stderr and exit 1. An unexpected extra argument is an error.

## The convention

A branch name takes one of two forms, all in lower case:

| Form | Pattern | Example |
| --- | --- | --- |
| With a ticket | `<type>/<ticket id>-<short description>` | `feat/t2dv-74-cancel-endpoint`, `fix/107-refund-rounding` |
| Without one | `<type>/<short description>-<DDMMYYYY>` | `chore/upgrade-dependencies-15112026` |

| Part | Rule |
| --- | --- |
| Type | One of `types`. |
| Ticket id | Matches `ticket`. Required directly after the slash for the types in `ticketRequired`, where the dated form is not accepted. Optional for the rest. |
| Description | One or more runs of `a-z` and `0-9` joined by single hyphens. |
| Date | Only when there is no ticket id. The day the branch is cut, as `DDMMYYYY`: a real calendar date, no earlier than 1 January 2000 and no later than tomorrow, which leaves room for time zones. |

A name that matches one of the `ignore` globs passes without being examined, with the result `{ valid: true, ignored: true }`. Use it for `main`, the `revert-<n>-<branch>` names GitHub's Revert button makes, and branches made by tools. Ignored names apply to `branch` and `pre-push`, not to `pr`.

When a ticket id matches the pattern only in part, as `proj-12b` does for `proj-\d+`, the reasons point at the part that matched.

A name that fits both forms, such as `chore/2024-update-15112026` when `ticket` is `\d+`, is read as having a ticket: the ticket form wins, and the ticket is `2024`. So `name` refuses to build a dated name whose title starts with something that reads as a ticket id. Pass it as `--ticket`, or reword the title. `name` also refuses a `--ticket` that does not match the pattern in full, or that would read back from the built name as a different ticket, so the names it builds always read back as intended.

When `name` builds a branch name, it turns the title into a description by lower-casing it, stripping accents, turning every run of other characters into one hyphen and keeping the first five words. Letters with no decomposition into a base letter and an accent, such as `ø`, become hyphens.

A pull request links to a ticket only through an explicit keyword, `Closes <id>` by default, in its title or description:

| Rule | Detail |
| --- | --- |
| Keyword | One of `keywords`, `closes` by default, in any case, as a whole word that does not follow a word character or a hyphen, so `un-closes 107` is not a reference. A keyword straight after `not`, `never`, `no` or a word ending in `n't` is not one either, so `Not closes: #5` and `doesn't close #5` link nothing. A bare id and an id in a branch name are not references. |
| Ids | After an optional colon, one or more ids separated by commas or `and`. Each may start with `#`, with `owner/repo#`, or with an issue URL such as `https://github.com/owner/repo/issues/`; the id is what follows. Each must match `refTicket` in full and not run on into more word characters or a hyphen, so `Closes 107abc` and `Closes #238-foo` are not references. |
| Ignored | Anything inside a fenced code block, an indented code block, an inline code span or an HTML comment. Documentation that describes the syntax links nothing. The text is scanned once from left to right, and whichever construct opens first wins, so a `<!--` inside a code span or a fence inside a comment does not hide what follows. An unclosed `<!--` hides the rest of the text only when it starts a line; in the middle of a line it is plain text. A paragraph indented under a list item is list content, not code. A fence line always ends an inline code span that began above it. |
| Spacing | The space after `closes` is optional, so `Closes#107` is a reference. The title and the description are scanned separately, so an unclosed comment or code span in one cannot hide a reference in the other. Line endings may be LF or CRLF. |
| Result | Ids in the order found, without the `#`, de-duplicated without regard to case, each in the casing it was first written. |

The pull request check passes in this order:

| Reason | When |
| --- | --- |
| `bot` | The author is a bot. |
| `label` | The pull request carries `noTicketLabel`. |
| `ticket` | It has one or more references, and with `matchBranchTicket` one of them is the head branch's ticket. |

Otherwise it fails with one message: add a `Closes <id>` line to the description (with the first of `keywords`), or add the label if the change has no ticket. With `matchBranchTicket`, a pull request whose references leave out its branch's ticket fails with a message naming that ticket. A branch with no ticket, or one that is invalid or ignored, adds no requirement.

## Config

`cratylus.config.json`, with every field optional. Unknown fields are rejected, apart from `$schema`.

| Field | Default | Meaning |
| --- | --- | --- |
| `ticket` | `"\\d+"` | Regular expression source for one ticket id, such as `t2dv-\\d+`. Matched without regard to case, inside a longer expression. A pattern is rejected if it does not compile, matches the empty string, has a capture group (write `(?:...)` instead) or starts with `^` or ends with `$`. An empty match is never a ticket id. Alternation such as `t2dv-\\d+\|\\d+` is fine. |
| `branchTicket` | `ticket` | The ticket pattern for branch names and `name`, with the same rules. |
| `refTicket` | `ticket` | The ticket pattern for pull request references, with the same rules. Set it to `"\\d+"` when branches carry a roadmap id but GitHub closes issues by number, so `Closes proj-12` does not pass though GitHub links nothing. |
| `keywords` | `["closes"]` | Words that introduce a reference, each a single word of letters. GitHub closes issues on `close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolves` and `resolved`. |
| `types` | `["feat", "fix", "refactor", "perf", "docs", "test", "chore", "build", "ci"]` | Allowed branch types. |
| `ticketRequired` | `["feat", "fix", "refactor", "perf"]` | Types whose branch must carry a ticket id. Every entry must be in `types`. |
| `noTicketLabel` | `"no-ticket"` | Pull request label that clears the ticket requirement. |
| `ignore` | `[]` | Globs for branch names that pass unexamined, such as `["main", "revert-*", "dependabot/*", "release-please--*"]`. A glob matches the whole name. `*` matches any run of characters, slashes included, and `?` any one character. Matched with regard to case. |
| `matchBranchTicket` | `false` | Require the pull request's references to include the head branch's ticket when it has one. Only useful when branches and references use the same ids. |

The reference scanner is an approximation of Markdown, not a parser. It does not model code indented inside a list item or straight after a heading or a thematic break (both are read as text, so a `Closes` there links), or the comment forms `<!-->` and `<!--->`. An unclosed fence inside a blockquote or a list item runs to the end of the description, so `> ```\n> Closes 1\nCloses 2` and `- ```\nCloses 1` find nothing. A fence behind `- > ` is not recognised. A stray backtick on the line directly above a heading or a list item can hide a reference in that block when the block also contains a backtick.

## In a hook and in CI

Check every branch a push sends with `pre-push`, which reads the refs git gives the hook on stdin. With [lefthook](https://github.com/evilmartians/lefthook), pass stdin through:

```yaml
# lefthook.yml
pre-push:
  commands:
    branch-name:
      run: pnpm cratylus pre-push
      use_stdin: true
```

Or with husky:

```sh
# .husky/pre-push
pnpm exec cratylus pre-push
```

Checking the current branch with `cratylus branch` in a hook is wrong for `git push origin HEAD:other`, pushes of several refs, deletes and a detached HEAD.

Or check it in CI, where the branch is the head of a pull request. A checkout of a pull request is detached, so pass the name, after `--`:

```yaml
- run: pnpm cratylus branch -- "$BRANCH"
  env:
    BRANCH: ${{ github.head_ref }}
```

Check that every pull request names a ticket. Include `labeled` and `unlabeled` so that adding the label re-runs the check:

```yaml
name: Pull request
on:
  pull_request:
    types: [opened, edited, reopened, synchronize, labeled, unlabeled]

jobs:
  ticket:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm cratylus pr
```

`pr` reads the event payload that GitHub provides, so it needs no arguments.

## Programmatic use

```ts
import { buildBranchName, checkPullRequest, extractRefs, resolveConfig, validateBranch } from "@tandemcreativedev/cratylus";

const config = resolveConfig({ ticket: "t2dv-\\d+" });

validateBranch("feat/t2dv-74-cancel-endpoint", config);
// { valid: true, parts: { type: "feat", ticket: "t2dv-74", description: "cancel-endpoint" } }

buildBranchName({ type: "fix", ticket: "T2DV-107", title: "Refund rounding", date: new Date() }, config);
// "fix/t2dv-107-refund-rounding"

extractRefs(["Closes T2DV-74 and T2DV-75"], config);
// ["T2DV-74", "T2DV-75"]

checkPullRequest({ title: "Round refunds", body: null, labels: [], bot: false }, config);
// { ok: false, message: "This pull request names no ticket. ..." }
```

`slugify`, `isRealDate`, `matchesGlob`, `pushedBranches`, `branchTicket`, `refTicket`, `parsePullRequestEvent` and `loadConfig` are exported too. `validateBranch` takes an optional third argument, the day to check a date against, which defaults to today. Every rule is a pure function. Only the command line reads files, stdin and the current branch.

## Releasing

Releases are cut by [release-please](https://github.com/googleapis/release-please) from conventional commit messages. Each push to `main` updates a release pull request that bumps the version in `package.json` and adds the changes to `CHANGELOG.md`. Merging that pull request tags the release and publishes it to npm through trusted publishing, with no token stored in the repo. While the version is 0.x, breaking changes bump the minor version.

## Development

```sh
pnpm typecheck
pnpm test        # runs the TypeScript files directly with node:test
pnpm build       # compiles to dist
```

The command line tests run `src/cli.ts` as a child process, using a payload in `test/fixtures` for the pull request check.
