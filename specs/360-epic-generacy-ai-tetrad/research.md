# Research: `/cockpit:bug` + AFK push in `/cockpit:watch`

**Feature**: `/cockpit:bug` confirm-gated bug-filer + AFK `PushNotification` amendment to `/cockpit:watch` (A5.3)
**Branch**: `360-epic-generacy-ai-tetrad`
**Date**: 2026-06-29

This document records the technology and pattern decisions behind the two deliverables for issue #360. Each section names the chosen approach, the alternatives considered, and the rationale. Decisions traceable to a clarification answer cite the Q-number.

---

## D1: Verb-file format and packaging

**Decision**: Ship `/cockpit:bug` as a single markdown file with YAML frontmatter at `packages/claude-plugin-cockpit/commands/bug.md`. Use the same shape as the sibling cockpit verbs (`status.md`, `queue.md`, `merge.md`, `review.md`, `file.md`, `clarify.md`, `watch.md`). Ship the AFK push amendment as an additive edit to `commands/watch.md` (no extraction into a separate file).

**Alternatives considered**:
- *Embed the bug gate in a TypeScript MCP tool* with a thin markdown shim: rejected — outside the per-verb isolation declared in spec.md § Summary; adds a build step the cockpit plugin has so far avoided; and the verb has no state to carry between calls.
- *Extract the AFK push logic into a new `commands/push.md` helper verb* that `/cockpit:watch` shells out to: rejected — adds a slash-to-slash call that has no independent use case and inverts the "one verb, one responsibility" pattern. The push is a per-transition side effect of the watch loop, not a standalone action.
- *Wait for an A5.4 follow-up to do the push so this issue stays scoped to `/cockpit:bug`*: rejected — the spec.md summary explicitly bundles both deliverables ("Owns: bug.md + an edit to watch.md for push"), and A5.1 already deferred OS push to A5.3 (this issue), making this the deliberate landing point.

**Reference**: `packages/claude-plugin-cockpit/commands/queue.md` (style template; nearest pattern in confirm-gate + opaque-arg handling), `packages/claude-plugin-cockpit/commands/file.md` (engine-owned dedup with hidden HTML marker), `packages/claude-plugin-cockpit/commands/watch.md` (the file to edit; already wires `Monitor` + inline chat emission).

---

## D2: Argument parsing — whole-string-is-title

**Decision**: Treat `$ARGUMENTS` as a single freeform string: trim outer whitespace and pass the entire trimmed string to the engine as the issue title. Do NOT tokenize on whitespace. Do NOT split on the first newline into title + body. Do NOT strip Markdown, quote characters, or punctuation.

**Alternatives considered**:
- *First-line = title, remaining lines = body* (Q1 option B): rejected — splits the operator's attention into two structural slots when the cockpit's intent is "quick bug capture during testing"; a single-line title with an engine-templated body is the lowest-friction path.
- *Opaque pass-through; engine decides title/body* (Q1 option C): rejected — moves the title/body parsing question one layer deeper without resolving it. Q1=A pins the contract at the slash-command boundary so every engine implementer sees the same interface.

**Rationale**: Locked by **Q1 → A**. The whole trimmed `$ARGUMENTS` is the issue title; the engine templates a minimal body. Simplest for quick bug capture during testing. The engine's minimal body is the place where any future structured metadata (severity, repro steps) would land — not the slash command.

---

## D3: `process:speckit-bugfix` marker mechanism — label + hidden HTML marker

**Decision**: The engine applies BOTH (a) the literal GitHub label `process:speckit-bugfix` and (b) a hidden HTML marker in the issue body. The label is the primary signal the autonomy policy / `/cockpit:watch` stream routes on (same way it routes other process labels today). The hidden HTML marker is the dedup/recovery anchor (D5).

