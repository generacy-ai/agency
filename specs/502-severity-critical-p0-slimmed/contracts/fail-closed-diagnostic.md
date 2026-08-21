# Contract: Fail-closed diagnostic (neither model detectable)

**Requirements**: FR-002 (fail-closed net), FR-004 (byte-mirror the pre-flight hard-fail idiom) · **Clarification**: Q2=C, Q4=A · **Location**: `auto.md § D.3` / `§ Gate contract G.8` (runtime), byte-mirroring the pre-flight fails at `auto.md:208–224`

When detection resolves to **undetectable** — neither the post-validate nor the legacy model is servable — `auto` fails closed with an actionable diagnostic instead of admitting-and-stranding.

## When it fires

Reached only when the provisional **legacy** branch's `cockpit_advance(issue=<ref>, gate="implementation-review")` is rejected by the engine as an unknown / unrecognized gate — i.e. the engine emits `waiting-for:implementation-review` without `completed:validate` (so not post-validate) **and** does not accept the legacy advance (so not the pre-relocation model either). This is the genuine "neither model" case FR-002 scopes the fail-closed to.

## Diagnostic (exact wording — pinned verbatim, Q4=A)

The message MUST name both engine flags so the operator can act. Draft wording (finalize exact bytes at implement time, then pin `500-1` to those exact bytes):

```
/cockpit:auto cannot determine this generacy engine's implementation-review gate model. The engine raised `waiting-for:implementation-review` without `completed:validate` (so not the post-validate #1120 model) and rejected `cockpit_advance(gate="implementation-review")` (so not the legacy pre-relocation model). This usually means the engine's `reviewPhaseEnabled` and `ciMergeGateEnabled` flags are both off and the build predates #1120's gate move. Enable `reviewPhaseEnabled` / `ciMergeGateEnabled` on the cluster's generacy build, upgrade to a build that ships generacy#1120, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance.
```

## Idiom (byte-mirror the sibling pre-flight fails)

The fail-closed adopts the shape of the Monitor-absence (`:208–214`) and doorbell-absence (`:218–224`) hard-fails:

- print the verbatim diagnostic block,
- exit the run **non-zero**,
- **halt the loop** (no further dispatch),
- **no label writes** (§3 add-only).

**Placement note (tasks-phase decision, see research.md § "Where the fail-closed branch fires")**: detection is authoritative at runtime, so the fail-closed *decision* fires at D.3. FR-004's "no ledger directory / no ledger line" clause describes the pre-flight *idiom being mirrored*; at runtime the ledger dir already exists, so this branch writes a terminal `fail-closed: <detail>` ledger line and exits. The plan recommends the runtime placement; if a reviewer requires the literal pre-flight "no ledger dir" shape, a redundant pre-flight net may be added but does not replace the runtime branch (the flag-off strand is only observable at runtime).

## Pin (see contracts/pin-repin-500-1.md, Q4=A)

`500-1` freezes the **exact** diagnostic bytes, including the literal flag names `reviewPhaseEnabled` and `ciMergeGateEnabled`, byte-mirroring the existing Monitor/doorbell/version pre-flight pins. A loose "message present" assert is forbidden (FR-005) — it would drop the load-bearing flag-name contract.
