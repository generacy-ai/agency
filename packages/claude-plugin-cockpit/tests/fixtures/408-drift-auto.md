<!--
Drift fixture for finding #408.
This is a MINIMAL FIXTURE reproducing the pre-#408 state of commands/auto.md
§ step 5 (all three cursor-error signals converged onto ONE unconditional
recovery path; no class split; no per-class consecutive-fault counter; no
escalation gate; no post-fix ledger-line shape).

The audit (408-2) feeds this file through auditStep5 and asserts at least one
of the structural fields is false — proving the audit's logic isn't vacuous.

DO NOT reintroduce the post-fix option strings or ledger shape into this file.
The fixture's value is the ABSENCE of those post-fix properties (see
specs/408-found-during-cockpit-v1/contracts/negative-fixture-shape.md).
-->

## Instructions

1. **Parse arguments + pre-flight.** (elided — irrelevant to the § step 5 drift audit).

5. **Cursor recovery.** There is no watch process to re-arm; the cursor is in-memory only, held for the lifetime of the current dispatch loop. On any of the following signals from `cockpit_await_events`, converge on the same recovery path — run the startup sweep (step 3) again and re-arm the cursor from the tool server's connect-time position (cursor-less):
   1. **`invalid-cursor` typed error** — the cursor the parent passed is stale/corrupted (fail loud — this is a caller bug on this side of the boundary; the parent must not swallow it). Log the typed error's `code`/`message`/`details` verbatim, then trigger recovery.
   2. **`resetFrom` reset signal in the returned batch** — the tool server signaled a reset in the batch metadata (e.g., server-side event-log rotation). Trigger recovery.
   3. **Cursor expiry** — a typed error indicating the cursor is past the server's retention window. Trigger recovery.

   All three signals converge on the same recovery convergence path: **re-run step 3's startup sweep + re-arm cursor-less from connect-time position.**

<!-- No escalation-gate option strings and no post-fix ledger code span appear anywhere below. The audit MUST report at least one structural failure on this file. -->