**Alternatives considered**:
- *Literal label only* (Q2 option A): rejected — the label alone is sufficient for routing, but the dedup question (Q5) is best answered by a stable body-side anchor that survives title edits. Label-only would force dedup to be title-based, which is the wrong fit for freeform prose (see D5).
- *Hidden HTML marker only, no label* (Q2 option B): rejected — the watch stream's existing transition classifier consumes labels, not body content. Forcing it to parse bodies would mean two parallel classification paths and a risk of drift between them.

**Rationale**: Locked by **Q2 → C**. The label remains the primary routing signal (no new code path on the watch side; the existing label-based classifier just sees one more label). The hidden HTML marker is a second-class signal used exclusively for dedup/recovery. Mirrors the `/cockpit:file` Q5 precedent (where hidden HTML markers also anchor engine-owned dedup without changing the label-based classifier).

---

## D4: Confirmation gate — `AskUserQuestion` with `Confirm` / `Cancel`

**Decision**: Use `AskUserQuestion` with exactly two options — `Confirm` and `Cancel`. The affirmative outcome is "the user selected the `Confirm` option"; everything else — `Cancel`, the platform's auto-added `Other`, an aborted prompt, or anything else — is treated as non-affirmative and aborts without invoking the engine. Mirrors `/cockpit:queue` (#359 Q1) exactly.

**Alternatives considered**:
- *No confirmation gate — fire immediately on every invocation* (Q3 option B): rejected — filing a GitHub issue is a permanent artifact and immediately enters the autonomy loop. Even with marker dedup as a safety net, the cost of a single wrong issue is higher than the cost of one extra click.
- *Conditional gate — skip in non-interactive environments* (Q3 option C): rejected — non-interactive environments are where a malformed prompt is most likely (the user is not at the keyboard to spot a wrong title before it gets filed). The strict gate is the safer default.

**Rationale**: Locked by **Q3 → A**. Filing auto-enters the billable bugfix loop, so it is a "go" action and gets the same gate as `/cockpit:queue`. The engine-side marker dedup (D5) is the secondary net, not the primary one — the gate is the primary defence.

---

## D5: Engine dedup identity — hidden HTML marker keyed on sha256

**Decision**: The engine writes `<!-- generacy-bug: <sha256-of-trimmed-arguments> -->` into the issue body at filing time. On re-invocation, the engine searches open issues labelled `process:speckit-bugfix` for a matching marker and reuses the existing issue when one is found. The slash command does NOT compute the hash; the slash command does NOT do the search; the slash command does NOT touch the body. All of this is engine-owned.

**Alternatives considered**:
- *Exact-match on the derived title* (Q5 option A): rejected — `<title>` is freeform prose. A one-character edit, a different capitalization, or a stray whitespace would produce a new issue every time. Mirrors `/cockpit:file` Q5 verbatim but is the wrong fit here because `/cockpit:file`'s titles are derived from stable task names, whereas bug titles are typed prose.
- *Either match wins — title OR marker* (Q5 option C): rejected — the title surface is too noisy for freeform prose. Marker-only is deterministic and survives GitHub-side title edits (an operator can rename the issue on the web UI and the next `/cockpit:bug` with the original prose still finds the same issue).

**Rationale**: Locked by **Q5 → B**. Deterministic, body-anchored, survives title edits, and stays sensitive only to the input text itself. The Q3 confirm gate (D4) is the primary guard; this is the secondary net for the case where the operator deliberately re-runs the same prose. A typo or whitespace difference DOES produce a new issue — that is the documented behaviour, surfaced in the quickstart and in plan validation step #7.

---

## D6: Confirmation prompt copy

**Decision**: Pass a multi-line string as the `question` field of `AskUserQuestion`: line 1 is the literal ``File this as a `process:speckit-bugfix` issue?``; line 2 is blank; line 3 is `Title: <preview>` where `<preview>` is `<title>` truncated to 120 chars with `…` if it was truncated. The preview is informational; the engine receives the full untruncated title.

