# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-07-17

### Q1: Monitor sensor transport post-fix
**Context**: FR-001/FR-002 retire the `generacy cockpit watch <epic-ref>` subprocess and consolidate to the engine's shared doorbell "delivered through the same event-bus poll loop that `cockpit_await_events` drains." Assumption line 89 says the doorbell "will be plumbed through Monitor the same way `generacy cockpit watch` is today, just from a different producer." But the concrete transport is unspecified — the auto skill can't be rewritten without knowing how the harness `Monitor` tool receives wakes once no subprocess is spawned by the skill.
**Question**: How does the engine's shared-doorbell surface reach the harness `Monitor` tool once `generacy cockpit watch` is no longer spawned by `auto.md` step 2?
**Options**:
- A: The engine exposes a **new CLI subprocess** (e.g., `generacy cockpit doorbell <epic-ref>`) that the skill spawns under `Monitor` in place of `cockpit watch`; internally, the process attaches to the shared event-bus poll loop rather than running its own poll cycle.
- B: `cockpit_await_events` becomes **blocking** (large `maxWaitMs`); the skill removes the `Monitor` sensor entirely and treats the tool's return as the wake signal, with `ScheduleWakeup` as the only belt-and-braces recovery.
- C: The engine exposes an **MCP notification channel** the skill subscribes to; `Monitor` tails a shim process the MCP server writes to, or the harness re-invokes on server-pushed notifications directly.
- D: Defer — engine ships a mechanism; skill picks whichever the engine chooses in generacy#970 and adapts.

