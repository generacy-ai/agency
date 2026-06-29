# Quickstart: `/cockpit:queue`

**Feature**: `/cockpit:queue` confirm-gated wrapper over `generacy cockpit queue <phase>` (A4.4)
**Branch**: `359-epic-generacy-ai-tetrad`
**Date**: 2026-06-29

How to install, invoke, and troubleshoot `/cockpit:queue`. For the binding surface (arguments, prompt text, output shape, exit codes), see [`contracts/command.md`](./contracts/command.md).

---

## Prerequisites

1. **`cockpit` plugin installed** in your Claude Code environment. The plugin scaffold landed in #350 (A1.4); this command lives at `packages/claude-plugin-cockpit/commands/queue.md` after #359 ships.
2. **`generacy` CLI on `$PATH`**, with the `cockpit queue` sub-verb available (sibling cockpit issue G3.2). Verify with:

   ```bash
   command -v generacy && generacy cockpit queue --help
   ```

3. **Authenticated `gh`** if `generacy cockpit queue` needs GitHub access for the chosen phase. Verify with `gh auth status`.

The slash command itself depends on `AskUserQuestion` (host primitive, available in interactive Claude Code) and the Bash tool. Both ship with Claude Code.

---

## Installation

The cockpit plugin is registered in the generacy marketplace. To install:

1. Ensure the marketplace is in your Claude Code settings:

   ```json
   {
     "extraKnownMarketplaces": ["generacy-ai/agency"]
   }
   ```

2. Install (or re-install) the `cockpit` plugin from the marketplace.
3. Verify the command is discoverable:

   ```text
   /cockpit:queue
   ```

   With no argument it prints `Usage: /cockpit:queue <phase>` and exits non-zero. That's a successful installation check (the command is loaded; only the argument is missing).

---

## Usage

### Queue a phase (interactive)

```text
/cockpit:queue plan
```

What happens:

1. The slash command tokenizes `$ARGUMENTS`, captures `plan` as `<phase>`.
2. `AskUserQuestion` is shown with the prompt ``Run `generacy cockpit queue plan`?`` and two options: `Confirm` and `Cancel`.
3. On `Confirm`: the pre-flight runs (`command -v generacy`), then `generacy cockpit queue plan` is invoked from the repository root. Output is rendered under `**Queued:** plan` followed by a fenced code block with the CLI's stdout.
4. On `Cancel` (or any non-affirmative selection): the command prints `Cancelled: /cockpit:queue plan` and exits non-zero. The CLI was not invoked.

### Cancelled run (or non-interactive environment)

```text
/cockpit:queue plan
```

Then select `Cancel` (or anything other than `Confirm`):

```text
Cancelled: /cockpit:queue plan
```

The CLI did not run. No state was changed. Exit code: non-zero (so scripted callers can distinguish from success).

---

## Available commands (reference)

| Command | Purpose |
|---------|---------|
| `/cockpit:queue <phase>` | Confirm-gated wrapper over `generacy cockpit queue <phase>`. |
| `/cockpit:queue` (no argument) | Prints the usage line; exits non-zero. |
| `/cockpit:status [<epic-ref>]` | Sibling verb — read-only dashboard of an epic's status and queue. Does not gate on confirmation. |
| `/cockpit:merge <ref> [--no-fix] [--max-fix-attempts=N]` | Sibling verb — merges a PR; does not share the `/cockpit:queue` confirmation pattern. |

The `/cockpit:queue` verb has no flags. There is no `--help`; bare invocation produces the `Usage:` line.

---

## Examples

### Approve and queue the `plan` phase

```text
$ /cockpit:queue plan
[AskUserQuestion: "Run `generacy cockpit queue plan`?"  options: Confirm / Cancel]
> Confirm

**Queued:** plan

```
<verbatim CLI stdout — phase scheduling details, work IDs, etc.>
```
```

Exit code: `0`.

### Cancel the gate

```text
$ /cockpit:queue plan
[AskUserQuestion: "Run `generacy cockpit queue plan`?"  options: Confirm / Cancel]
> Cancel

Cancelled: /cockpit:queue plan
```

Exit code: non-zero. The CLI did not run.

### Missing argument

```text
$ /cockpit:queue
Usage: /cockpit:queue <phase>
```

