# Contract: Version-skew pre-flight guard

**Requirement**: FR-008 / US5 · **Clarification**: Q3 (Option A) · **Location**:
`auto.md § step 1 pre-flight`

The slimmed `auto` no longer drives implementation-PR review rounds. An **old** engine still expects
the client to drive them — so running new-auto against an old engine silently strands the loop. This
guard turns that silent strand into a visible pre-flight abort.

## Probe

- After the existing `command -v generacy` presence check (`auto.md:216`) and the
  `generacy cockpit help doorbell` doorbell-surface probe (`:218`), run **`generacy --version`**.
- `generacy` exposes `.version(VERSION)`, so this is the same CLI `auto` already invokes — no new MCP
  field is introduced.
- Parse the emitted version; compare against **`MIN_GENERACY_VERSION`**.

## `MIN_GENERACY_VERSION`

- A **load-bearing literal** stated verbatim in the playbook prose (and pinned).
- Value = the first generacy release that ships epic #1120's post-validate `implementation-review`
  gate move **and** the `remediation-limit` gate. Concrete digits are a **tasks-phase input** sourced
  from the generacy release notes / epic #1120.

## Behavior

| Condition | Behavior |
|-----------|----------|
| version ≥ `MIN_GENERACY_VERSION` | proceed normally |
| version < `MIN_GENERACY_VERSION` | **abort at pre-flight**: print a visible operator error naming the required version; exit non-zero; do **not** `mkdir -p` the ledger dir; do **not** write a ledger line; do **not** start the loop |
| version output unparseable / missing | **fail closed** (treat as below-minimum) with a **distinct** diagnostic |

The abort shape byte-mirrors the existing **Monitor-absence** (`:208–214`) and **doorbell-absence**
(`:218–224`) hard-fails — a familiar, already-pinned failure idiom.

## Both skew directions

- **old-engine + new-auto** — actively blocked by this guard (old engine's version < minimum). This
  is the dangerous case (old engine expects client-driven rounds new-auto no longer drives).
- **new-engine + old-auto** — inert by construction: old-auto lacks the D.13/G.8/G.9 rows, so the
  engine's new gates fall through to D.10 unknown-state on the old client — a visible escalation, not
  a silent strand. No new guard needed for this direction.

## Pins (`playbook-verification.test.ts`)

- `500-1`: § step 1 pre-flight declares the `generacy --version` probe, the `MIN_GENERACY_VERSION`
  literal, and the below-minimum hard-fail (verbatim operator error, no ledger dir, no loop),
  positioned **after** `command -v generacy`. Assert the fail-closed branch for unparseable output.