**Alternatives considered**:
- *Single-line prompt with the title interpolated* (e.g. ``File `<title>` as a process:speckit-bugfix issue?``): rejected — long bug prose pushes the question off the bottom of the host UI, and the operator cannot tell at a glance whether the title they typed is what they meant.
- *Two-line prompt with the title raw, no truncation*: rejected — extreme cases (a multi-paragraph prose dump) flood the prompt UI. The 120-char preview truncation is a UI-affordance only; the title of record is whatever was typed.
- *Render the prompt without echoing the title at all*: rejected — without seeing the title the operator cannot meaningfully consent. The `Confirm` selection is binding; the operator needs at least a sample of what is about to be filed.

**Rationale**: The prompt is the single most user-visible string in the command; spelling it out in research (as it was for `/cockpit:queue` Q4) gives code review a single string to enforce and avoids drift across cockpit verbs. The truncation is a host-UI affordance, not part of the engine contract.

---

## D7: Success-output header format

**Decision**: On engine exit 0, emit the literal header line `**Filed:** <repo>#<number>`, then one blank line, then captured stdout inside a triple-backtick fenced code block. Render stdout verbatim — no reflow, no reformat, no re-decoration.

**Alternatives considered**:
- *`**Bug:** <repo>#<number>`* (noun parallel to `**Status:**`): rejected — `Bug` reads as the *thing being shown*, not as the *action that completed*. The success header reports a completed action, so the past-tense verb is clearer.
- *`**Filed bug:** <repo>#<number>`* (more explicit): rejected — the additional word adds no information; `<repo>#<number>` already names the artifact (a bug, by virtue of having the `process:speckit-bugfix` label).
- *Inline the engine's stdout without a fenced block*: rejected — `/cockpit:status` and `/cockpit:queue` use the fenced-block convention to preserve verbatim CLI output and to satisfy SC-002 ("exactly one fenced output block or one terse line"); the same convention applies here.

**Rationale**: Mirrors `/cockpit:status`'s `**Status:** <epic-ref>` and `/cockpit:queue`'s `**Queued:** <phase>` conventions. The `**<Verb-past-tense>:** <subject>` pattern is the recommended template for any future cockpit verb that emits a one-line header before a CLI output block.

---

## D8: Error classification — three classes, mirrored from `/cockpit:queue`

**Decision**: Classify engine failures into three classes (first match wins, case-insensitive stderr match):

- `MISSING_BINARY` — pre-flight `command -v generacy` returned non-zero.
- `AUTH_FAILURE` — exit ≠ 0 AND stderr matches `/auth|unauthorized|401|gh auth/i`.
- `OTHER` — anything else.

Each class emits exactly one response; every class MUST print something — never silently no-op.

**Alternatives considered**:
- *Add a `LABEL_MISSING` class* with a hint to create the `process:speckit-bugfix` label: rejected — the engine should auto-create the label on first use (that is its responsibility; the cockpit plugin convention is "engines own GitHub state"). If the engine cannot create the label, the `OTHER` branch surfaces the engine's own actionable stderr verbatim.
- *Add a `DEDUP_HIT` "class" with a different header for reused issues*: rejected — dedup hits exit 0 with a stdout indication ("matched existing marker; reusing #N"). The `**Filed:** <repo>#<n>` header is correct either way: the issue exists and the bugfix loop is tracking it; whether it was created in this invocation or reused from a prior one is engine-level information rendered inside the fenced block.

**Rationale**: Reused from `/cockpit:queue` D6 verbatim. First-class errors are reserved for cases where the slash command can offer help the engine cannot (binary missing → install command; auth failure → `gh auth login`). Everything else gets the engine's stderr verbatim.

---

## D9: Pre-flight + invocation pattern