Exit code: non-zero. The confirmation prompt was not shown.

### Two arguments (rejected by the slash command)

```text
$ /cockpit:queue plan tasks
Usage: /cockpit:queue <phase>
```

Exit code: non-zero. The confirmation prompt was not shown. (A phase is a single token; multi-token input is symmetric with the missing-argument case.)

### `generacy` not installed

```text
$ /cockpit:queue plan
[AskUserQuestion: "Run `generacy cockpit queue plan`?"  options: Confirm / Cancel]
> Confirm

The `generacy` CLI is required but is not on $PATH. Install it with `npm install -g @generacy-ai/cli` (or the prevailing install command) and retry.
```

Exit code: non-zero. The CLI was not invoked.

### Authentication failure

```text
$ /cockpit:queue plan
[AskUserQuestion: "Run `generacy cockpit queue plan`?"  options: Confirm / Cancel]
> Confirm

Authentication failed. The `generacy` CLI uses `gh` for GitHub access — run `gh auth login` and retry.
```

Exit code: non-zero.

### Unknown phase (surfaced by the CLI, classified as `Other`)

```text
$ /cockpit:queue not-a-phase
[AskUserQuestion: "Run `generacy cockpit queue not-a-phase`?"  options: Confirm / Cancel]
> Confirm

CLI failed with exit code 2.

```
<verbatim CLI stderr — typically "unknown phase: not-a-phase" or similar>
```
```

Exit code: non-zero. (The slash command does not validate phase names; the CLI is the sole validator.)

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Usage: /cockpit:queue <phase>` | No argument, OR more than one whitespace-separated token in `$ARGUMENTS`. | Pass exactly one positional phase: `/cockpit:queue plan`. |
| `Cancelled: /cockpit:queue <phase>` | The user selected `Cancel`, the auto-added `Other`, or the prompt was aborted. | Re-run and select `Confirm` if the queue is actually intended. |
| Prompt never appears; usage line shown instead | You passed zero or two+ tokens, so the prompt was never reached. | Pass exactly one token; see above. |
| Prompt appears but the CLI never runs | You did not select `Confirm`. Anything other than `Confirm` is treated as cancel. | Re-run and select `Confirm`. |
| `The` ``generacy`` `CLI is required…` | `generacy` is not on `$PATH`. | Install with `npm install -g @generacy-ai/cli` (or the prevailing install command). |
| `Authentication failed…` | `gh` is not authenticated or the GitHub token is invalid. | Run `gh auth login`. |
| `CLI failed with exit code <N>.` + fenced stderr | The CLI rejected the request. Common case: unknown / unsupported phase. | Read the fenced stderr block; consult `generacy cockpit queue --help` for the supported phase set. |
| Multiple `**Queued:** <phase>` headers in one run | Bug — this command emits exactly one header on the success path. | File an issue against `packages/claude-plugin-cockpit/commands/queue.md`. |
| Header line says something other than `**Queued:** <phase>` | Bug — drift from the locked clarification Q2=A header. | File an issue against `packages/claude-plugin-cockpit/commands/queue.md`. |
| Prompt copy differs from ``Run `generacy cockpit queue <phase>`?`` | Bug — drift from the locked clarification Q4=A prompt copy. | File an issue against `packages/claude-plugin-cockpit/commands/queue.md`. |

---

## What this command does **not** do

- It does not validate `<phase>` against any list of allowed phases — the CLI is the sole validator.
- It does not bypass the confirmation gate under any circumstance (there is no `--yes` / `-y` flag in v1).
- It does not retry the CLI on transient failure.
- It does not mutate any GitHub label directly. All GitHub state changes are performed by the CLI itself.
- It does not read or write any file on disk (other than what the Bash subprocess does on its own).
- It does not pass `--json` or any other flag to the CLI. The CLI's default text output is rendered verbatim.
- It does not call any other slash command (no chaining to `/cockpit:advance`, `/cockpit:status`, `/cockpit:merge`, etc.).
- It does not batch-queue multiple phases in one invocation. Multi-token `$ARGUMENTS` is rejected; one phase per call.

See [`contracts/command.md`](./contracts/command.md) for the binding contract and [`research.md`](./research.md) § D10 for the full out-of-scope guard list.
