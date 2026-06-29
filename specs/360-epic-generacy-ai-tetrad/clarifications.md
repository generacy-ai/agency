# Clarifications — /cockpit:bug + AFK push notifications

## Batch 1 — 2026-06-29

### Q1: `<title-or-description>` argument parsing
**Context**: US1 and FR-001 describe a single positional `<title-or-description>` argument that the verb passes to the bug-filing engine, but a GitHub issue has both a title and a body. The spec does not say whether the entire `$ARGUMENTS` string becomes the issue title (with no body), is split on some convention into title + body, or is passed opaquely so the engine decides. This affects (a) what `/cockpit:bug --help` documents as the usage shape, (b) how multi-token input is treated (sibling `/cockpit:queue` Q3 rejects multi-token; that precedent obviously cannot apply here since bug titles need spaces), and (c) what string the engine dedup uses for "same in-flight bug" (FR-003 AC + Q5 below).
**Question**: How does `/cockpit:bug` parse `$ARGUMENTS` into the title/body the engine files?
**Options**:
- A: **Whole-string-is-title, no body** — the entire `$ARGUMENTS` (trimmed, multi-token allowed) is passed to the engine as the issue title; the issue body is left empty (or filled with a fixed template marker by the engine). Slash command does no parsing.
- B: **First line = title, remaining lines = body** — split on the first `\n`; before the newline becomes the title, after becomes the body. Single-line input gives an empty body.
- C: **Opaque pass-through, engine decides** — the slash command passes `$ARGUMENTS` verbatim to the engine in a single field (e.g. `--description`); the engine derives title/body internally. Slash command performs no parsing whatsoever.

**Answer**: A. The whole `$ARGUMENTS` (trimmed, multi-token allowed) is the issue title; the engine templates a minimal body. Simplest for quick bug capture during testing.

### Q2: `process:speckit-bugfix` marker mechanism
**Context**: FR-001 says the engine files the issue "using the `process:speckit-bugfix` convention" and the AC says "tagged as a bugfix (label or process marker per `process:speckit-bugfix` convention from playbook steps 10-11)." The `or` leaves the actual mechanism ambiguous: it could be a literal GitHub label, an HTML marker baked into the issue body, an issue template, or some combination. The choice is implementation-visible because (a) the autonomy policy / `generacy cockpit watch` stream has to detect the marker to route the bug through the bugfix loop (US1 AC2), and (b) the marker is what the engine-side dedup will likely key off (Q5). Without pinning this, two different engines could implement two incompatible conventions.
**Question**: What concretely marks a filed bug as belonging to the `process:speckit-bugfix` loop?
**Options**:
- A: **Literal GitHub label `process:speckit-bugfix`** — the engine applies the label at filing time; the watch stream filters/classes transitions by label, identical to how it classes other process labels today.
- B: **Hidden HTML marker in the issue body** (e.g. `<!-- generacy-process: speckit-bugfix -->`) — engine writes the marker into the body; watch stream parses it. No GitHub label is involved.
- C: **Both** — engine applies the label *and* writes the HTML marker. Label is the primary signal for the watch stream; the HTML marker is a backup/anchor for dedup and recovery (mirrors the `/cockpit:file` Q5 hidden-marker precedent).

**Answer**: C. Both: the literal `process:speckit-bugfix` label is the primary trigger the orchestrator / `watch` stream routes on, plus a hidden HTML marker as the dedup/recovery anchor (feeds Q5).

