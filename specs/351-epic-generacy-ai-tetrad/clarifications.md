# Clarifications

## Batch 1 — 2026-06-26

### Q1: Transition dedupe identity & persistence
**Context**: FR-006 requires "No duplicate notifications for the same transition id," and AC US1 requires "exactly one notification … no duplicate fires for the same transition." The spec doesn't define what constitutes a transition id or whether dedupe state survives a watch-loop restart. Without this, an implementer can't pick a data structure (in-memory set vs. on-disk cache keyed by what?) and can't tell whether restarting the loop will re-fire historical transitions.
**Question**: What identifies a transition for dedupe purposes, and must dedupe survive a watch-loop restart?
**Options**:
- A: Transition id is supplied by the `generacy cockpit watch` stream itself (the stream guarantees a stable id per emitted line); dedupe is **in-memory only** (restarts may re-fire if the stream replays).
- B: Transition id is composed locally from `(repo, issue/PR number, label, timestamp)`; dedupe is **in-memory only**.
- C: Same as A or B, but dedupe state is **persisted to disk** so restarts don't re-fire transitions already handled.
- D: The `generacy` stream guarantees once-only delivery, so no client-side dedupe is needed — FR-006 wording is defensive only.

**Answer**: B.** Compose the dedupe id locally from `(repo, kind, number, from→to)`; in-memory only. Treat #787's baseline lines (`from: null`) as state-sync, **not** actionable transitions, so a watch restart re-syncs current state without re-firing actions. No on-disk persistence needed.

### Q2: Policy lookup miss — fallback behavior
**Context**: The autonomy policy maps transitions to `auto` or `notify-only`. The spec is silent on what happens when the resolver returns no mapping for a transition class (e.g. a label the user hasn't classified yet, or a label introduced after the loop started). This is a daily-operation case — without a defined fallback, the loop's behavior on unfamiliar transitions is undefined.
**Question**: When the autonomy resolver returns no mapping for a transition, what should the watch loop do?
**Options**:
- A: Treat unmapped transitions as **`notify-only`** (safe default — surface to the user, take no action).
- B: Treat unmapped transitions as **silently ignored** (no notification, no action).
- C: Treat unmapped transitions as a **configuration error** — emit a single warning notification and continue.
- D: Refuse to start the loop until the policy is complete (fail fast at startup, not at runtime).

**Answer**: A.** Unmapped transition → notify-only (safe default — surface, take no auto action).

### Q3: Reconnect/backoff specifics & permanent-failure behavior
**Context**: AC US1 says the loop "survives transient `generacy` stream errors without exiting (reconnects/backs off)." SC-003 requires ≥1 reconnect in a 10-minute window. The spec doesn't specify the backoff schedule, the retry budget, or what happens when reconnection fails beyond the budget. This affects both UX (does the user get told the loop died?) and tunability.
**Question**: What is the reconnect/backoff behavior, and how should permanent stream failure be handled?
**Options**:
- A: Exponential backoff (e.g. 1s, 2s, 4s, … capped at 60s) with **unlimited retries**; loop only exits on user interrupt.
- B: Exponential backoff with a **bounded retry budget** (e.g. 5 attempts or 5 minutes); on exhaustion, emit a notification and exit non-zero.
- C: Exponential backoff with bounded budget; on exhaustion, **drop to notify-only** mode (still surface transitions if the stream comes back) and let the user decide to restart.
- D: Defer to Claude Code's `Monitor` tool default reconnect behavior — this command does not implement its own retry logic.

**Answer**: D.** Don't reimplement retry. `generacy cockpit watch` already backs off and never exits on transient stream errors (#787 FR-009), so this command relies on it. If that process exits permanently, surface it and prompt the user to restart.

### Q4: Notification mechanism
**Context**: FR-006 / SC-001 / AC reference "a user notification" but the term is undefined. Claude Code has at least two surfaces: `PushNotification` (OS-level) and inline chat messages emitted from the command. They have different latency, persistence, and "do I see it when I'm in another window" characteristics. The command file (`watch.md`) needs to know which to invoke.
**Question**: How should the watch loop surface notifications to the user?
**Options**:
- A: **`PushNotification` only** (OS notification — user sees it even when Claude Code isn't focused).
- B: **Inline chat message only** (printed into the running Claude Code conversation).
- C: **Both** — `PushNotification` for attention plus an inline chat message that carries the full transition detail.
- D: Configurable per autonomy policy entry (each transition class chooses).

**Answer**: B.** Inline chat message (which is what Claude Code's `Monitor` tool emits per stdout line). OS `PushNotification` is the A5.3 (v3) enhancement — out of scope for this issue.

### Q5: Argument format — default repo when only an issue number is given
**Context**: FR-002 says the command accepts "an epic reference (issue number or `owner/repo#N`)." When the user types `/cockpit:watch 351`, the command needs to resolve which repo `351` belongs to. Without a defined default, the same invocation behaves differently across machines/checkouts.
**Question**: When `/cockpit:watch <N>` is invoked with a bare issue number, where does the repo come from?
**Options**:
- A: From the **current working directory's `origin` git remote**.
- B: From a **cockpit config setting** (e.g. `cockpit.defaultRepo`); error if unset.
- C: **Always require `owner/repo#N`** — bare numbers are rejected with a usage error.
- D: Try `origin` first, fall back to cockpit config, then error.

**Answer**: Delegate to the engine resolver.** Don't resolve the repo in the slash command — pass the epic ref to `generacy cockpit watch`, which resolves bare numbers via the shared resolver (search `MONITORED_REPOS`, disambiguate on 0/>1; per #788). (None of A–D — the principle is "the slash command doesn't reinterpret refs.")
