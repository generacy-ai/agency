# Pre-migration site-count audit (T001)

**Command**: `grep -nE 'generacy cockpit (status|context|queue|advance|resume|merge)\b' packages/claude-plugin-cockpit/commands/{auto,clarify,review,merge,queue,status}.md`

**Date**: 2026-07-12

## Per-playbook counts (pre-#406)

| Playbook | Sites (before) | Post-#406 target |
|----------|---------------:|-----------------:|
| `auto.md` | 28 | 0 |
| `clarify.md` | 3 | 0 |
| `merge.md` | 4 | 0 |
| `queue.md` | 5 | 0 |
| `review.md` | 6 | 0 |
| `status.md` | 3 | 0 |
| **Total** | **49** | **0** |

## Per-verb distribution (raw grep line-count total: 49)

Extracted with:
`grep -nhoE 'cockpit (status|context|queue|advance|resume|merge)\b' packages/claude-plugin-cockpit/commands/{auto,clarify,review,merge,queue,status}.md | sort | uniq -c`

(To be re-run and pasted in the PR body per T027.)

## Post-migration invariant

After T014–T024 land, the same grep across the six migrated playbooks yields **0** matches. `commands/watch.md` retains `generacy cockpit watch` (positive-inverse from 406-2).

## Post-migration verification (2026-07-12, after T014–T024)

Re-run of the same grep after all migration tasks:

| Playbook | Sites before | Sites after |
|----------|-------------:|------------:|
| `auto.md` | 28 | 0 |
| `clarify.md` | 3 | 0 |
| `merge.md` | 4 | 0 |
| `queue.md` | 5 | 0 |
| `review.md` | 6 | 0 |
| `status.md` | 3 | 0 |
| **Total** | **49** | **0** |

`commands/watch.md` retains `generacy cockpit watch` (2 sites) as required by 406-2's positive-inverse assertion.

## SC verifier status (test-suite)

- **SC-001** (zero Bash cockpit CLI verbs on migrated playbooks): 406-2 passes.
- **SC-003** (≥2× dispatch-round reduction via `cockpit_await_events` long-poll): 406-3 anchors the loop-shape contract; empirical verification pending cluster-base#75 + operator smoke test.
- **SC-004** (typed-ref errors preserve `code`/`message`/`details`): 406-7 passes on fixture.
- **SC-005** (tool-contract audit + startup-sweep): 406-1 and 406-5 pass.

Cluster-base#75 is the runtime unblocker for the operator smoke test per quickstart.md § Operator smoke test.

