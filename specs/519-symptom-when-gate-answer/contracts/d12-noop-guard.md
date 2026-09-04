# Contract: D.12 step 1 foreign-run / out-of-scope no-op guard

Pinned by `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
(519-* tests). Per the CLAUDE.md pin rule: a future `auto.md` edit that breaks
these assertions must re-pin to its new contract in the same PR, never weaken.

## C1 — Guard scope

The guard exists ONLY inside D.12 step 1's no-record branch. When
`openGates[event.gateId]` exists (current-run or adopted), steps 2–6 run
unchanged; the guard never pre-empts the record lookup.

## C2 — Classification order (within the no-record branch)

1. **Foreign-run** — gateKey carries a runId-shaped trailing segment AND it ≠
   the run's pre-flight-derived `runId`.
2. **Out-of-scope** — gateKey issue ref (prefix before the first `:`) is not in
   the run's in-scope set.
3. **Fall-through** — same-run or legacy (no runId segment), in scope: the
   existing `cockpit_gate_ack(gateId, outcome: "superseded", detail: "no
   matching open record — likely startup-race or duplicate delivery")` and its
   `superseded (no record) · source: ui-gate` ledger row, byte-preserved.

RunId segment detection is shape-based (trailing colon-free segment matched
against the `<tracking-ref-slug>-<timestamp>` runId shape), never positional —
`generation` may contain colons.

## C3 — No-op behaviour

Branches 1–2: NO `cockpit_gate_ack` (any outcome), NO downstream handler or
dispatch, exactly ONE ledger row per delivery (replays not deduped).

## C4 — Pinned ledger rows (verbatim)

```
<gateKey-issue-ref> · — · gate-answer · foreign-run delivery — not acked (owner run: <runId>) · source: ui-gate
<gateKey-issue-ref> · — · gate-answer · out-of-scope delivery — not acked (issue: <issue-ref>) · source: ui-gate
```

Pinned substrings (must appear verbatim in `auto.md` and the test):

- `foreign-run delivery — not acked (owner run: <runId>)`
- `out-of-scope delivery — not acked (issue: <issue-ref>)`

## C5 — Payload-shape doc

D.12 **Payload shape** documents `gateKey` as:

```
<owner>/<repo>#<issue>:<gateType>:<generation>[:<runId>]
```

with notes: the `runId` segment is absent for gates opened under
`runIdEnabled === false`; detection is shape-based, not positional.

## C6 — Preserved existing pins (must not break)

- 449-13 / 449-14: `### D.12 — \`gate-answer\`` heading; steps 2–6 content.
- 469-23: no-record ack detail literal + "this call ALSO passes the run's
  pre-flight-derived `runId` verbatim".
- 471-16: region `/Look up record[^]*?superseded \(no record\) · source: ui-gate/`
  contains no `openGates[event.gateId].runId` / `openGates[gateId].runId`.
