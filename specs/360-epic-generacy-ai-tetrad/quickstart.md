# Quickstart: `/cockpit:bug` + AFK push in `/cockpit:watch`

**Feature**: `/cockpit:bug` confirm-gated bug-filer + AFK `PushNotification` amendment to `/cockpit:watch` (A5.3)
**Branch**: `360-epic-generacy-ai-tetrad`
**Date**: 2026-06-29

How to install, invoke, and troubleshoot the two deliverables in issue #360. For the binding surfaces (arguments, prompt text, output shape, exit codes, push format, fire conditions), see [`contracts/bug.md`](./contracts/bug.md) and [`contracts/watch-push.md`](./contracts/watch-push.md).

---

## Prerequisites

1. **`cockpit` plugin installed** in your Claude Code environment. The plugin scaffold landed in #350 (A1.4); `/cockpit:bug` lives at `packages/claude-plugin-cockpit/commands/bug.md` after #360 ships; the `/cockpit:watch` push amendment lives in the existing `commands/watch.md`.
2. **`generacy` CLI on `$PATH`**, with the bug-filing sub-verb / MCP tool available (sibling cockpit issues A2.1 / A2.5). Verify with:

   ```bash
   command -v generacy && generacy --help
   ```

3. **Authenticated `gh`** if the bug-filing engine needs GitHub access to create issues / apply labels. Verify with `gh auth status`.
4. **`PushNotification` host primitive** available in your Claude Code environment. This is the same primitive Claude Code exposes in `claude-code-remote` flows; A5.1's plan explicitly deferred OS push to A5.3 (this issue) because the primitive is now available. No setup needed beyond the primitive being callable.
5. **OS-level notification permission** granted to Claude Code (or whatever wraps the primitive on your platform). Without this, `PushNotification` will return an error and `/cockpit:watch` will degrade to inline-chat-only (see Troubleshooting).

The slash commands themselves depend on `AskUserQuestion` (host primitive, available in interactive Claude Code), `Monitor`, `PushNotification`, and the Bash tool. All ship with Claude Code.

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
3. Verify both deliverables are discoverable:

   ```text
   /cockpit:bug
   ```

   With no argument it prints `Usage: /cockpit:bug <title-or-description>` and exits non-zero. That's a successful installation check for `/cockpit:bug` (loaded; only the argument is missing).

   ```text
   /cockpit:watch
   ```

   With no argument it prints the usage line that A5.1 owns. The push amendment is internal; you verify it by running the watch against an epic with a known notify-only transition and observing both the inline chat line AND the OS push.

---

## Usage — `/cockpit:bug`

### File a bug (interactive)

```text
/cockpit:bug login button is broken on Safari
```

What happens:

1. The slash command trims `$ARGUMENTS` and captures `login button is broken on Safari` as `<title>`.
2. `AskUserQuestion` is shown with the prompt:

   ```
   File this as a `process:speckit-bugfix` issue?

   Title: login button is broken on Safari
   ```

   and two options: `Confirm` and `Cancel`.
3. On `Confirm`: the pre-flight runs (`command -v generacy`), then the bug-filing engine is invoked. The engine creates a new GitHub issue (or reuses an existing one via marker dedup), applies the `process:speckit-bugfix` label, and writes the hidden HTML marker into the issue body. Output is rendered under `**Filed:** <repo>#<number>` followed by a fenced code block with the engine's stdout.
4. On `Cancel` (or any non-affirmative selection): the command prints `Cancelled: /cockpit:bug` and exits non-zero. The engine was not invoked; no GitHub issue was created.

### Cancelled run (or non-interactive environment)

```text
/cockpit:bug login button is broken on Safari
```

Then select `Cancel` (or anything other than `Confirm`):

```text
Cancelled: /cockpit:bug
```

The engine did not run. No issue was created. Exit code: non-zero (so scripted callers can distinguish from success).

### Re-running the same prose (dedup hit)

```text
/cockpit:bug login button is broken on Safari        # run #1 — creates issue #N
/cockpit:bug login button is broken on Safari        # run #2 — same input
```

What happens on run #2:

1. Slash command behaves identically to run #1 (gate, confirm).
2. The engine computes `sha256("login button is broken on Safari")` and searches open `process:speckit-bugfix` issues for `<!-- generacy-bug: <same-hash> -->`. It finds the issue from run #1.
3. The engine returns exit 0 with stdout indicating "matched existing marker; reusing #N" and returns the same `<repo>#<N>`.
4. The slash command renders:

   ```text
   **Filed:** <repo>#<N>

   ```
   matched existing marker; reusing #<N>
   ```
   ```

No second issue is created. (For per-run independence — e.g. you really want a fresh report — tweak the prose: a single character changes the hash.)

---

## Usage — `/cockpit:watch` AFK push amendment

The push surface is internal to the existing playbook. There are no new arguments and no new flags. Run `/cockpit:watch` exactly as before:

```text
/cockpit:watch generacy-ai/agency#360
```

What's new in this issue: for every transition that produces an inline chat line, the playbook ALSO calls `PushNotification` with a compact line your OS will surface on the lockscreen / banner / wearable.

