# Research: Retire the second poll loop in `/cockpit:auto`

Technology and design decisions with rationale. This document backs the choices summarized in `plan.md § Key Technical Decisions`. Decisions are anchored to the five clarification answers (Q1–Q5 in `clarifications.md`).

## Context

`/cockpit:auto`'s post-#420 loop shape is:

- **Sensor (step 2)**: `generacy cockpit watch <epic-ref>` runs under harness `Monitor` as a background doorbell. On each stdout line, Monitor re-invokes the model.
- **Fetcher (step 4)**: on each wake, the parent drains typed events via `cockpit_await_events(epic, cursor, maxWaitMs=1, coalesceWindowMs=3000)`.
- **Heartbeat (step 4 C4)**: `ScheduleWakeup(delaySeconds=300, ...)` fires belt-and-braces when Monitor is silent.
- **Re-spawn (step 5 C5)**: on Monitor exit, the loop re-spawns `generacy cockpit watch` with exponential backoff capped at the 5-minute heartbeat interval.

The problem: **the sensor process runs a full poll loop of its own**. Although the parent treats stdout as a doorbell only (never parses content), `generacy cockpit watch <epic-ref>` internally invokes `runOnePoll` + `resolveEpic` every 30 seconds (`gh issue view` + per-PR `gh pr checks` — all GraphQL-backed). Meanwhile, `cockpit_await_events`'s server-side event-bus registry spins up **its own** poll loop in the MCP server process. Two loops per epic, no coordination, both burning GraphQL quota against the shared token.

