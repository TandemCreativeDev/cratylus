# cratylus

Named after the philosopher in Plato's dialogue on naming, who held that every thing has one correct name. Cratylus holds one naming convention for branches and for the way a pull request names its ticket, so a git hook, a CI check and a tracker sync all read the same rules.

It is pure text processing. It makes no network calls, and git is used only to read the current branch name.

- Checks a branch name, and says what is wrong with it in sentences a developer can act on.
- Builds a branch name from a type, a ticket id and a title.
- Finds the tickets a pull request closes, from an explicit `Closes <id>` and nothing else.
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

Check a branch name. With no name it checks the current branch, and exits 1 if the name is invalid:

```sh
$ pnpm cratylus branch feat/t2dv-74-cancel-endpoint
valid: feat/t2dv-74-cancel-endpoint
$ pnpm cratylus branch feat/cancel-endpoint-15112026
cratylus: invalid branch name "feat/cancel-endpoint-15112026"
  - feat branches need a ticket id right after the slash, ...
```

Print the name for a piece of work. The date is today:

```sh
$ pnpm cratylus name --type feat --ticket T2DV-74 --title "Cancel endpoint"
feat/t2dv-74-cancel-endpoint
$ pnpm cratylus name --type chore --title "Upgrade dependencies"
chore/upgrade-dependencies-22112026
```

Print the ticket ids a text closes, one per line. It reads a file, or stdin when there is none:

```sh
$ printf 'Closes #107\nCloses: 108 and 109\n' | pnpm cratylus refs
107
108
109
```

Check that a pull request names a ticket. It exits 1 if it does not:

```sh
$ pnpm cratylus pr --title "Round refunds" --body-file body.md
ok: references 107
$ pnpm cratylus pr --title "Tidy imports" --label no-ticket
ok: labelled no-ticket, no ticket needed
```

With no `--title`, `--body-file` or `--event`, `pr` reads the GitHub event payload at `$GITHUB_EVENT_PATH`. `--event <file>` names a payload explicitly. With `--event`, `--title` and `--body-file` replace what the payload says, and `--label` and `--bot` add to it. `--title`, `--body-file`, `--label` or `--bot` on their own, with no `--event`, decide without reading a payload, so `pr --label no-ticket` and `pr --bot` are enough by themselves.

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
| Date | Only when there is no ticket id. The day the branch is cut, as `DDMMYYYY`, and a real calendar date. |

A name that fits both forms, such as `chore/2024-update-15112026` when `ticket` is `\d+`, is read as having a ticket: the ticket form wins, and the ticket is `2024`. So `name` refuses to build a dated name whose title starts with something that reads as a ticket id. Pass it as `--ticket`, or reword the title.

When `name` builds a branch name, it turns the title into a description by lower-casing it, stripping accents, turning every run of other characters into one hyphen and keeping the first five words.

A pull request links to a ticket only through an explicit `Closes <id>` in its title or description:

| Rule | Detail |
| --- | --- |
| Keyword | `closes`, in any case, as a whole word that does not follow a word character or a hyphen, so `un-closes 107` is not a reference. `fixes`, `resolves`, a bare id and an id in a branch name are not references. |
| Ids | After an optional colon, one or more ids separated by commas or `and`. Each may start with `#`. Each must match `ticket` in full and not run on into more word characters, so `Closes 107abc` is not a reference. |
| Ignored | Anything inside a fenced code block, an indented code block, an inline code span or an HTML comment. Documentation that describes the syntax links nothing. The text is scanned once from left to right, and whichever construct opens first wins, so a `<!--` inside a code span or a fence inside a comment does not hide what follows. An unclosed `<!--` hides the rest of the text only when it starts a line; in the middle of a line it is plain text. A paragraph indented under a list item is list content, not code. |
| Result | Ids in the order found, without the `#`, de-duplicated without regard to case, each in the casing it was first written. |

The pull request check passes in this order:

| Reason | When |
| --- | --- |
| `bot` | The author is a bot. |
| `label` | The pull request carries `noTicketLabel`. |
| `ticket` | It has one or more references. |

Otherwise it fails with one message: add a `Closes <id>` line to the description, or add the label if the change has no ticket.

## Config

`cratylus.config.json`, with every field optional. Unknown fields are rejected, apart from `$schema`.

| Field | Default | Meaning |
| --- | --- | --- |
| `ticket` | `"\\d+"` | Regular expression source for one ticket id, such as `t2dv-\\d+`. Matched without regard to case, inside a longer expression. A pattern is rejected if it does not compile, can match the empty string, has a capture group (write `(?:...)` instead) or starts with `^` or ends with `$`. Alternation such as `t2dv-\\d+\|\\d+` is fine. |
| `types` | `["feat", "fix", "refactor", "perf", "docs", "test", "chore", "build", "ci"]` | Allowed branch types. |
| `ticketRequired` | `["feat", "fix", "refactor", "perf"]` | Types whose branch must carry a ticket id. Every entry must be in `types`. |
| `noTicketLabel` | `"no-ticket"` | Pull request label that clears the ticket requirement. |

## In a hook and in CI

Check the branch name before every push with [lefthook](https://github.com/evilmartians/lefthook):

```yaml
# lefthook.yml
pre-push:
  commands:
    branch-name:
      run: pnpm cratylus branch
```

Or check it in CI, where the branch is the head of a pull request. A checkout of a pull request is detached, so pass the name:

```yaml
- run: pnpm cratylus branch "$BRANCH"
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

`slugify`, `isRealDate`, `parsePullRequestEvent` and `loadConfig` are exported too. Every rule is a pure function. Only the command line reads files, stdin and the current branch.

## Releasing

Releases are cut by [release-please](https://github.com/googleapis/release-please) from conventional commit messages. Each push to `main` updates a release pull request that bumps the version in `package.json` and adds the changes to `CHANGELOG.md`. Merging that pull request tags the release and publishes it to npm through trusted publishing, with no token stored in the repo. While the version is 0.x, breaking changes bump the minor version.

## Development

```sh
pnpm typecheck
pnpm test        # runs the TypeScript files directly with node:test
pnpm build       # compiles to dist
```

The command line tests run `src/cli.ts` as a child process, using a payload in `test/fixtures` for the pull request check.
