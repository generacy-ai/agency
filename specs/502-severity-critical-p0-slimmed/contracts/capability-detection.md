# Contract: Hybrid engine-capability detection

**Requirements**: FR-001, FR-003 · **Clarifications**: Q1=D (hybrid), Q3=C (no pre-flight surface) · **Location**: `auto.md § step 1` pre-flight (`:226–244`, removal) + `auto.md § D.3` (`:747–775`, addition) + `auto.md § Gate contract G.8` (`:1478–1500`)

Replace the inverted `MIN_GENERACY_VERSION = 0.2.0` version-literal guard with detection that is **runtime-authoritative** and **pre-flight-advisory**. Detection reads labels D.3 already has — no new MCP field, engine surface, or CLI subcommand.

## Removal (pre-flight, `:226–244`)

- Delete the `MIN_GENERACY_VERSION` literal, the `>= 0.2.0` comparison, the below-minimum verbatim operator error, and the unparseable/missing fail-closed branch.
- The `generacy --version` probe MAY remain as an **advisory** echo (operator context only). It MUST NOT exit non-zero on version and MUST NOT gate the run. Version cannot distinguish compatible from incompatible engines (npm stable `0.10.2` is pre-#1120; #1120 builds report `0.0.0-preview-*` / `0.1.1` below the old literal).
- Retain the FR-006 sentence documenting new-engine + old-`auto` inertness (`:244`), trimmed of its now-stale version-guard reference.

## Runtime detection (authoritative, at D.3)

At `waiting-for:implementation-review` (§ D.3), before applying the `approve` verdict, resolve the engine model from the issue's live labels (enriched-line `labels` field per E3, or the `cockpit_status(issue=<ref>, json=true)` fallback — no extra query on the enriched-line path):

| Observation | Model | `approve` routes to |
|-------------|-------|---------------------|
| `completed:validate` **co-occurs** with `waiting-for:implementation-review` | **post-validate** (#1120) | `cockpit_merge(issue=<ref>)` (unchanged) |
| `completed:validate` **absent** | **legacy** (pre-relocation / flag-off) | `cockpit_advance(issue=<ref>, gate="implementation-review")` (see contracts/legacy-advance-path.md) |
| legacy advance rejected by engine as unknown gate | **undetectable** | fail closed (see contracts/fail-closed-diagnostic.md) |

The co-occurrence signal is the **only** authoritative signal: it reflects the actual gate the engine emitted, and it is unobservable at pre-flight (which runs before any issue reaches the phase).

## Why pre-flight is advisory only (Q3=C)

`generacy cockpit --help` exposes only `watch/doorbell/status/advance/context/merge/queue/resume/scope/mcp` — none report the review/merge-gate model or the `reviewPhaseEnabled` / `ciMergeGateEnabled` flag state (verified at clarify time). No dedicated capability surface exists to probe at startup; adding one is cross-repo and out of scope. Hence the hybrid: advisory pre-flight, authoritative runtime.

## Invariants preserved

- **§1 never merge on red**: post-validate `approve` → merge on green only; legacy `approve` → advance (does not merge; engine still owns validate→merge).
- **D.3 Step 0 identity/drift/adoption machinery unchanged**: gateType stays `implementation-review`, generation = PR head SHA, `runId` threading intact. Only verdict application changes.

## Pins (`playbook-verification.test.ts`, see contracts/pin-repin-500-1.md)

- Negative: `MIN_GENERACY_VERSION` / `0.2.0` / the below-minimum error string are **gone**.
- Positive: the co-occurrence detection mechanism (`completed:validate` co-occurs with `implementation-review`) and its two routing verbs (`cockpit_merge` vs `cockpit_advance(gate="implementation-review")`).