### What surfaces as a push

| Transition class | Inline | Push |
|------------------|--------|------|
| `notify-only` | yes | yes (class `notify-only`) |
| Unmapped | yes | yes (class `unmapped`) |
| `auto` with missing `command` | yes | yes (class `policy-error: missing command`) |
| Unknown `mode` value | yes | yes (class `policy-error: unknown mode '<value>'`) |
| Auto-dispatched (mapped `auto` with valid `command`) | no | no |
| Baseline / echo / already-seen | no | no |

### What the push looks like

OS-level push, single line, ≤200 chars:

```
generacy-ai/agency#360 issue review-requested→approved [notify-only]
```

Lockscreen previews on iOS and Android typically show the first ~80 chars; the format is engineered so `<repo>#<number>` (most actionable) is in those chars. The `[<class>]` token at the end may be the first thing to fall off truncation; that is by design (Q4=B).

---

## Available commands (reference)

| Command | Purpose |
|---------|---------|
| `/cockpit:bug <title-or-description>` | Confirm-gated wrapper over the bug-filing engine. Files an issue tagged `process:speckit-bugfix` with a hidden HTML marker for dedup. Enters the bugfix loop. |
| `/cockpit:bug` (no argument) | Prints the usage line; exits non-zero. |
| `/cockpit:watch <epic-ref>` | Long-running watch over an epic. Applies the autonomy policy to each transition: auto-dispatches mapped `auto` actions, surfaces `notify-only` / `unmapped` / `policy-error` transitions inline AND via OS push (new in A5.3). |
| `/cockpit:queue <phase>` | Sibling verb (#359) — confirm-gated wrapper over `generacy cockpit queue <phase>`. Closest pattern source for `/cockpit:bug`. |
| `/cockpit:file [<epic-ref>]` | Sibling verb — files an epic + child issues from `tasks.md`. Closest pattern source for the engine-owned hidden-marker dedup used in `/cockpit:bug`. |
| `/cockpit:status [<epic-ref>]` | Sibling verb — read-only epic dashboard. Pattern source for the `MISSING_BINARY` and `AUTH_FAILURE` error lines used in `/cockpit:bug`. |

The `/cockpit:bug` verb has no flags. There is no `--help`; bare invocation produces the `Usage:` line.

---

## Examples

### Approve and file a bug

```text
$ /cockpit:bug login button is broken on Safari
[AskUserQuestion: "File this as a `process:speckit-bugfix` issue?  Title: login button is broken on Safari"  options: Confirm / Cancel]
> Confirm

**Filed:** generacy-ai/agency#1234

```
<engine stdout — issue URL, marker hash, dedup-search summary, etc.>
```
```

Exit code: `0`. Inspect the issue on GitHub: title matches the input verbatim; label `process:speckit-bugfix` is attached; body contains a `<!-- generacy-bug: ... -->` marker.

### Cancel the gate

```text
$ /cockpit:bug something I'm not sure about
[AskUserQuestion: "File this as a `process:speckit-bugfix` issue?  Title: something I'm not sure about"  options: Confirm / Cancel]
> Cancel

Cancelled: /cockpit:bug
```

Exit code: non-zero. The engine did not run.

### Empty argument

```text
$ /cockpit:bug
Usage: /cockpit:bug <title-or-description>
```

Exit code: non-zero. The confirmation prompt was not shown.

### `generacy` not installed

```text
$ /cockpit:bug something
[AskUserQuestion: ... ]
> Confirm

The `generacy` CLI is required but is not on $PATH. Install it with `npm install -g @generacy-ai/cli` (or the prevailing install command) and retry.
```

Exit code: non-zero. The engine was not invoked.

### Authentication failure

```text
$ /cockpit:bug something
[AskUserQuestion: ... ]
> Confirm

Authentication failed. The `generacy` CLI uses `gh` for GitHub access — run `gh auth login` and retry.
```

Exit code: non-zero.

### Engine error (label cannot be created, etc.)

```text
$ /cockpit:bug something
[AskUserQuestion: ... ]
> Confirm

Engine failed with exit code 2.

```
<verbatim engine stderr — e.g. "label 'process:speckit-bugfix' cannot be created in this repo: insufficient permissions">
```
```

Exit code: non-zero.

### Watch surfaces a notify-only transition

```text
$ /cockpit:watch generacy-ai/agency#360
[... watch loop running, Monitor emitting one notification per stdout line ...]
# When a notify-only transition arrives:
[cockpit:watch] generacy-ai/agency#360 issue review-requested → approved · policy: notify-only · suggested: /cockpit:merge generacy-ai/agency#360
# AND (on your phone / lockscreen / desktop banner, ≤200 chars):
generacy-ai/agency#360 issue review-requested→approved [notify-only]
```

### Watch — push primitive fails

```text
[cockpit:watch] generacy-ai/agency#360 issue review-requested → approved · policy: notify-only · suggested: /cockpit:merge generacy-ai/agency#360
[cockpit:watch] push failed: notification permission denied
# (the watch loop continues processing subsequent transitions; the inline line remains the always-on backup)
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `/cockpit:bug` prints `Usage: /cockpit:bug <title-or-description>` | No argument, OR `$ARGUMENTS` was whitespace-only. | Pass at least one non-whitespace character. Multi-token is fine: `/cockpit:bug the picker shows wrong year on non-US locales`. |
| `/cockpit:bug` prints `Cancelled: /cockpit:bug` | The user selected `Cancel`, the auto-added `Other`, or the prompt was aborted. | Re-run and select `Confirm` if filing is actually intended. |
| `/cockpit:bug` runs twice with the same prose but only produces one issue | Engine marker dedup is working (Q5=B). The second call found the existing marker. | Expected behaviour. To force a fresh report, tweak the prose by at least one character. |
| `/cockpit:bug` with the same intent but a typo produces TWO issues | Marker dedup is keyed on `sha256(trimmed input)`; a one-character difference produces a different hash. | Expected behaviour. Either close the duplicate, or use the GitHub web UI to merge them; the slash command does not coalesce typo-variants. |
| `Engine failed with exit code <N>.` + fenced stderr says "label `process:speckit-bugfix` not found" | The engine tried to apply the label but couldn't create it (permission issue) | Run `gh auth status` and ensure your token has `repo` scope; or pre-create the label manually with `gh label create process:speckit-bugfix`. |
| `/cockpit:watch` works but no push appears | OS notification permission for Claude Code may be revoked, or the host's `PushNotification` primitive is unavailable. | Check OS Settings → Notifications → Claude Code (or the wrapping app). If `[cockpit:watch] push failed: ...` lines appear inline, the primitive returned an error — read the reason from the inline diagnostic. |
| `/cockpit:watch` push appears for a transition that should NOT push (auto-dispatched succeeded) | Bug — A5.3 carries forward A5.1's invariant that auto-dispatched transitions emit neither inline nor push. | File an issue against `packages/claude-plugin-cockpit/commands/watch.md`. Include the policy entry and the transition record. |
| `/cockpit:watch` inline line appears but push does NOT (no failure message either) | Bug — A5.3's parity invariant is "inline emitted ⇔ push fired". A silent skip violates it. | File an issue against `packages/claude-plugin-cockpit/commands/watch.md`. |
| Push truncated mid-message in OS lockscreen preview | Expected behaviour for very long state names (OS-side truncation). | The format is engineered with `<repo>#<number>` first so the most-actionable field is preserved. If a state name regularly causes truncation, consider shortening the upstream state vocabulary. |
| `/cockpit:bug` success header says something other than `**Filed:** <repo>#<number>` | Bug — drift from the locked header. | File an issue against `packages/claude-plugin-cockpit/commands/bug.md`. |
| Push class token doesn't match the inline `policy:` field | Bug — both surfaces should reflect the same classification. | File an issue against `packages/claude-plugin-cockpit/commands/watch.md`. |

---

## What these commands do **not** do

### `/cockpit:bug`

- It does NOT compute, write, or validate the hidden HTML dedup marker — the engine owns that (Q5=B).
- It does NOT apply the `process:speckit-bugfix` label directly — the engine owns that (Q2=C).
- It does NOT supply any body content for the issue — the engine templates a minimal body (Q1=A).
- It does NOT bypass the confirmation gate under any circumstance (no `--yes` / `-y` flag in v1).
- It does NOT retry the engine on transient failure.
- It does NOT validate `<title>` against any allowed character set, length limit, or keyword list — the engine is the sole validator.
- It does NOT coalesce typo-variants — by Q5=B's design, a single-character edit produces a new issue.
- It does NOT search closed `process:speckit-bugfix` issues for dedup — only open ones (closed bugs are "done"; a re-report is a new occurrence).
- It does NOT call any other slash command (no chaining to `/cockpit:watch`, `/cockpit:queue`, etc.). The bugfix loop is entered automatically via the `process:speckit-bugfix` label being routed by an already-running `/cockpit:watch`.

### `/cockpit:watch` AFK push amendment

- It does NOT detect whether the operator is "at the keyboard". The push fires unconditionally, paired with every inline chat line (Q4=B; research D11).
- It does NOT truncate the push payload. The format is ≤200 chars by construction.
- It does NOT reformat the payload per OS / device. The same string is sent everywhere.
- It does NOT retry `PushNotification` on failure (research D12).
- It does NOT terminate the watch loop on push failure — the inline chat surface is the always-on backup.
- It does NOT add a separate per-second / per-minute rate limit. The existing `seen` dedupe collapses re-emissions; a high-frequency epic that wants tighter rate-limiting is a follow-up clarification, not a v1 change.
- It does NOT change the inline-chat line format (A5.1 owns it; unchanged).
- It does NOT add OS push for the `/cockpit:bug` flow — that command is interactive and the operator is by definition at the keyboard when filing. The push surface is exclusive to `/cockpit:watch`.

See [`contracts/bug.md`](./contracts/bug.md) and [`contracts/watch-push.md`](./contracts/watch-push.md) for the binding contracts, and [`research.md`](./research.md) § D16 for the full out-of-scope guard list.
