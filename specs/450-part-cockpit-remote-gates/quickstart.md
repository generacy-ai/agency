# Quickstart: Cockpit Remote Gates Dogfood Run

Step-by-step for the operator running the P4 dogfood on issue #450.

## 0. Preflight (run once, before launching the driver)

Work through [research.md § Prerequisites](./research.md#prerequisites-verify-before-starting). Do **not** proceed if any prerequisite is missing — file a blocker on the epic and pause.

Also confirm:

1. You have write access to the live epic's repo and the (probable) synthetic-follow-up repo.
2. You have shell access to the cluster host with permission to modify egress firewall rules or bring down a network interface (needed for the offline test, D5 in research.md).
3. Your generacy.ai account can see the driving cluster's org.
4. You have a working scratch pad (this run report template) open — [contracts/run-report-template.md](./contracts/run-report-template.md).

## 1. Pick the live epic

Per D1 (Q1 hybrid): pick one in-flight epic on generacy-ai/generacy-cloud (or another product repo) that plausibly hits several gate types as it progresses. Record the choice in the run report's **Meta** section.

Note the coverage matrix in the report template — you're aiming to check every row by the end of the run.

## 2. Launch the driver

From the cluster (or via your normal `/cockpit:auto` invocation path):

```
/cockpit:auto <epic-ref> --gates=ui
```

Watch for the one-line pointer each gate emits when it opens:

```
⛩ gate open: <title> → answer at generacy.ai inbox
```

The session should **not block**. If it blocks (falls back to local `AskUserQuestion`), note whether `cockpit_gate_open` errored (fallback is by design per the plan) or the session hung (that's a defect).

## 3. Open the inbox

Navigate to `https://generacy.ai/dashboard/inbox` in a browser with an open tab (Notification API needs the tab open — see epic Non-goals).

Grant browser notification permission when prompted.

Confirm the driving cluster's gates appear as they open (SSE stream). Live-updating.

## 4. Exercise gate types (natural path)

Answer gates as they arrive. For each, capture the evidence listed in [data-model.md § Fields to record](./data-model.md#fields-to-record-in-the-run-report-for-each-exercised-gate) into the run report.

Naturally-arriving gate types to expect while driving a real epic:
- `clarification` — batch answers (both templated options and at least once a free-text "Make changes" round).
- `artifact-review` — accept the drafted answer or push back.
- `implementation-review` — try both an **approve** and a **request-changes** across different PRs (or on the same PR across revisions).
- `phase-queue` — confirm the phase's issue queue.
- `manual-validation` / `filing` / `scope-drained` — record if they fire; not required but strong evidence.

## 5. Force the escalation gate (D3)

At any point after other gate coverage is in flight, create a PR whose CI fails in a way the bounded fixer cannot repair. Two recipes (either works):

- Add a test file `.integration-test.spec.ts` (or similar) with `expect(true).toBe(false)` and a top-of-file comment that the fixer will read but not resolve (`// intentional escalation trigger — do not repair`).
- Break a required lint / typecheck by referencing a missing dependency the fixer has no template to install.

Merge is attempted → check fails → bounded fixer runs once → check still red → driver escalates → `escalation` gate opens.

Answer from the inbox. Record the gate in the report.

## 6. Force the supersession case (D4)

Pick a gate currently open in the inbox (a `phase-queue` confirm works well because the underlying phase state is easy to advance manually).

**Without answering it in the inbox**, advance the underlying state by a separate route:

- CLI: `generacy cockpit advance <issue-ref>` or the MCP tool.
- OR: flip the `waiting-for:<gate>` → `completed:<gate>` label on GitHub manually.
- OR: answer a different gate that advances the same phase.

Wait for the inbox to show the gate is now stale (or just proceed — the point is to answer against an old generation).

Submit the answer in the inbox. Confirm:
- The session's ack outcome is `superseded`.
- The inbox displays `superseded` with a detail explaining the drift.
- The GitHub audit artifacts are **not** applied (no marker comment from this superseded answer).

## 7. Force the offline-redelivery case (D5)

Pick a moment when at least one gate is open and answerable.

1. Sever the cluster's outbound relay WS to generacy.ai:
   - **Firewall route** (preferred, keeps host reachable): `sudo iptables -A OUTPUT -p tcp -d <relay-host> --dport 443 -j DROP` (or the equivalent for your cluster). Record the exact rule in the report.
   - **Interface toggle** (alternative): bring down the primary NIC — only if the cluster survives that.
2. Confirm the driving process stays alive but the orchestrator logs show the relay WS disconnected.
3. Submit the answer in the inbox during the outage.
4. Inbox should mark the answer `answered` but not `delivered`.
5. Wait a beat, then restore connectivity (reverse the iptables rule / bring the interface back up).
6. Observe the answer being redelivered, applied exactly once (no duplicate side effects on GitHub).

Capture timestamps and `deliveryId` in the report.

## 8. Stop when coverage is complete

Per D2: once every row of the coverage matrix in the report is checked, the run is done. The driven epic can still be in-flight — that's expected and noted in the report.

If any gate type remains unchecked after a bounded window (target: two working days of driver time), stop the live driver and seed a synthetic follow-up epic engineered to trigger the missing types. Repeat step 4 for the synthetic epic.

## 9. File rough edges

Every operator-observed defect, unclear behavior, or documentation gap during the run is filed as a follow-up issue on the epic **before** the report closes. Severity classification:

- **blocker**: prevented an entire gate type from being exercised or produced wrong behavior on the wire.
- **major**: gate worked but with confusing UX, misleading state, or missing audit attribution.
- **minor**: cosmetic, docs, ergonomic.

Link each defect in the run report.

## 10. Attach the report

Fill out [contracts/run-report-template.md](./contracts/run-report-template.md), paste it into a comment on issue #450, and mark the issue with the appropriate `completed:*` labels per the epic's convention.

## Troubleshooting

- **Session blocks on a gate** (falls back to local `AskUserQuestion`): check orchestrator logs for `cockpit_gate_open` errors. If the fallback is caused by a transient relay drop, that's expected per plan; if it's a persistent orchestrator route error, file blocker.
- **Inbox doesn't show a gate you know is open**: check the `cluster.cockpit` retain-and-replay behavior — restart the SSE stream (refresh) and see if the gate appears. If not, check the `POST /cockpit/gates` orchestrator route was called and the relay event actually emitted.
- **Answer applied but audit artifact missing UI actor attribution**: the answers file line should carry `actor.email` / `actor.displayName`. If missing, the defect is either in the cloud `POST /gates/{id}/respond` (not populating actor) or the session's apply path (not forwarding it to marker/audit comments). File either way; note which side you observed.
- **Redelivery duplicates the applied action**: `deliveryId` dedup failed — this is a P1-severity dedup regression. File as blocker with the two `deliveryId`s and the audit artifact that got doubled.
- **`escalation` gateType doesn't render in the inbox**: file as a P3 gap (rough edge on the UI), then complete the escalation exercise by answering via the fallback surface (local `AskUserQuestion`) so the down-path is at least partially exercised. Note the coverage gap in the report.
