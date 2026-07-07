# Contract: `MISSING_BINARY` remedy payload string

**Feature**: 378-found-during-cockpit-v1
**Status**: Complete
**Kind**: Text-content contract (no runtime API surface). See [../plan.md](../plan.md) for why this is the only contract.

## The payload string

The following single-line string is the byte-identical payload that MUST appear in all seven files listed in §Anchor points below. Copy-paste this exact string — do not retype, do not "improve" whitespace, do not change punctuation, do not swap smart quotes:

```
The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: `export PATH="/shared-packages/node_modules/.bin:$PATH"` (persist it in ~/.bashrc). Standalone: install it with `npm install -g @generacy-ai/generacy`.
```

Notes on the exact form:

- **One physical line, no newlines.** The command files inline this after `Print:` inside a Markdown list item; a newline breaks that structure. FR-005 enforces this.
- **Em dash (`—`, U+2014)**, not two hyphens (`--`) and not an en dash (`–`, U+2013). Matches the plugin's existing prose style in the surrounding blocks.
- **ASCII double quotes** around the `export PATH` value (`"..."`), because the string ships inside `.md` files that end users copy from a rendered code span into a shell where curly quotes would fail parsing.
- **Inline backtick spans**, not fenced code blocks, around the two copy-pasteable commands. The command files inline the payload on one line and cannot contain a fence; using backtick spans keeps the payload identical across README and command files even though README's surrounding block is a fence. Clarifications Q1 pinned the inline-backtick decision.
- **Trailing period after `@generacy-ai/generacy`.** Matches the plugin's other Error Handling copy (see `AUTH_FAILURE` remedy).

## Anchor points (seven files)

The payload string MUST appear once in each of the following files. The surrounding presentation differs (see §Surrounding presentation) but the payload text is identical.

| # | File | Location within file |
|---|------|----------------------|
| 1 | `packages/claude-plugin-cockpit/README.md` | § Error Handling → `MISSING_BINARY` bullet → fenced code block content (replace the current fenced block's content with the payload string). |
| 2 | `packages/claude-plugin-cockpit/commands/clarify.md` | Error handling list → `MISSING_BINARY` bullet → after `Print: ` on the same line. |
| 3 | `packages/claude-plugin-cockpit/commands/merge.md` | Same as clarify.md. |
| 4 | `packages/claude-plugin-cockpit/commands/queue.md` | Same as clarify.md. |
| 5 | `packages/claude-plugin-cockpit/commands/review.md` | Same as clarify.md. |
| 6 | `packages/claude-plugin-cockpit/commands/status.md` | Same as clarify.md. |
| 7 | `packages/claude-plugin-cockpit/commands/watch.md` | Same as clarify.md. |

## Surrounding presentation (kept as-is per clarifications Q3)

- **README.md** — the `MISSING_BINARY` bullet's fenced code block wraps the payload. The payload's inline backticks (around `export PATH="..."` and `npm install -g @generacy-ai/generacy`) render as literal backticks inside the fence. That is acceptable — the payload is still readable and copy-pasteable, and switching the README to inline formatting would diverge from the surrounding `AUTH_FAILURE` and `OTHER` blocks which also use fenced code. Do not change the fence.
- **commands/*.md** — the payload appears after `Print: ` on a single Markdown list item line. The payload's inline backticks render as inline code spans, which is the intended rendering for the primary audience (Claude Code + terminal).

## Second-site fix (README § Installation, line 24)

Independently of the seven-file payload, the README's § Installation "Runtime dependencies" bullet at line 24 currently reads:

```markdown
- `generacy` CLI (`npm install -g @generacy-ai/cli` or the prevailing install command).
```

Replace with:

```markdown
- `generacy` CLI (`npm install -g @generacy-ai/generacy` or the prevailing install command). See § Error Handling / `MISSING_BINARY` for the cluster-session PATH remedy.
```

Rationale: FR-003 requires (a) fixing the wrong package name on this line and (b) adding a one-line cross-reference to the canonical Error Handling block so cluster users skimming §Installation see the pointer. The cluster remedy itself is deliberately NOT restated here — a second copy would immediately create a new drift site.

## Verification queries

Run from the repo root after applying the fix:

```bash
# SC-001 / FR-004: the wrong package name is gone from the package.
grep -r "@generacy-ai/cli" packages/claude-plugin-cockpit/ && echo "FAIL: wrong package name still present" || echo "OK"

# SC-002: the distinctive fragment of the new payload appears exactly seven times
# (one README + six commands).
[ "$(grep -rc "In a Generacy cluster session it is already installed" packages/claude-plugin-cockpit/ | awk -F: '{s+=$2} END {print s}')" = "7" ] \
  && echo "OK" || echo "FAIL: expected 7 hits"

# US3: the payload string is byte-identical across all seven files.
grep -rho "The generacy CLI is required but is not on \$PATH\. In a Generacy cluster session[^\`]*generacy\`\." packages/claude-plugin-cockpit/ | sort -u | wc -l
# Expected: 1 (a single unique payload line across all files)
```

If any of the three fails, the fix is incomplete or has drift and MUST be corrected before opening a PR.

## Out of scope for this contract

- The `AUTH_FAILURE` and `OTHER` remedy blocks in the same Error Handling section — their text is correct and is not part of this contract.
- The pre-flight detection logic (`command -v generacy`) — correct as-is.
- Refactoring the seven copies to share a single source — deferred per spec Out of Scope §1.
- Any change to how the generacy CLI is installed inside cluster-base images — tracked at [cluster-base#73](https://github.com/generacy-ai/cluster-base/issues/73).