**Decision**: Mirror `/cockpit:queue`'s pre-flight: run `command -v generacy >/dev/null 2>&1` before invoking the engine. On non-zero, branch directly to `MISSING_BINARY` without attempting the engine call. On zero, invoke the bug-filing engine from the repository root via the Bash tool (exact entry point — sub-verb name vs MCP tool name — is the engine's contract, sibling A2.1 / A2.5), capturing stdout, stderr, and the exit code in separate variables. Pass `<title>` as the single positional argument; pass no flags.

**Alternatives considered**:
- *Skip the pre-flight; let the shell return `127` when `generacy` is missing*: rejected — `127`'s stderr provides less actionable guidance than the curated `MISSING_BINARY` line.
- *Pass `--json` to the engine and parse a structured response*: rejected — the spec does not require structured output; the engine's default text output (whatever it is) is rendered inside a fenced block, identically to `/cockpit:queue`. The `<repo>#<number>` field for the header is the only structured value the slash command needs, and engines that emit it as the last line of stdout (a common convention) are easy to scrape.

**Rationale**: Copying `/cockpit:queue`'s pre-flight pattern keeps the verbs visually consistent (helpful for the user) and reuses the already-curated `MISSING_BINARY` text. The pre-flight is cheap (one `command -v` call) and removes one ambiguous failure mode.

---

## D10: Push notification format — compact, lockscreen-optimized

**Decision**: The push payload format is the literal compact string:

```
<repo>#<number> <kind> <from>→<to> [<class>]
```

Single line, ≤200 chars by construction (no truncation logic), single Unicode right-arrow `→` between states. Distinct from but parallel to the inline-chat line owned by A5.1; inline chat keeps its richer format.

**Alternatives considered**:
- *Identical to the inline chat line, byte-for-byte* (Q4 option A): rejected — the inline format is richer (`[cockpit:watch] <repo>#<number> <kind> <from> → <to> · policy: <policy> · suggested: /cockpit:<verb> <ref>`) and frequently exceeds 200 chars when `suggested:` is populated. Forcing equality would require either truncating the inline line (degrading the on-screen UX) or truncating the push (introducing fragile logic).
- *Class-first ordering* (`[notify-only] <repo>#<number> ...`; Q4 option C): rejected — operators scan refs first ("which issue?") before policy ("what kind of transition?"). Lockscreen previews truncate the tail, but the head — `<repo>#<number>` — is what makes the notification actionable.

**Rationale**: Locked by **Q4 → B**. Compact, byte-deterministic, no per-platform reformatting. The format is purpose-built for the lockscreen surface; inline chat is the on-screen surface and retains its A5.1 format unchanged.

---

## D11: AFK = unconditional pairing (no idle detection)

**Decision**: The playbook does NOT detect whether the operator is at the keyboard. Every transition that produces an inline chat line ALSO fires one `PushNotification`. There is no timer, no idle threshold, no per-platform gating. "AFK push" is therefore the colloquial name for "OS-level push surface that reaches the operator when they are not at the screen" — not a conditional fire.

**Alternatives considered**:
- *Fire only after N minutes of inactivity*: rejected — the slash command has no reliable signal for "operator is idle" in a Claude Code session. The host's idle detection is not exposed.
- *Fire only if the inline chat surface is not visible (out of focus)*: rejected — same reason. There is no exposed signal for "is the chat window in focus".
- *Suppress push for transitions matched in the last N seconds (rate limit)*: rejected — the existing per-invocation `seen` dedupe already collapses re-emissions; the push fires at most once per surfaced transition. Adding a separate rate limit for the push surface would create a new failure mode where the inline chat fires but the push does not, breaking the parity invariant. Listed as a follow-up risk in plan.md § Open Risks.

**Rationale**: The inline chat surface IS the "operator at the screen" backup; the push surface IS the "operator away from the screen" forward. Both fire unconditionally so neither surface ever silently no-ops. Concretely, if the operator is at the keyboard they will see both — which is a UX cost the spec deliberately accepted in exchange for never missing a transition on the AFK side. The risk register notes that a future high-frequency epic might want a rate limit; that would be a new clarification, not part of v1.