**Answer**: A — The engine (generacy#970) exposes a new `generacy cockpit doorbell <epic-ref>` subprocess that /cockpit:auto spawns under the harness Monitor in place of `generacy cockpit watch`; internally it attaches to the shared event-bus poll loop that `cockpit_await_events` drains rather than running its own poll cycle. This preserves the #420 sensor/actuator split (Monitor = wake signal; cockpit_await_events at maxWaitMs=1 = typed data). Explicitly NOT option B: making cockpit_await_events blocking would re-introduce the long-poll that #406 regressed and #420 removed. OWNERSHIP: building this doorbell surface is owned by generacy#970 (scope amended — see the coordination comment on that issue). This spec consumes it.

### Q2: Pre-flight capability probe mechanism
**Context**: FR-006 requires the auto skill to verify the engine exposes the shared-doorbell surface at pre-flight and exit non-zero with an actionable error if absent. The spec does not name the probe mechanism, and the choice affects error semantics: a CLI version check is stable but coarse; an MCP-tool schema probe is precise but requires exposing a capability field; a runtime call has to distinguish "capability missing" from "transient error."
**Question**: How does `/cockpit:auto` detect the engine's shared-doorbell capability at pre-flight?
**Options**:
- A: **`generacy --version` (or `generacy cockpit --version`) semver floor** hardcoded in the skill (e.g., `>= X.Y.Z`), matching the engine version that ships generacy#970.
- B: **MCP tool binding probe** — check whether a new capability-declaring tool (e.g., `cockpit_doorbell_capabilities`) is present in the session's tool binding, alongside the existing 7 `cockpit_*` tools.
- C: **Runtime capability call** — invoke a lightweight `cockpit_status` (or dedicated `cockpit_capabilities`) call that returns a capability set; refuse if `shared_doorbell` isn't in it.
- D: **Combined** — CLI floor AND MCP tool presence, both required (belt-and-braces so mixed installs can't half-satisfy).

**Answer**: A — Pre-flight probes a CLI semver floor: `generacy` (or `generacy cockpit`) version ≥ the release that ships generacy#970's doorbell surface. A `generacy cockpit doorbell --help` subcommand-presence check is an acceptable, more version-robust variant if we prefer not to hardcode a version. On failure: print an actionable error naming the missing engine surface + the manual assist commands (/cockpit:watch, /cockpit:status, /cockpit:advance) and exit non-zero — no fallback to spawning `generacy cockpit watch`.

### Q3: Doorbell-death recovery ownership
**Context**: FR-005 retires the C5 re-spawn state machine on the skill side; recovery "MUST live behind the shared-doorbell surface itself, not in the skill." But if the doorbell transport dies mid-run (subprocess exit, MCP channel drop, or blocking `cockpit_await_events` returning an error), the skill still has to decide whether to actively re-arm anything or purely wait for `ScheduleWakeup` (FR-004). The choice determines whether `auto.md` retains any watch-lifecycle vocabulary at all.
**Question**: What is the skill's response when the shared-doorbell transport indicates failure mid-run?
**Options**:
- A: **Skill is passive** — heartbeat (`ScheduleWakeup`, FR-004) is the sole recovery; a dead doorbell degrades to exactly heartbeat cost until the engine restores it. `auto.md` retires all `watch-lifecycle` ledger vocabulary.
- B: **Skill re-arms once**, then falls back to heartbeat-only — one re-attempt at fixed backoff (1s), then treat further failures as engine-owned and rely on heartbeat.
- C: **Skill re-arms with the FR-005 pre-`cockpit watch` C5 backoff schedule** (1s → 2s → 4s … → 300s hold), but against the new transport (Option A/B/C from Q1's transport) — same shape as today's C5, just re-parented.
- D: **Fatal exit** — dead doorbell is treated as a pre-flight-class engine failure; skill prints an actionable error and exits non-zero rather than degrading.

**Answer**: A — The skill stays passive: the ScheduleWakeup heartbeat (#420 FR-004, 5 min) is the sole recovery signal; a dead doorbell degrades to exactly heartbeat cost until the engine restores it. Resilience for the doorbell transport lives behind the shared-doorbell surface itself (engine-side) per FR-005. auto.md retires all watch-lifecycle / C5 re-spawn ledger vocabulary.

### Q4: FR-008 dispatch-class narrowing decision
**Context**: FR-008 / US4 review the per-event `cockpit_status(json=true)` re-check (`auto.md:85`) against dispatch classes D.1–D.11 for candidates where the batched event's carried state is sufficient. The spec explicitly says the outcome "is a load-bearing decision, not an ambient one" and must be captured in Assumptions / Out of Scope. Deferring is offered as a valid outcome. Without a decision, tasks.md can't distinguish tuning work from wake-source-swap work.
**Question**: For this feature, what is the intended outcome of the FR-008 dispatch-class re-check analysis?
**Options**:
- A: **Defer** — this feature is wake-source consolidation only; the re-check cadence remains unchanged and any narrowing is filed as a follow-up issue. Out of Scope grows one line; no dispatch class is touched.
- B: **Narrow ledger-only classes' behavior further** — codify that D.9/D.9a/D.9b/D.9c/D.9d already skip the re-check (already true) and restate as an invariant; no other classes narrow.
- C: **Narrow a named subset** — identify specific actionable classes (e.g., D.5 mechanical merge, D.8 phase-queue) where the batched state is provably authoritative and skip the re-check for those; keep it for D.1–D.4, D.6, D.7, D.10, D.11.
- D: **Analyze in-spec, decide in tasks.md** — the analysis lives in this spec's research notes but the actual narrow/don't-narrow decision is deferred to task-plan time.

**Answer**: A — Defer. This feature is wake-source consolidation only; the per-event cockpit_status(json=true) re-check cadence is left unchanged and any narrowing is filed as a follow-up issue, so this PR does not touch the 'live state is authoritative' trust boundary. Capture the deferral in Out of Scope. Also restate the existing invariant (option B): ledger-only classes D.9/D.9a/D.9b/D.9c/D.9d already skip the re-check.

### Q5: SC-001 verification method
**Context**: SC-001 targets a ~50% background GraphQL rate drop on an idle run and specifies measurement by "Count GitHub GraphQL requests attributable to the run over a fixed idle window; compare pre-fix vs. post-fix." The mechanism (manual observational vs. automated instrumentation vs. companion-issue-owned) is not fixed, and it determines what artifacts the implementation PR must ship (e.g., a request counter, a soak-test harness, or nothing agency-side).
**Question**: How is SC-001's ~50% GraphQL reduction verified for this feature's PR to close?
**Options**:
- A: **Manual observational soak** on a representative fixture epic (e.g., snappoll) — operator runs pre-fix and post-fix, records GraphQL rate from GitHub's rate-limit endpoint, attaches the numbers to the PR. No code artifact.
- B: **Automated request counter** added to the skill or MCP server (instrumentation only) that emits per-run GraphQL counts to the ledger's L.6 summary; PR includes a fixture-based test asserting the reduction.
- C: **Companion-owned** — rely on the generacy#970 companion's own instrumentation / verification; agency-side PR closes on FR/SC parity checks alone (playbook drift audit + fixture-epic completion parity per SC-004).
- D: **Both A and C** — companion instrumentation is primary; a one-time manual soak is captured in the PR body as sanity check but not required for merge.

**Answer**: D — SC-001's ~50% GraphQL reduction is verified PRIMARILY by generacy#970's GhWrapper instrumentation (a markdown skill cannot count GraphQL requests itself), SUPPLEMENTED by a one-time manual observational soak on a representative fixture epic (snappoll) recorded in the PR body as a sanity check — NOT merge-gating. This agency PR's actual merge gates are the process-inventory check (no `generacy cockpit watch` subprocess post-fix, SC-002), the playbook-verification re-pin (SC-007), and epic-completion parity (SC-004).
