# Quickstart: `/cockpit:review`

**Feature**: `/cockpit:review` slash command (A2.4)
**Branch**: `354-epic-generacy-ai-tetrad`
**Date**: 2026-06-26

How to install, invoke, and troubleshoot `/cockpit:review`. For the binding surface (arguments, output schema, error messages), see `contracts/command.md`.

---

## Prerequisites

1. **`cockpit` plugin installed** in your Claude Code environment. The plugin scaffold landed in #350; this command lives at `packages/claude-plugin-cockpit/commands/review.md`.
2. **Sibling cockpit commands installed**:
   - `/cockpit:advance` (G1.2 / #788) — required for any approval that should advance a gate label.
   - `/cockpit:review-context` (G1.3 / #789) — required for `--gate impl`.
3. **Host skill `/code-review`** available (default in Claude Code).
4. **Active git branch** matching the cockpit convention `<issue#>-<slug>`, with a matching directory under `specs/`.

---

## Installation

The plugin is already registered in the generacy marketplace. To install:

1. Add the marketplace to your Claude Code settings if not already present:

   ```json
   {
     "extraKnownMarketplaces": ["generacy-ai/agency"]
   }
   ```

2. Install (or re-install) the `cockpit` plugin from the marketplace.
3. Verify the command shows up:

   ```
   /cockpit:review --help
   ```

   You should see the gate list (`specify`, `clarify`, `plan`, `tasks`, `impl`) and the three modes (`assist`, `auto`, `manual`).

---

## Usage

### Review the `impl` gate (PR diff)

```
/cockpit:review --gate impl
```

What happens (assist mode, default):

1. `/cockpit:review-context` resolves the open PR for the current child issue.
2. `/code-review` runs on the returned diff and emits its summary verbatim.
3. The summary ends with `Suggested decision: approve | request-changes | abort`.
4. `AskUserQuestion` prompts you with three options.
5. On `approve`, `/cockpit:advance --gate impl` runs and reports the `waiting-for:impl` → `completed:impl` label transition.

### Review a non-`impl` artifact gate

```
/cockpit:review --gate specify
/cockpit:review --gate clarify
/cockpit:review --gate plan
/cockpit:review --gate tasks
```

Each reads exactly one file under `specs/<feature>/`:

| Gate | File |
|------|------|
| `specify` | `spec.md` |
| `clarify` | `clarifications.md` |
| `plan` | `plan.md` |
| `tasks` | `tasks.md` |

Output has three H2 sections — `Blockers`, `Open questions`, `Suggested decision` — and ends with the standard final line.

### Run non-interactively (`auto`)

```
/cockpit:review --gate plan --mode auto
```

Emits the summary. If the suggested decision is `approve`, advances the label without prompting. If not, stops with the open items.

### Summary-only (no advance, no prompt)

```
/cockpit:review --gate tasks --mode manual
```

Emits the summary and stops. No `AskUserQuestion`, no `/cockpit:advance`. Useful for getting a fresh read on an artifact without committing to a label change.

---

## Available commands (reference)

| Command | Purpose |
|---------|---------|
| `/cockpit:review --gate <name>` | Review the artifact (or PR, for `impl`) and prompt for advance. |
| `/cockpit:review --gate <name> --mode auto` | Same, but auto-advance when no blockers. |
| `/cockpit:review --gate <name> --mode manual` | Same, but never advance. |
| `/cockpit:review --help` | List supported gates and modes. |

---

## Examples

### Approve the `plan` gate

```
$ /cockpit:review --gate plan
## Blockers
- (none)

## Open questions
- (none)

## Suggested decision
Plan is complete, mirrors the sibling-plugin shape, and has no constitution violations.

Suggested decision: approve

[AskUserQuestion: approve / request-changes / abort]
> approve

Labels: waiting-for:plan → completed:plan on #354
```

### Reject the `clarify` gate

```
$ /cockpit:review --gate clarify
## Blockers
- Q3 still references `gate:<name>` namespace; this contradicts Q4 correction.

## Open questions
- (none)

## Suggested decision
One blocker; needs a clarifications.md edit before advancing.

Suggested decision: request-changes

[AskUserQuestion: approve / request-changes / abort]
> request-changes

(no label changes)
```

### Run `impl` in `auto` mode against a clean PR

```
$ /cockpit:review --gate impl --mode auto
<...verbatim /code-review summary...>
Suggested decision: approve
Labels: waiting-for:impl → completed:impl on #354
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Error: unknown gate '<value>'.` | Typo or unsupported gate. | Use one of: `specify`, `clarify`, `plan`, `tasks`, `impl`. |
| `Error: cannot resolve specs/ directory for branch '<branch>'.` | Branch doesn't follow `<issue#>-<slug>` or no matching `specs/` dir exists. | Check `git rev-parse --abbrev-ref HEAD` and `ls specs/`. |
| `Error: artifact not found at <path>.` | Non-`impl` gate but the file doesn't exist yet. | Run the matching `/speckit:<phase>` command to generate it first. |
| `Error: <verbatim review-context message>` | `--gate impl` but no/multiple/draft PR. | See `/cockpit:review-context` docs (G1.3) for the specific case. |
| `Error: dependency '/cockpit:advance' is not available...` | Cockpit plugin installed but G1.2 verb missing. | Update / re-install the cockpit plugin once G1.2 has landed. |
| Summary emitted but `AskUserQuestion` doesn't appear | Non-interactive environment without prompt primitive. | Use `--mode auto` or `--mode manual` explicitly. |
| Label didn't change after `approve` | `/cockpit:advance` exited with an error (label already present, permissions, etc.) — its message appears in the transcript. | Read the `/cockpit:advance` output; the failure is owned by G1.2. |
| Two `Suggested decision:` lines on `impl` | `/code-review` already emits the line and the implementation appended a second one. | Bug — file an issue; the implementation should reuse the existing line. |

---

## What this command does **not** do

- It does not mutate any GitHub label directly. Every label change goes through `/cockpit:advance`.
- It does not touch `phase:*` labels at all (orchestrator-owned).
- It does not post review summaries as PR comments (use `/code-review --comment` separately).
- It does not look up the PR for `--gate impl` (delegates to `/cockpit:review-context`).
- It does not fetch or summarise the GitHub child issues created from `tasks.md` (v1; may be added later).
- It does not batch-review multiple gates in one invocation.

See `spec.md` § Out of Scope for the full list.