---

## D12: Push primitive failure handling

**Decision**: If `PushNotification` itself returns an error (e.g. OS revoked permission, host primitive unavailable), the playbook surfaces a single inline `[cockpit:watch] push failed: <reason>` line and continues processing the stream. The push failure does not terminate the watch loop, does not skip the inline chat line (which is emitted first), and does not retry.

**Alternatives considered**:
- *Retry the push N times with backoff*: rejected — the host primitive owns its own delivery semantics; the playbook is fire-and-forget per call. Adding retry here would duplicate logic the host primitive may already (or may not) implement.
- *Treat a push failure as fatal and terminate the watch*: rejected — the watch's job is to surface state transitions to the operator. The inline chat line is the always-on backup surface; a missing push does not justify aborting the entire stream.
- *Suppress the inline `push failed:` line and accumulate failures silently*: rejected — silent accumulation is exactly the failure mode the cockpit's "no silent no-op" rule (SC-002 carry-over) forbids. The operator deserves to know when a surface they may rely on is broken.

**Rationale**: Failure tolerance + visible degradation. The inline chat line is the source of truth; the push is the convenience. When the convenience breaks, the operator is told once per failure, the stream keeps running, and the inline surface stays intact.

---

## D13: Fire conditions — exact parity with inline-chat emission

**Decision**: The push fires for every transition that produces an inline chat line, and only for those:

- Fires: `notify-only`, `unmapped`, `policy-error:` degraded auto, unknown-`mode` degraded auto.
- Does NOT fire: successfully auto-dispatched transitions (the slash-command invocation itself is the user-visible signal; A5.1 invariant).
- Does NOT fire: baseline (`from === null`), echo (`from === to`), or already-`seen` transitions (these are dropped before any user-visible emission).

**Alternatives considered**:
- *Fire for every transition, including auto-dispatched*: rejected — would flood the lockscreen during normal autonomous operation. Auto-dispatched transitions are the "everything is working" path; surfacing them is noise.
- *Fire only for `policy-error:` (errors the operator must address)*: rejected — `unmapped` is also operator-actionable (it indicates a missing policy entry the operator should add). `notify-only` is operator-informational but explicitly marked as a surface the operator wants to see — that is what the mode name means.

**Rationale**: Parity with the inline-chat surface is the simplest invariant to remember, to test, and to enforce in code review: "If it shows up inline, it shows up in the push." Reusing the same fire-condition predicate also means the playbook has only one place where the decision lives, so future changes (e.g. a sixth policy mode) update both surfaces at once.

---

## D14: Failure-mode policy

**Decision**: All structural rejections (empty args, missing binary, cancelled prompt) exit non-zero with a single terse line and no fenced block. All engine failures emit a single classification line followed by stderr in a fenced block. There is no silent no-op on any code path (SC-002 carry-over).

**Specific failure responses (`/cockpit:bug`):**

| Class | Trigger | Output | Exit |
|-------|---------|--------|------|
| `Usage` (empty args) | `$ARGUMENTS` empty / whitespace-only | `Usage: /cockpit:bug <title-or-description>` | non-zero |
| `Cancelled` | `AskUserQuestion` returned anything ≠ `Confirm` | `Cancelled: /cockpit:bug` | non-zero |
| `MISSING_BINARY` | pre-flight `command -v generacy` returned non-zero | (the `/cockpit:status` / `/cockpit:queue` line about installing the CLI) | non-zero |
| `AUTH_FAILURE` | engine exit ≠ 0 AND stderr matches the auth regex | (the `/cockpit:status` / `/cockpit:queue` line about `gh auth login`) | non-zero |
| `OTHER` | engine exit ≠ 0, anything else | `Engine failed with exit code <N>.` + fenced stderr | non-zero |
| (success) | engine exit 0 after `Confirm` | `**Filed:** <repo>#<number>` + fenced stdout | zero |

