# Data Model: Cockpit Remote Gates (as exercised)

The wire contracts below are **not defined here** — they are defined in the epic plan and implemented in `generacy/packages/cockpit/src/gates/` (P1). This file mirrors them for reference during the dogfood run so evidence in the report can be pinned to concrete field names. If a field observed on the wire differs from the shape below, treat that as a contract drift and file it against the epic before diverging.

Authoritative source: [cockpit-remote-gates-plan.md § Wire contracts](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md#wire-contracts).

## Gate identity

```
gateKey = <owner>/<repo>#<issue>:<gateType>:<generation>
gateId  = first 24 hex chars of sha256(gateKey)
```

`generation` disambiguates re-asks of the same gate type on the same issue:

| gateType                | generation                                            |
|-------------------------|-------------------------------------------------------|
| `clarification`         | batch id                                              |
| `artifact-review`       | artifact kind + head SHA of the review branch         |
| `implementation-review` | PR head SHA                                           |
| `manual-validation`     | PR head SHA                                           |
| `escalation`            | subtype + triggering label/state + occurrence counter |
| `phase-queue`           | phase number                                          |
| `filing`                | draft hash                                            |
| `scope-drained`         | tracking-issue ref + drain counter                    |

**Verification during the run**: for each gate exercised, capture its `gateId` from the inbox URL / detail panel and confirm re-derivation from `gateKey` matches.

## Gate record (up-path payload / Firestore doc)

```jsonc
{
  "gateId": "…",
  "gateKey": "generacy-ai/generacy#1020:phase-queue:P2",
  "gateType": "clarification | artifact-review | implementation-review | manual-validation | escalation | phase-queue | filing | scope-drained",
  "epicRef": "owner/repo#N",
  "issueRef": "owner/repo#N",
  "issueTitle": "…",
  "issueUrl": "…",
  "branch": "feat/123-slug",
  "prNumber": 456,
  "title": "Queue P2 (3 issues)?",
  "body": "…markdown…",
  "options": [
    { "id": "approve", "label": "Approve all & post", "description": "…", "recommended": true }
  ],
  "allowFreeText": true,
  "sessionId": "…",
  "askedAt": "iso8601"
}
```

Cloud adds on ingest: `orgId`, `projectId`, `clusterId` (from the relay connection), `status` (`open | answered | delivered | applied | superseded | failed | expired`), `answer`, `outcome`, timestamps.

**Verification**: `allowFreeText` must be `true` on every gate (the plan's "escape hatch" invariant). If any gate arrives with `allowFreeText: false`, file as a defect.

## Answer (down-path NDJSON line)

```jsonc
{
  "type": "gate-answer",
  "gateId": "…",
  "gateKey": "…",
  "optionId": "approve",
  "freeText": "…",
  "actor": { "userId": "…", "email": "…", "displayName": "…" },
  "answeredAt": "iso8601",
  "deliveryId": "…"
}
```

Location: appended to `/workspaces/.generacy/cockpit/answers.ndjson`.

**Verification**:
- `deliveryId` present on every line — enables dedup across restart / redelivery.
- `actor.userId` / `actor.email` populated — feeds GitHub audit attribution.
- Free-text edit directives (clarification "Make changes" round, review request-changes) round-trip as `freeText`; the session parses with the existing directive grammar.

## Outcome ack (up-path)

```jsonc
{
  "gateId": "…",
  "outcome": "applied | superseded | failed",
  "detail": "…",
  "at": "iso8601"
}
```

**Outcome expectations by scenario**:

| Scenario                                    | Expected `outcome`        |
|---------------------------------------------|---------------------------|
| Normal answer applied to current gate       | `applied`                 |
| Supersession recipe (D4 in research.md)     | `superseded` with `detail` explaining the observed state drift |
| Answer arrives while cluster offline, then reconnect | `applied` after redelivery |
| Answer applies but downstream action fails (e.g. merge red)   | `failed` with `detail`     |

## Local state artifacts

These are not on the wire but are part of the audit trail; verify each is produced correctly during the run:

- **GitHub labels**: `waiting-for:<gate>` ⇄ `completed:<gate>` transitions.
- **Marker comments**: `<!-- generacy-clarification-answers:... -->` on clarification apply; `cockpit_advance` audit comments on phase advance; each must include the UI actor identity (email / display name).
- **Answers file rotation**: `/workspaces/.generacy/cockpit/answers.ndjson` should be size-capped with the doorbell tolerating rotation. Not a coverage item unless a rotation happens naturally during the run; if it does, verify no answer is lost.

## Fields to record in the run report for each exercised gate

Minimum evidence per gate (see [contracts/run-report-template.md](./contracts/run-report-template.md)):

- `gateId`, `gateType`, `generation`
- `issueRef`, `prNumber` (if applicable)
- Time from `askedAt` to `answered` (operator latency)
- Time from `answered` to `applied` (delivery + apply latency)
- Ack `outcome` and — if not `applied` — the `detail`
- Screenshot of the inbox detail view (title, options, delivery state)
- Link to the GitHub audit artifact (marker comment / advance comment / label change)
- Whether the session kept dispatching other issues while this gate was open (yes/no + brief evidence)
