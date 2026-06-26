# Quickstart: /cockpit:clarify

**Feature**: `353-epic-generacy-ai-tetrad`
**Date**: 2026-06-26

## Prerequisites

| Tool | Why | How to verify |
|------|-----|---------------|
| Claude Code with the `cockpit` plugin installed | Runs the verb | `/cockpit:` namespace shows in the command palette |
| `gh` CLI, authenticated | Posts the marker comment | `gh auth status` shows the target repo |
| `generacy` CLI on `$PATH` | Calls `clarify-context` + `advance` | `generacy cockpit --help` lists `clarify-context` and `advance` |
| A child issue with ≥1 pending clarification question on `clarifications.md` (and posted to the issue) | Gives the verb something to draft against | `gh issue view <n>` shows pending questions, or `clarifications.md` has `*Pending*` entries |

## Install

The verb ships inside the existing `claude-plugin-cockpit` plugin (scaffolded in #350). No new install is needed if the cockpit plugin is already registered. To register the cockpit plugin from scratch:

1. In Claude Code settings, ensure `extraKnownMarketplaces` includes `"generacy-ai/agency"`:
   ```json
   { "extraKnownMarketplaces": ["generacy-ai/agency"] }
   ```
2. Install the `cockpit` plugin from the generacy marketplace.
3. Confirm `/cockpit:clarify` appears in the command palette.

## Usage

### Happy path: approve all, gate advances

```text
/cockpit:clarify 353
```

What happens:
1. Verb resolves issue `#353` from `$ARGUMENTS`.
2. Calls `generacy cockpit clarify-context --issue 353` → receives 5 open questions.
3. Drafts 5 answers, citing `spec.md` / `plan.md` / file references.
4. Presents drafts. You reply "approve all".
5. Verb posts one comment to `#353` with the canonical marker on line 1.
6. Verb invokes `generacy cockpit advance --gate clarification --issue 353`.
7. Verb reports: `posted 5 answers; clarification gate advanced for issue #353`.

### Partial approval: post, no advance

```text
/cockpit:clarify 353
```

Then in the approval step, approve 3 of 5 questions, reject 1, skip 1.

What happens:
1. Verb posts a comment containing only the 3 approved answers.
2. Verb does NOT call `generacy cockpit advance` (2 questions remain pending).
3. Verb reports: `posted 3 answers; 2 questions still pending (Q2 rejected, Q4 skipped); gate not advanced. Re-run /cockpit:clarify 353 after they are resolved.`

### On a feature branch with no $ARGUMENTS

When the current branch is `353-epic-generacy-ai-tetrad`:

```text
/cockpit:clarify
```

The verb extracts `353` from the branch name and proceeds as above.

### Off-branch with no $ARGUMENTS

When the current branch is `main` and no argument is passed:

```text
/cockpit:clarify
```

Verb exits non-zero:

```
no child issue resolvable; pass --issue <n>
```

## Available Commands

This issue adds one command:

| Command | Args | Description |
|---------|------|-------------|
| `/cockpit:clarify` | `[issue]` (optional) | Draft, present, approve, post, and conditionally advance clarification answers for a child issue. |

## Troubleshooting

### "gh: command not found"

Install GitHub's CLI from <https://cli.github.com/> and run `gh auth login`. `gh` is a hard runtime dependency of this verb (D5 / clarification Q5).

### "generacy: command not found"

The `generacy` CLI must be on `$PATH`. If you're developing locally without a release build, alias it to your built binary or add it to `$PATH`. The verb does not bundle or shell-detect alternative paths.

### "no child issue resolvable; pass --issue <n>"

You ran the verb on a non-`###-*` branch (e.g., `main`, a personal branch) and didn't supply an explicit issue. Either check out the feature branch or invoke as `/cockpit:clarify <n>`.

### Marker comment not detected by resume tooling

Verify the posted comment's first line is exactly `<!-- generacy-cockpit:clarification-answers -->` (no leading whitespace, no rewrap). If `gh` mangled it, this is a posting-transport bug; check that the verb used `--body-file` rather than `-b "…"`.

### Gate advanced but a question was still pending

Should not happen. The verb only calls `advance` when every `OpenQuestion` from the current run has a verdict ∈ {`approved`, `edited`}. If observed, capture the verb's output and the issue's comment + label state, then file as a bug — likely a parsing mismatch with `clarify-context` output (see `contracts/cockpit-clarify-context.md`).

### Draft says `_no draft — insufficient context_`

The agent could not ground an answer in `spec.md`, `plan.md`, or repo files (D4 / clarification Q4). Edit the answer manually during the approval step before approving it, or skip the question and address it in a follow-up commit.

### `clarify-context` returned no questions

The verb exits 0 with `no open clarification questions for issue #<n>`. Either the questions were already answered (check the comment history), or the issue has not had clarifications generated yet — run `/speckit:clarify` first.

## Verifying Locally

To validate the verb's behavior end-to-end:

1. On a feature branch with ≥1 pending question on the corresponding issue, run `/cockpit:clarify <n>`.
2. Verify the posted comment with:
   ```bash
   gh issue view <n> --json comments \
     | jq '.comments[-1].body' \
     | head -1
   ```
   Expected output (literal, as a JSON string): `"<!-- generacy-cockpit:clarification-answers -->\n"`.
3. If you approved all questions, verify the gate state advanced:
   ```bash
   generacy cockpit status --issue <n>
   ```
   (Substitute the documented G1.2 status verb if the name differs.)
