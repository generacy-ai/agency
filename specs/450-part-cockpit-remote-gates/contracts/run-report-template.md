# Cockpit Remote Gates Dogfood — Run Report

> Copy this template into a comment on issue #450 at the end of the run. All sections are required; leave a section empty only when you file a corresponding defect explaining why.

## Meta

- **Operator**: <name / email>
- **Cluster**: <clusterId + host>
- **Start**: <iso8601>
- **End (coverage-complete)**: <iso8601>
- **Driving invocation**: `/cockpit:auto --gates=ui …`
- **Live epic driven**: <owner/repo#N> — <title> — **state at end**: <in-flight / terminal>
- **Synthetic follow-up epic (if used)**: <owner/repo#N> — <title> — reason: <which gate types it was seeded for>

## Coverage matrix

| Gate type              | Exercised | gateId (24 hex) | Ack outcome | Notes |
|------------------------|-----------|-----------------|-------------|-------|
| `clarification` (batch) | ☐         |                 |             |       |
| `clarification` (free-text "Make changes" round) | ☐ |     |             |       |
| `artifact-review` (any verdict) | ☐ |                     |             |       |
| `implementation-review` — approve | ☐ |                    |             |       |
| `implementation-review` — request-changes | ☐ |            |             |       |
| `phase-queue` confirm  | ☐         |                 |             |       |
| `escalation` (red-check merge, per D3) | ☐ |               |             |       |
| Supersession (per D4)  | ☐         |                 | superseded  |       |
| Offline redelivery (per D5) | ☐    |                 | applied     |       |
| (other types encountered — `manual-validation`, `filing`, `scope-drained`) | ☐ | | | |

## Per-gate evidence

Repeat this block for each exercised gate.

### Gate — <gateType> — <gateId>

- **gateKey**: <owner/repo#N>:<gateType>:<generation>
- **Issue**: <link>
- **PR** (if applicable): <link>
- **askedAt → answered**: <ms / operator latency>
- **answered → applied** (or terminal outcome): <ms>
- **Ack outcome**: `applied` | `superseded` | `failed` — `detail`: <…>
- **Inbox screenshot**: <link or attached>
- **GitHub audit artifact**: <link to marker comment / advance comment / label event>
- **Actor attribution on audit artifact**: <yes/no — quote the attribution line if present>
- **Session kept dispatching other work**: <yes/no — evidence: dispatch log excerpt or issue that advanced during the gate>

## Non-blocking behavior (goal 1 of the epic)

- **Approach used to verify**: <e.g., open a clarification batch on issue A while issue B is dispatchable; observe issue B advancing>
- **Result**: <yes / no / partial — with evidence>
- **If not fully non-blocking**: <file as defect, link here>

## Offline redelivery run (per D5)

- **Offline mechanism used**: firewall rule | interface down | other: <…>
- **Time WS severed**: <iso8601>
- **Answer submitted at**: <iso8601> — `deliveryId`: <…>
- **Inbox delivery state during outage**: <e.g., `answered` not-yet-`delivered`>
- **Time WS restored**: <iso8601>
- **Time answer delivered/applied**: <iso8601>
- **Duplicate applies observed**: <yes/no — evidence>

## Supersession run (per D4)

- **Gate held open**: <gateId>
- **Separate advance route used**: `cockpit_advance` | label flip | different gate answer
- **Time underlying state advanced**: <iso8601>
- **Time inbox answer submitted**: <iso8601>
- **Session ack outcome**: `superseded` — `detail`: <…>
- **Inbox terminal display**: <screenshot / description>

## Escalation run (per D3)

- **Recipe used**: <describe the intentional red-check>
- **Bounded fixer subagent ran**: <yes/no> — log excerpt
- **Escalation gate fired**: <gateId>
- **Inbox rendering of `escalation` gateType**: <acceptable / rough — file defect if rough>
- **Resolution taken from inbox**: <optionId / freeText>

## Defects filed

Every rough edge encountered during the run is filed on the epic before the report is closed. List them below with severity:

| Severity  | Defect (issue link) | Blocker for this dogfood? | Fixed in this run? |
|-----------|---------------------|---------------------------|--------------------|
| blocker   |                     |                           |                    |
| major     |                     |                           |                    |
| minor     |                     |                           |                    |

**Blockers**: all blocker-severity defects must be either fixed in this run (link the merge) or filed with a clear reproduction (link the issue). Report cannot close with unfiled blockers.

## Docs updated

- Walkthroughs / cockpit docs touched during the run: <links>
- If none needed, explain: <…>

## Sign-off

- **Operator**: <name> — <iso8601>
- **Epic owner acknowledgement**: <name> — <iso8601> — (optional; add if the epic owner is not the operator)