### Q3: Confirmation gate before filing
**Context**: Filing a GitHub issue is a non-trivial side effect that creates a permanent artifact and immediately enters the autonomy loop (US1 AC2). Sibling `/cockpit:queue` (#359 Q1) adopted an `AskUserQuestion` confirm gate before invoking its engine for the same reason. The `/cockpit:bug` spec does not mention any confirmation step — FR-001/FR-003/FR-005 describe the flow as if the verb fires the engine on every invocation. The choice affects both UX (one extra click vs. fire-and-forget) and idempotency in practice (a confirm gate makes the engine-side dedup in Q5 a secondary defense rather than the primary one).
**Question**: Should `/cockpit:bug` prompt for confirmation before invoking the filing engine?
**Options**:
- A: **Yes — `AskUserQuestion` confirm gate** mirroring `/cockpit:queue` Q1: two options `Confirm` and `Cancel`, with the resolved title (and a brief synopsis of what will be filed and where) shown in the question; any non-`Confirm` selection aborts without calling the engine. Symmetric with the cockpit's other gated commands.
- B: **No — fire immediately, no gate**. The verb calls the engine on first invocation; engine-side title/marker dedup (Q5) is the only safety net against accidental duplicate filings. Matches a "filing is cheap, dedup catches mistakes" model.
- C: **Conditional — gate only when stdin/TTY is attached**; skip the gate in non-interactive runs (e.g. from a parent playbook step like the bugfix loop re-entering itself). Lets the verb be both safely typed interactively and safely chained from other automation.

**Answer**: A. `AskUserQuestion` confirm gate (`Confirm` / `Cancel`), mirroring `/cockpit:queue` (#359 Q1). Filing auto-enters the billable bugfix loop, so it's a "go" action and gets the same gate; any non-`Confirm` aborts.

### Q4: `PushNotification` message format
**Context**: The Claude Code `PushNotification` tool accepts a single `message` field capped at 200 characters; it has no separate title field. FR-009 specifies the payload must include `<repo>#<number>`, `<kind>`, `<from> → <to>`, and `policy: <class>` "on a single line," and FR-010 says the push is a "re-encoding of the same record" as inline chat. But the exact string format (delimiters, ordering, whether the push line equals the inline-chat line verbatim, what happens if the composed line exceeds 200 chars) is not specified. This is what an operator actually sees on their lock screen, and inconsistency between sessions would make pushes hard to scan.
**Question**: What is the exact format of the `PushNotification.message` string, and how does it relate to the inline-chat line?
**Options**:
- A: **Identical to the inline chat line, byte-for-byte** — whatever string is printed inline is also passed as `message`. If the inline line exceeds 200 chars, the slash command truncates with a trailing `…` for the push only; inline chat keeps the full string. Single source of truth for format.
- B: **Compact dedicated push format**: `<repo>#<number> <kind> <from>→<to> [<class>]` (e.g. `generacy-ai/agency#360 issue ready→in-progress [auto]`). Distinct from but parallel to inline chat; always ≤200 chars by construction (no truncation logic needed). Inline chat retains its existing richer format from A5.1.
- C: **Same fields, different ordering optimized for notification surfaces**: lead with class then ref (e.g. `[notify-only] generacy-ai/agency#360 issue ready→in-progress`) so the most actionable signal is visible in truncated previews on iOS/Android lockscreens.

**Answer**: B. Compact dedicated push format `<repo>#<number> <kind> <from>→<to> [<class>]` (e.g. `generacy-ai/agency#360 issue ready→in-progress [auto]`), always ≤200 chars by construction (no truncation logic). Inline chat keeps its richer A5.1 format. Purpose-built for the lockscreen.

### Q5: Engine dedup identity for "same in-flight bug"
**Context**: FR-003 AC says re-running `/cockpit:bug` with "the same description is idempotent in the sense that the playbook does not file duplicate issues for the same in-flight bug (engine-owned dedup, mirrors `/cockpit:file` Q5 precedent)." `/cockpit:file` Q5 was answered as "title-based dedup or hidden HTML marker." But the bug verb's input is freeform prose, not a stable task title — so what counts as "same" needs pinning. This determines real-world behavior: a typo-fix re-invocation, a re-paste with extra whitespace, or two operators filing the same observation should converge correctly. It also interacts with Q1 (what part of `$ARGUMENTS` becomes "title") and Q3 (whether a confirm gate has already caught most accidental re-runs).
**Question**: What identity does the engine use to detect a duplicate `/cockpit:bug` filing?
**Options**:
- A: **Exact-match on the derived title** (per Q1) scoped to open issues with the `process:speckit-bugfix` marker (per Q2). Strict and predictable; a single-character edit produces a new issue. Mirrors `/cockpit:file` Q5 title-based dedup verbatim.
- B: **Hidden HTML marker keyed by a hash of the full input** (e.g. `<!-- generacy-bug: <sha256-of-trimmed-arguments> -->`) written into the issue body at filing time. On re-invocation, the engine searches open `process:speckit-bugfix` issues for the matching marker and reuses the existing issue. Survives title edits made on GitHub; sensitive to whitespace differences in input.
- C: **Either match wins (title OR marker)** — combine A and B: dedup if *either* an exact-title match or a hash-marker match exists. Most forgiving; lowest duplicate rate; engine implements both checks. Matches the `/cockpit:file` Q5 "by title or hidden HTML marker" wording most literally.

**Answer**: B. Dedup by a hidden HTML marker keyed on `sha256(trimmed input)` (`<!-- generacy-bug: <hash> -->`), searched among open `process:speckit-bugfix` issues. Deterministic and survives GitHub-side title edits — better than title-match for freeform bug prose. (The Q3 confirm gate is the primary guard; this is the secondary net.)