Cost signal: continuous 2× on background GraphQL per auto run, contributing to `christrudelpw`-shared rate-limit exhaustion during dogfood runs. The engine-side companion issue (**generacy#970**) exposes a new `generacy cockpit doorbell <epic-ref>` surface that attaches to the shared event-bus poll loop internally — one loop per epic, doorbell delivery only. This feature is the agency-side half: swap the sensor CLI verb, retire the state machine that survived only to manage the second loop's lifecycle.

## Decision 1: Retain sensor-under-Monitor; swap only the CLI verb (Q1=A)

**Chosen**: The step-2 sensor stays under harness `Monitor`. Only the spawned CLI verb changes: `generacy cockpit watch <epic-ref>` → `generacy cockpit doorbell <epic-ref>`. Internally, the new subprocess attaches to the shared event-bus poll loop `cockpit_await_events` drains instead of running its own poll cycle.

**Alternatives considered**:

- **Option B — make `cockpit_await_events` blocking** (large `maxWaitMs`), remove the Monitor sensor entirely, treat the tool's return as the wake signal. **Rejected**: this re-introduces the long-poll shape #406 regressed and #420 removed. Every empty return burns a full model turn re-reading session context (the 41.8M-cache-read-token pathology snappoll measured). The whole point of #420's rewrite was that wake-ups cost zero tokens until they fire; Option B walks that back.
- **Option C — engine-side MCP notification channel** the skill subscribes to (Monitor tails a shim, or the harness re-invokes on server-pushed notifications directly). **Rejected**: adds a new transport (MCP push) with no operational precedent in this project. Subprocess-under-Monitor is a proven shape; keeping it minimizes what has to change across the two repos.
- **Option D — defer** (let generacy#970 pick a mechanism; this spec adapts). **Rejected**: coordination was requested; deferring both sides is a stall. A named decision on the transport lets generacy#970 build against a concrete consumer.

**Rationale**: The #420 sensor/actuator split (Monitor = wake signal; `cockpit_await_events` at `maxWaitMs=1` = typed data) is orthogonal to *which* CLI runs under Monitor. Swapping the verb preserves everything above and below the sensor — cursor semantics, batch ordering, dispatch table, gate contracts — and lets generacy#970 own the deduplication work internally. One repo builds the shared loop; this repo consumes it.

**Cross-repo ownership**: Building the `generacy cockpit doorbell` CLI surface is generacy#970 (scope amended — see the coordination comment on that issue). This spec **consumes** it.

## Decision 2: CLI subcommand-presence probe as pre-flight capability check (Q2=A)

**Chosen**: Pre-flight probes the engine's doorbell capability by running `generacy cockpit doorbell --help` (or, equivalently but more coarsely, checking a `generacy` CLI semver floor that names the release generacy#970 shipped in). Success (exit 0) means the engine ships the doorbell surface. On failure: print an actionable error naming the missing engine surface + the manual assist commands (`/cockpit:watch`, `/cockpit:status`, `/cockpit:advance`) and exit non-zero. **No fallback to spawning `generacy cockpit watch`**.

**Alternatives considered**:

- **Option B — MCP tool-binding probe** (check for a new capability-declaring tool, e.g., `cockpit_doorbell_capabilities`, alongside the existing seven `cockpit_*` tools). **Rejected**: the doorbell is a CLI surface, not an MCP tool. Wiring a marker MCP tool just to probe a CLI capability adds a whole new tool with no other purpose — a shape unmatched by anything else in the plugin. The CLI probe is the direct measurement.
- **Option C — runtime capability call** (invoke a lightweight `cockpit_status` or `cockpit_capabilities` that returns a capability set; refuse if `shared_doorbell` isn't in it). **Rejected**: requires the engine to expose a capability field and to keep it in sync with the actual doorbell surface's shipping state. The subcommand-presence probe measures the exact thing that will be spawned; the runtime call measures a proxy.
- **Option D — combined** (CLI floor AND MCP tool presence, both required). **Rejected**: adds a second failure mode (mixed installs where one probe succeeds and the other doesn't) with no operational benefit — the CLI probe is the sufficient predicate.
- **Semver floor as an alternative variant** (Q2 acknowledges this as acceptable): hardcode `generacy --version >= X.Y.Z` where `X.Y.Z` is the release generacy#970 shipped in. Simpler probe, but couples this repo to specific engine releases. The `--help` subcommand-presence probe is more version-robust (adapts naturally to any release that ships the surface, including pre-release / branch builds). Either shape satisfies Q2=A; the playbook chooses the subcommand-presence probe as the canonical form.

**Rationale**: Pre-flight hard-fail is the pattern this playbook already uses in two places (harness `Monitor` presence in step 1, cockpit MCP tool binding in step 3 — both cite "fail-loud on missing surface"). Adding a third fail-loud check for the doorbell surface is consistent with the existing shape. The **no-fallback** rule is load-bearing: silently degrading to `generacy cockpit watch` would mask engine-agency version drift and re-introduce the double-poll condition this PR exists to fix. The manual assist commands are a fully supported operator path (per #420 Q3=A rationale, "dark-surface fallback was the failure mode that produced the #86/#800/#801 chain") — that reasoning applies verbatim here.

**Implementation note**: The doorbell probe MUST run *after* the existing `Monitor` presence check (step 1, first pre-flight) and the `command -v generacy` check (step 1, second pre-flight). Ordering: `Monitor present?` → `generacy on $PATH?` → `generacy cockpit doorbell --help` returns 0? → `gh auth status`? → ledger directory. Each check is cheap; each failure prints and exits non-zero without touching the filesystem.

## Decision 3: Skill stays passive on doorbell death (Q3=A)

**Chosen**: `ScheduleWakeup` heartbeat (#420 FR-004, 5 min) is the sole recovery signal when the doorbell transport indicates failure mid-run. No skill-side re-spawn state machine. Transport resilience lives behind the doorbell surface itself (engine-side). `auto.md` retires all `watch-lifecycle` / C5 re-spawn ledger vocabulary.

**Alternatives considered**:

- **Option B — skill re-arms once, then falls back to heartbeat** (one 1s re-attempt on Monitor-reported exit; further failures degrade to heartbeat-only). **Rejected**: adds a partial state machine that has to be reasoned about (what if the retry succeeds but the transport dies again in 30s?) for negligible latency benefit — the 5-minute heartbeat already bounds detection to `~5m30s`, matching #420's accepted worst case.
- **Option C — skill re-arms with the pre-#431 C5 backoff schedule** (1s → 2s → 4s → …, cap 300s) but against the new doorbell transport. **Rejected**: this is the exact state machine this PR is trying to retire. If the doorbell transport needs re-spawn logic, it belongs behind the doorbell surface (engine-owned per generacy#970), not in the skill. Duplicating it here maintains two independent recovery layers — the mistake this PR corrects at a broader level (two independent poll loops).
- **Option D — fatal exit on dead doorbell** (treat transport death as a pre-flight-class engine failure; print + exit non-zero). **Rejected**: too brittle for a long-running loop. A transient transport hiccup should not require a fresh operator invocation — the heartbeat's 5-minute window is a reasonable recovery cadence for a hiccup that resolves itself, and a persistent failure degrades to a heartbeat-only cadence that the operator will notice from the ledger.

**Rationale**: The skill's minimum-viable role in a doorbell-death scenario is "keep going until the engine restores signal." The heartbeat already provides that with zero token cost until fire. Adding skill-side re-arm machinery re-introduces the coupling this PR removes — the doorbell surface is engine-owned; its resilience is engine-owned. The skill's job is to consume the wake signals it gets, and to fall back to the heartbeat cadence when they stop coming.

**Retired vocabulary** (per Q3=A):

- Ledger row: `watch-lifecycle · spawn · armed` (step 2 arm-up ledger line). Retired.
- Ledger row: `watch-lifecycle · spawn · spawn failed: <description>` (step 2 immediate spawn failure). Retired.
- Ledger row: `watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s exit=<code>` (step 5 C5 re-spawn accounting). Retired.
- Ledger row: `watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s spawned`. Retired.
- Ledger row: `watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s spawn failed: <description>`. Retired.
- Ledger cheatsheet "action + outcome vocabulary" table: three rows dropped (watch arm-up, watch re-spawn, and the associated `<epic-ref>` slot commentary above the "Watch lifecycle" cluster).
- § Ledger `What does NOT count` bullet: revert to the pre-#420 wording ("re-arms are not dispatches") since the mechanism they accounted for no longer exists on the skill side. Any doorbell-transport arm/re-arm accounting that the engine wants to surface is emitted through `cockpit_await_events` as an ordinary event, not through a skill-side ledger row.
- In-memory loop state (`data-model.md`): `watchRespawnBackoffSec` and `watchRespawnAttemptCounter` fields retired. `monitorHandle` remains — the skill still spawns the doorbell subprocess under Monitor and holds its handle; only the *re-spawn accounting* around it is removed.

## Decision 4: Defer the per-event `cockpit_status` narrowing analysis (Q4=A)

**Chosen**: This feature is wake-source consolidation only. The per-event `cockpit_status(json=true)` re-check cadence (`auto.md:85`) for actionable dispatch classes (D.1–D.8, D.10, D.11) is left unchanged. Ledger-only classes (D.9/D.9a/D.9b/D.9c/D.9d) already skip the re-check per § Invariants #8's cost contract — this PR restates that as an invariant. Any narrowing (e.g., trusting the batched event's carried state for D.5 mechanical merge or D.8 phase-queue) is filed as a follow-up issue.

**Alternatives considered**:

- **Option B — narrow ledger-only classes' behavior further** (codify that D.9/D.9a/D.9b/D.9c/D.9d already skip the re-check and restate as an invariant; no other classes narrow). **Partially adopted**: the invariant restatement piece is included (§ Invariants #8 already carries the "ledger-only rows are cheap by contract" language; this PR does NOT weaken or expand it, but the plan explicitly names it as an anchor). No new class narrows.
- **Option C — narrow a named subset** (identify specific actionable classes — e.g., D.5, D.8 — where the batched state is provably authoritative and skip the re-check for those; keep it for the rest). **Rejected in this PR**: analysis of "which classes are provably authoritative from the batched event alone" is a load-bearing trust-boundary judgment that deserves its own spec + clarifications + review. Bundling it into a wake-source-swap PR risks a subtle regression (a class classed as "batch-authoritative" that isn't).
- **Option D — analyze in-spec, decide in tasks.md** (research goes here; the actual narrow/don't-narrow decision defers to task-plan time). **Rejected**: matches the "half-in-scope" anti-pattern the clarifications explicitly named ("load-bearing decision, not an ambient one"). Making the decision at tasks time delays it into an execution artifact where it's less reviewable.

**Rationale**: The trust boundary "live state is authoritative; batched event is advisory" was set by #406 and re-affirmed by #420. Touching it requires a separate spec that names the batched-event carrying contract per dispatch class. This PR's outcome is asymmetric: a wake-source swap that reduces background poll cost is a clean win; a re-check narrowing that reduces per-event tool-call cost is a distinct win that pays for its own analysis. Keeping them separate keeps each PR's risk profile clean.

**Out of Scope addition** (called out in `plan.md § Out of Scope`): any narrowing of the per-event `cockpit_status(json=true)` re-check cadence for actionable dispatch classes. Filed as a follow-up.

## Decision 5: SC-001 verification is engine-instrumented, agency-side sanity-only (Q5=D)

**Chosen**: The ~50% background GraphQL reduction (SC-001) is verified **primarily** by generacy#970's `GhWrapper` instrumentation — a markdown skill cannot count GraphQL requests itself. A one-time manual observational soak on a representative fixture epic (snappoll) is recorded in the PR body as a sanity check but **is not merge-gating**. The agency PR's actual merge gates are: **SC-002** (process inventory: no `generacy cockpit watch` subprocess in the auto run's process tree post-fix), **SC-007** (playbook-verification test re-pin), and **SC-004** (epic-completion parity vs. the pre-#431 baseline).

**Alternatives considered**:

- **Option A — manual observational soak only** (operator runs pre-fix / post-fix on snappoll, records GraphQL rate from GitHub's rate-limit endpoint, attaches numbers to the PR). **Rejected as the merge gate**: manual soaks have wide variance run-to-run (network jitter, coincident traffic from other tools sharing the token); a merge gate that depends on ±10% GraphQL rate variability produces false-red merge blocks. Retained as the *sanity check*.
- **Option B — automated request counter in the skill or MCP server** (per-run GraphQL counts emitted to the ledger's L.6 summary; fixture test asserts the reduction). **Rejected**: a markdown playbook has no primitive for observing MCP-side GraphQL calls; this instrumentation would have to live in the MCP server, which is generacy#970's territory. The correct locus is generacy#970, not this repo.
- **Option C — companion-owned verification only** (rely on generacy#970's own instrumentation; agency PR closes on FR/SC parity checks alone — playbook drift audit + fixture-epic completion parity per SC-004). **Almost right, but incomplete**: adding a one-time manual soak to the PR body has near-zero cost and provides a human-readable sanity number that would catch an engine instrumentation bug (e.g., if generacy#970's instrumentation itself has a defect that under-reports the reduction).

**Rationale**: The measurement responsibility follows the surface being measured. GraphQL request counts happen inside the MCP server process (where `cockpit_await_events`'s poll loop lives) and inside the `generacy cockpit watch`/`doorbell` subprocesses. Both live in `generacy` — the agency skill has no observation point. Making agency-side merge depend on an unobservable metric is a category error; making the agency merge gate the *structural* verifications (process inventory, playbook shape, epic-completion parity) plus a sanity note keeps agency's merge gate observable from within agency.

**PR body contents (per Q5=D)**:
- SC-002 result: `ps -ef | grep 'generacy cockpit watch'` on a live auto run post-fix; zero rows expected.
- SC-004 result: snappoll fixture completed to `epic-complete` with the same gates cleared as the pre-#431 baseline; ledger diff pinned.
- SC-007 result: `pnpm test packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` green with re-pinned assertions.
- SC-001 sanity number: pre-fix vs. post-fix GraphQL rate from a snappoll soak, quoted from generacy#970's instrumentation output. Non-gating.

## Implementation Patterns

Three patterns govern the edits to `auto.md`:

### Pattern A: Pre-flight capability probe (new)

The step-1 pre-flight sequence gains one check between `command -v generacy` and `gh auth status`:

```
1. harness `Monitor` present in tool binding?                (existing, unchanged — #420 FR-006)
2. `command -v generacy` returns 0?                          (existing, unchanged)
3. `generacy cockpit doorbell --help` returns 0?             (NEW — Decision 2)
   ↳ on failure: print
     "Engine doorbell surface not available. `/cockpit:auto` needs a `generacy` build that ships `generacy cockpit doorbell` (generacy#970). Upgrade the cluster's `generacy` build, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance."
     then exit non-zero. Do NOT create the ledger directory. Do NOT write a ledger line — pre-flight refuses to touch the filesystem for a run that can never succeed.
4. `gh auth status` returns 0?                               (existing, unchanged)
5. cwd is a writable git repo? create ledger directory.      (existing, unchanged)
```

**Ordering rationale**: `Monitor` presence is cheapest (in-process check); `command -v generacy` is a cheap PATH lookup; `generacy cockpit doorbell --help` spawns a subprocess but returns fast; `gh auth status` hits the network. Fail-fast cheapest-first.

### Pattern B: Step-2 sensor swap

The verbatim edit is:

```
BEFORE (auto.md:43):
  Spawn `generacy cockpit watch <epic-ref>` under the harness `Monitor` tool at loop start.

AFTER:
  Spawn `generacy cockpit doorbell <epic-ref>` under the harness `Monitor` tool at loop start.
```

Every downstream reference in step 2, step 4, step 5, § Invariants #7, § Examples 1–5, and the ledger cheatsheet's watch-related rows migrates in lockstep:

- All prose references to "the `generacy cockpit watch` sensor" → "the `generacy cockpit doorbell` sensor."
- The § Invariants #7 language ("`cockpit watch`") continues to refer to the *doorbell contract* — stream consumption is unfiltered, doorbell content is a doorbell only. The invariant text updates to say "doorbell" verbatim.
- The § Examples "Sensor arm-up" line updates: `Sensor arm-up — step 2 spawns generacy cockpit doorbell christrudelpw/epic#42 under harness Monitor`.
- The retired ledger rows (per Decision 3) are struck from § Ledger § Action + outcome vocabulary; the surrounding prose ("Watch lifecycle" cluster) is deleted or repurposed to a single sentence noting the sensor is spawned but produces no skill-side ledger row.

### Pattern C: Step-5 C5 retirement

The Watch re-spawn (C5) block at `auto.md:151–206` deletes in full. Step 5 collapses back to "Cursor recovery" only (Branch A + Branch B, unchanged from #924). The `data-model.md § In-memory loop state` table loses `watchRespawnBackoffSec` and `watchRespawnAttemptCounter`; `monitorHandle` is retained (the parent still holds the doorbell subprocess's Monitor handle for the process's lifetime, but no re-spawn accounting hangs off it).

The step-5 heading updates from "Cursor recovery + Watch re-spawn" back to "Cursor recovery." The final paragraph of step-5 (currently the "Watch re-spawn (C5)" bookend) removes with it.

The § Invariants section is unchanged in count (still 9 invariants); no invariant is added or removed. The playbook-verification test's `406-6` assertion pinning "exactly nine numbered items" continues to hold.

## Sources and References

- **Companion (engine-side)**: **generacy-ai/generacy#970** — cockpit auto exhausts GitHub GraphQL rate limit. Building the shared-doorbell surface (`generacy cockpit doorbell`) is scope-amended onto that issue per the coordination comment there.
- **Regression origin (this repo)**: `agency#420` — restored the Monitor sensor model in `/cockpit:auto` (introduced the `generacy cockpit watch` sensor spawn that this PR replaces with `doorbell`).
- **Prior sensor/actuator split**: `agency#406` — moved dispatch onto the typed-batch `cockpit_await_events` MCP tool; `agency#420` FR-002 / SC-001 restored the sensor.
- **Snappoll dogfood transcript** (baseline for the SC-004 completion-parity check): `~/.claude/projects/-workspaces-snappoll/…` — the snappoll fixture ledger + auto-run transcripts.
- **Dark-surface fallback lineage**: `#86 → #800 → #801` chain — cited in Decision 2's rationale for the no-fallback rule (mirrors #420's Q3=A anchor).
- **Existing pre-flight patterns**: `auto.md:31–37` (Monitor presence check), `auto.md:39` (`command -v generacy` / `gh auth status`), `auto.md:59–62` (cockpit MCP tool binding check) — the new doorbell probe follows the same fail-loud shape.
- **Existing playbook-verification pins**: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — tests `406-2`, `406-3`, `406-6` are the load-bearing pins this PR re-anchors. The rule is "re-pin to the NEW contract, do not weaken."
