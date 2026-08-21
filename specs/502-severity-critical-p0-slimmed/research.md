# Research: Fix inverted engine-compatibility gating in `/cockpit:auto`

**Issue**: [generacy-ai/agency#502](https://github.com/generacy-ai/agency/issues/502)
**References**: auto.md @ agency `develop` 1455ce5; engine @ generacy `develop` 155b3464.

## Problem evidence (why the current guard is wrong in both directions)

The current pre-flight (`auto.md:226–244`) parses `generacy --version` and hard-fails below `MIN_GENERACY_VERSION = 0.2.0`. The literal is inverted:

| Engine build | Reported version | Ships #1120? | `>= 0.2.0` guard verdict | Correct verdict |
|--------------|------------------|--------------|--------------------------|-----------------|
| npm latest/stable | `0.10.2` | **No** (pre-#1120; changesets unreleased on `develop`) | **admit** ✗ | reject / legacy-path |
| legacy range | `0.2.0`–`0.10.2` | No | **admit** ✗ (silently strands) | reject / legacy-path |
| preview | `0.0.0-preview-20260821014149-155b346` | **Yes** | **reject** ✗ | admit |
| source build | `0.1.1` | **Yes** | **reject** ✗ | admit |

**Direction 1 (admit-and-strand):** every legacy engine passes the guard, then strands at `waiting-for:implementation-review` because it emits the gate pre-validate while `auto`'s approve routes only to `cockpit_merge`, which refuses without `completed:validate`.

**Direction 2 (reject-the-compatible):** the only builds that ship #1120 sort below `0.2.0`, so the guard rejects them.

**The deeper fault:** version can *never* confirm the runtime gate model, because the model is controlled by two engine flags that default false:

- `reviewPhaseEnabled = false` (`generacy worker/config.ts:143`)
- `ciMergeGateEnabled = false` (`generacy worker/config.ts:151`)

A stock #1120-bearing engine with both flags off still fires `implementation-review` **pre-validate**. So even a "correct" version literal would admit-and-strand the common deployed (flag-off) case. Version is the wrong axis entirely.

## Decision 1 — Detection mechanism: hybrid, runtime-authoritative (Q1=D)

**Chosen**: an **advisory** pre-flight probe plus an **authoritative runtime gate-placement** signal.

- **Runtime (authoritative)**: at D.3, observe whether `waiting-for:implementation-review` **co-occurs** with `completed:validate` in the issue's live labels.
  - co-occurs → the engine drives review→remediate→validate server-side and the gate is the *post-validate final approval* (#1120 model).
  - `completed:validate` absent → the gate fired *pre-validate*; the engine expects the client to drive review rounds (pre-relocation / flag-off model).
- **Pre-flight (advisory)**: `generacy --version` may still be echoed for operator context, but it never blocks the run.

**Why runtime is authoritative and pre-flight cannot be**: pre-flight runs *before* any issue reaches `implementation-review`, so the co-occurrence signal is unobservable then. And no engine surface reports the gate model or the flag state (see Decision 3). The label co-occurrence is the only signal that reflects the *actual* gate the engine emitted, and it is already in D.3's hands (enriched-line `labels` / `cockpit_status` fallback).

**Alternatives rejected**:

- **B — corrected version literal**: rejected. npm stable stays `0.10.2` until #1120 ships, and flag-off #1120 engines still strand, so no version literal can distinguish compatible from incompatible engines. This is the exact failure being fixed.
- **A — pre-flight capability probe against a dedicated surface**: infeasible today (Decision 3). Adding such a surface is cross-repo and out of scope.
- **C — pure runtime, no pre-flight at all**: rejected in favour of D only to retain an advisory operator hint; functionally C and D converge because the pre-flight is advisory-only.

## Decision 2 — Flag-off / legacy outcome: legacy path + fail-closed net (Q2=C)

**Chosen**: route **detectable** flag-off engines to a **legacy advance-on-approve** path; **fail closed** only when neither model can be detected.

- Legacy path: on the pre-validate (flag-off) model, `approve` → `cockpit_advance(issue=<ref>, gate="implementation-review")` — re-adding the branch #500 removed entirely. This applies `completed:implementation-review` server-side and returns control to the engine's own validate→merge cadence.
- Fail-closed net: when neither post-validate nor legacy model resolves, exit non-zero with an actionable diagnostic naming `reviewPhaseEnabled` / `ciMergeGateEnabled`. No silent strand; no admit-and-strand.

**Why not fail-closed-only (spec Q2 Option A)**: the engine defaults are flag-**off**, so flag-off is the *common deployed case*. Fail-closed-only would leave stock engines unable to run `auto` at all — re-introducing the P0 from a different angle. Q2=C satisfies FR-002's "working legacy path OR fail closed" while keeping the fail-closed safety net for genuinely undetectable engines.

**Why the legacy path is safe** (§1 never-merge-on-red): `cockpit_advance(gate="implementation-review")` does **not** merge — it advances the labeled gate and lets the engine run validate. The engine still owns the green/red decision and the merge; `auto` never merges on red on either branch.

## Decision 3 — Capability signal source: none at pre-flight (Q3=C)

Verified at clarify time via `generacy cockpit --help`: the subcommands exposed are `watch`, `doorbell`, `status`, `advance`, `context`, `merge`, `queue`, `resume`, `scope`, `mcp`. **None** report the review/merge-gate model or the `reviewPhaseEnabled` / `ciMergeGateEnabled` flag state. There is no CLI subcommand or MCP field to probe.

Adding such a surface would be a change in the `generacy` repo (cross-repo, out of scope per spec § Out of Scope). Therefore detection relies on the runtime label observation of Decision 1, and the pre-flight is advisory only.

## Decision 4 — Pin-test 500-1 scope: freeze mechanism AND wording (Q4=A)

Re-pin `500-1` to freeze **both** the corrected detection mechanism **and** the exact fail-closed diagnostic string (flag names verbatim), byte-mirroring the existing Monitor/doorbell/version pre-flight pins.

**Why not loose (Option B)**: FR-004 requires the fail-closed branch to byte-mirror the sibling pre-flight fails, and the CLAUDE.md re-pin rule mandates re-pinning without weakening. A loose "message present" assert would drop the load-bearing flag-name contract (`reviewPhaseEnabled`, `ciMergeGateEnabled`) — the very thing that makes the diagnostic actionable. The pin must also carry a **negative** assertion that the removed `MIN_GENERACY_VERSION` / `0.2.0` literal and its below-minimum error string are gone.

## Where the fail-closed branch fires (open interaction, tasks-phase decision)

FR-004 says the fail-closed branch should "exit non-zero, no ledger directory, no ledger line, no loop — byte-mirroring the Monitor / doorbell / version pre-flight fails" and cites `auto.md:208–244` (the pre-flight region). But Decision 1 makes detection **authoritative at runtime** (D.3), where the ledger directory already exists.

Two candidate placements:

1. **Runtime fail-closed (plan's position)**: the fail-closed *decision* happens at D.3 when the label co-occurrence resolves to neither model (e.g. `completed:validate` absent **and** a `cockpit_advance(gate="implementation-review")` attempt returns a typed error revealing the engine has no such gate). It adopts the pre-flight *idiom* — verbatim diagnostic block, exit non-zero, halt the loop — but writes a final ledger line documenting the fail-closed rather than "no ledger line" (the dir already exists by runtime). This is the honest reading of "detection is runtime-authoritative."
2. **Pre-flight fail-closed (literal FR-004 reading)**: keep a pre-flight guard that fails closed only in a degenerate no-signal case (e.g. `generacy --version` unparseable *and* no capability surface), byte-mirroring the sibling fails exactly (no ledger dir). This preserves FR-004's "no ledger directory" clause literally but can only fire on a signal the advisory probe explicitly cannot produce for the flag-off case — so in practice it would rarely fire.

**Recommendation for tasks phase**: adopt placement 1 (runtime), and reconcile FR-004 by treating "no ledger directory / no ledger line" as describing the *idiom template* (the sibling pre-flight fails) rather than a literal runtime requirement — the runtime fail-closed keeps the message shape + exit-non-zero + halt-loop, and pin `500-1` asserts the diagnostic wording regardless of firing site. If a reviewer insists on the literal FR-004 shape, placement 2 can be added as a redundant pre-flight net, but it does not replace the runtime branch (the flag-off strand is only observable at runtime).

## Legacy-advance verb: `cockpit_advance`, not `cockpit_resume`

The restored legacy path uses `cockpit_advance(issue=<ref>, gate="implementation-review")`. This mirrors the two existing engine-gate advances in the playbook:

- D.4 `manually validated` → `cockpit_advance(issue, gate="manual-validation")` (`auto.md:808`)
- D.13 `resume remediation` → `cockpit_advance(issue, gate="remediation-limit")` (`auto.md:1053,1517`)

`cockpit_resume` is the wrong verb — it is process/paused-issue resume, not a labeled-gate answer (documented at `auto.md:1053,1517`). Every labeled engine gate in the playbook resolves via `cockpit_advance(issue, gate=<name>)`; the legacy path is consistent with that idiom, which is why re-adding it is low-risk.

## Scope boundaries confirmed

- **Out of scope**: changing engine flag defaults, shipping #1120 to npm, adding a capability-reporting `generacy` surface (all cross-repo).
- **Out of scope**: resuming remediation from the final-approval gate (that is the separate G.9 / D.13 remediation-limit gate).
- **Out of scope**: the new-engine + old-`auto` skew direction — already inert by construction (`auto.md:244`); FR-006 only requires preserving that documented inertness.

## Key sources

- Issue [agency#502](https://github.com/generacy-ai/agency/issues/502) — the P0 report and fix direction.
- `packages/claude-plugin-cockpit/commands/auto.md` @ 1455ce5 — pre-flight `:226–244`, D.3 `:747–775`, G.8 `:1478–1500`, gate-mapping `:1574`.
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — `500-1` @ `:5887`.
- Engine `worker/config.ts:143,151` (flag defaults) and `merge.ts:36,227-241` (`cockpit merge` refuses without `completed:validate`) @ generacy 155b3464 — cross-repo, read-only evidence.
- [agency#500](https://github.com/generacy-ai/agency/issues/500) spec/plan — the slimming that removed the legacy advance path this fix restores.