**Rationale**: Q3=A requires an explicit confirmation step; the cancel path's non-zero exit lets scripted callers distinguish "user said no" from "engine succeeded". SC-002 (carried from sibling cockpit verbs) requires exactly one terse line or one fenced block on every path. The slash command never mutates GitHub state on a non-success path.

---

## D15: Cancel-path exit code (non-zero, not zero)

**Decision**: When the user does not select `Confirm`, the command prints `Cancelled: /cockpit:bug` and exits **non-zero**.

**Alternatives considered**:
- *Exit zero on cancel* (the cancel is a "successful" no-op): rejected — scripted callers should be able to distinguish `Confirm`+success from `Cancel` with a single `$?` check. The engine itself was not called, so reporting success is misleading.

**Rationale**: Mirrors `/cockpit:queue`'s D9 cancel semantics. The terse `Cancelled:` line tells the human what happened; the non-zero exit tells the script.

---

## D16: Out-of-scope guards

**Decision**: The two deliverables MUST NOT:

- Compute, validate, or write the dedup marker (engine-owned per D5).
- Templating the issue body in any way beyond passing the title — the engine writes the body (Q1=A).
- Mutate any GitHub label directly (engine applies `process:speckit-bugfix`; the `/cockpit:watch` amendment never touches labels).
- Run any CLI other than the bug-filing engine for `/cockpit:bug`, or any tool other than `Monitor` + `AskUserQuestion`'s implicit invocation + `PushNotification` for `/cockpit:watch`. In particular, no `gh pr ...`, no shell side-effects between the pre-flight and the engine call, no scraping of the GitHub web UI.
- Persist any state on disk (the commands themselves read/write nothing).
- Auto-retry the engine or the push primitive on transient failure (any non-zero engine exit is surfaced to the user via the `OTHER` branch and the user re-runs; any `PushNotification` failure is logged inline and the watch loop continues).
- Detect whether the operator is "at the keyboard" — see D11.
- Truncate or reformat the push payload — see D10.
- Change the inline-chat line in `/cockpit:watch` — that surface is owned by A5.1 and is unchanged in A5.3.

**Rationale**: The Epic Cockpit pattern is "one verb, one responsibility". `/cockpit:bug`'s responsibility is the confirm gate + engine shell-out + terse output discipline. The `/cockpit:watch` amendment's responsibility is adding one more output surface (the push) without disturbing the existing one (inline chat).

---

## Key sources

- **Spec**: `specs/360-epic-generacy-ai-tetrad/spec.md`
- **Clarifications**: `specs/360-epic-generacy-ai-tetrad/clarifications.md` (Q1–Q5)
- **Sibling cockpit verb (confirm-gate + opaque-arg pattern)**: `packages/claude-plugin-cockpit/commands/queue.md` (#359; A4.4)
- **Sibling cockpit verb (engine-owned dedup with hidden HTML marker)**: `packages/claude-plugin-cockpit/commands/file.md` (closest precedent for Q5=B body-anchored dedup)
- **Sibling cockpit verb (style template, `MISSING_BINARY` line)**: `packages/claude-plugin-cockpit/commands/status.md`
- **The file to edit**: `packages/claude-plugin-cockpit/commands/watch.md` (A5.1; inline-chat surface owned there)
- **Plugin scaffold (A1.4)**: `specs/350-epic-generacy-ai-tetrad/` and `packages/claude-plugin-cockpit/`
- **Epic plan**: `docs/epic-cockpit-plan.md` in the `tetrad-development` repo (P5 / A5.3; playbook steps 10-11 for the bugfix loop)
- **Upstream issues**: `generacy-ai/tetrad-development#85` (epic); `generacy-ai/agency#360` (this issue); sibling cockpit issues A2.1 and A2.5 (bug-filing engine implementation — see the epic checklist for issue numbers)
