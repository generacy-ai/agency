# Contract: D.8 phase-queue ad-hoc enumeration

**Feature**: See [spec.md](../spec.md)
**Anchor**: spec § Changes item 3; plan.md § Dispatch D.8 presentation extension

## Purpose

Extend the D.8 phase-queue confirmation gate (G.5) presentation block to enumerate any open ad-hoc issues in scope, and flip the recommendation to `Hold` when the ad-hoc list is non-empty. Queueing while ad-hoc work is open stays *possible* but never *silent* — the gate text names the open refs and the operator decides.

**Only applies in epic mode** (`invocationForm: epic`). Under `tracking-existing` / `tracking-new` there are no phases, so D.8 does not fire.

## Trigger

- `phase-complete` event from `cockpit_await_events` (unchanged from current D.8 trigger).

## Extended presentation block

```markdown
Phase P<current> complete on <epic-ref>.

Next phase: P<next> (<N> issues)

Issues to queue:
1. <owner>/<repo>#<m1> · <title>
2. <owner>/<repo>#<m2> · <title>
...

Open ad-hoc issues in scope (added mid-run):
1. <owner>/<repo>#<a1> · <title> · <live-state>
2. <owner>/<repo>#<a2> · <title> · <live-state>
...
```

- The `Open ad-hoc issues in scope (added mid-run):` block is emitted ONLY when the ad-hoc list is non-empty. Empty list → block omitted entirely. No `(none)` placeholder.
- Ad-hoc issue enumeration order is the order they were scope-added (chronological — from the ledger's `scope-add` and `filing-gate+scope-add` action lines).

## `openAdHocIssues(trackingRef, ledger)` helper

```typescript
export type OpenAdHocIssue = {
  ref: string;      // "<owner>/<repo>#<n>"
  title: string;    // from cockpit_status
  liveState: string; // verbatim transition class from cockpit_status
};

export function openAdHocIssues(
  epicRef: string,
  ledgerLines: string[],
  cockpitStatus: (ref: string) => { title: string; liveState: string; isTerminal: boolean }
): OpenAdHocIssue[];
```

**Algorithm**:
1. Filter ledger lines to actions in `{scope-add, filing-gate+scope-add}` with successful outcomes (`queued`, `filed + queued (...)`).
2. Extract the added ref from each surviving line.
3. Deduplicate refs (a ref added multiple times counts once — the second add is a no-op scope-mutation).
4. For each ref, call `cockpitStatus(ref)`; keep only refs where `isTerminal === false`.
5. Return the survivors as `OpenAdHocIssue[]` in scope-add order.

The helper is a small pure function that lives in `lib/intent-recognition.ts` or a sibling module (implementation choice; the shape is what this contract locks). Runtime path: Claude computes the list from ledger + status calls per the playbook prose.

## Extended `AskUserQuestion` parameters

### Empty ad-hoc list (unchanged behavior)

- Options (exactly two, in this order):
  1. `Queue P<next> (<N> issues) (Recommended)`
  2. `Cancel`

### Non-empty ad-hoc list (new)

- Options (exactly three, in this order):
  1. `Hold — <M> open ad-hoc issue(s) in scope (Recommended)` — do not queue; ledger line noting the hold.
  2. `Queue P<next> (<N> issues)` — still selectable; queue the next phase even with open ad-hoc work.
  3. `Cancel` — do nothing; phase-complete state persists.

`<M>` is the count of open ad-hoc issues; `<N>` is the count of next-phase issues (unchanged).

## Post-gate behavior

### Empty ad-hoc list (unchanged)

- **`Queue P<next>`** → call `cockpit_queue(epic=<epic-ref>, phase="P<next>")`; ledger line `<epic-ref> · phase-complete · phase-queue-gate · queued P<next> (<N> issues)`.
- **`Cancel`** → do nothing; ledger line `<epic-ref> · phase-complete · phase-queue-gate · cancelled`.

### Non-empty ad-hoc list (new)

- **`Hold`** → do NOT call `cockpit_queue`; the phase-complete state persists; the loop continues (the operator may add more ad-hoc work, complete existing ad-hoc work, or return to this gate later). Ledger line: `<epic-ref> · phase-complete · phase-queue-gate · held (<M> ad-hoc open)`.
- **`Queue P<next>`** → call `cockpit_queue(epic=<epic-ref>, phase="P<next>")` (unchanged behavior — queueing while ad-hoc work is open is possible). Ledger line: `<epic-ref> · phase-complete · phase-queue-gate · queued P<next> (<N> issues) with <M> ad-hoc open`.
- **`Cancel`** → do nothing; ledger line `<epic-ref> · phase-complete · phase-queue-gate · cancelled`.

## Validation rules

- The gate is NEVER silent — even when queueing while ad-hoc work is open, the gate text explicitly named the open refs, so the operator's decision was informed.
- The gate is NEVER blocking — `Queue P<next>` remains a selectable option even with open ad-hoc work. The operator may have deliberately parked the ad-hoc work for later, and the phase queue is orthogonal.
- Recommendation flip is one-directional — the flip changes the "(Recommended)" annotation from `Queue P<next>` to `Hold`; both options remain in the option list under both branches.
- Order of ad-hoc issue enumeration is stable — scope-add order, not alphabetical, not by state. Stability supports operator scanning across successive gate fires.

## Failure modes

- `cockpit_status` fails for one or more ad-hoc refs → the helper omits those refs from the list AND writes a ledger line noting the omission (`<epic-ref> · phase-complete · openAdHocIssues · error: cockpit_status failed for <ref>: <description>`). The gate still fires with the partial list; the operator can retry the phase-queue gate after the next `cockpit_status` succeeds.
- Ledger read fails → the helper falls back to empty ad-hoc list. The gate fires with the empty presentation (unchanged behavior). This is a graceful degradation.

## Fixtures

- `416-d8-adhoc-none.md` — empty ad-hoc list; block omitted; two-option gate with `Queue P<next>` recommended.
- `416-d8-adhoc-one.md` — one open ad-hoc issue; block present with one line; three-option gate with `Hold` recommended.
- `416-d8-adhoc-two.md` — two open ad-hoc issues; block enumerates both; three-option gate with `Hold` recommended.

## Verification

- **Static grep**: `commands/auto.md` § Dispatch D.8 or § Gate contract G.5 contains the substring `Open ad-hoc issues in scope (added mid-run):` and both option lists (two-option empty variant + three-option non-empty variant).
- **Behavioral**: 416-4 asserts D.8 fixtures show block presence/absence and the recommendation flip.
- **True verifier**: operator smoke-test scenario 1 — file a bug mid-run via G.6; the next D.8 gate names it while open (spec Success criteria #1).

## Related contracts

- [Filing gate](./filing-gate.md) — G.6 outcomes populate the ledger's `scope-add` and `filing-gate+scope-add` lines the D.8 helper reads.
- [Ledger scope mutations](./ledger-scope-mutations.md) — the source of truth for scope-add order and outcomes.
- [Scope-drained gate](./scope-drained-gate.md) — the epic-less sibling (both gates share the "never silent, operator decides" principle).
