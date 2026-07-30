# @generacy-ai/claude-plugin-cockpit

## 0.1.1

### Patch Changes

- f888c66: fix(cockpit:auto): conform the UI-mode gate wire contract to the frozen spec (#1034).

  The `--gates=ui` gate flow described in `commands/auto.md` and typed in
  `lib/gate-wire-types.ts` used an invented wire shape (`kind`-discriminated
  gate-open/ack, a session-local integer `generation`, and a nested-`answer`
  down-path with `event.generation` / `event.answer.optionId`) that matched
  neither the frozen contract in
  `tetrad-development/docs/cockpit-remote-gates-plan.md § "Wire contracts"` nor the
  generacy-cloud receiver. Combined with the generacy-side fix, this is what makes
  a remote gate actually open in the operator inbox and resolve.

  - **`gate-wire-types.ts`**: `GateOpenParams` is the flat frozen record (no
    `kind`/`scope`/nested `gate: GateDraft`; `gateType` enum; `title`/`body`/
    `options`/`allowFreeText`; `gateId`/`gateKey` are derived by the
    `cockpit_gate_open` MCP tool, not the plugin). `GateAckParams` is now the frozen
    `gate-outcome` shape (`{gateId, outcome, detail?, at}` — no `generation`/`ackedAt`).
    `GateAnswerEvent` is the flat frozen down-path (`type:'gate-answer'`,
    `optionId`/`freeText`/`actor` nullable, `deliveryId`; **no `generation`**).
  - **`auto.md` § D.12**: the arriving `gate-answer` is read as the flat frozen
    event (`type`, `gateId`, `event.optionId`/`event.freeText`, no
    `event.generation`); supersession keys on **gateId identity** (a `make-changes`
    re-open recomputes a durable, content-derived generation discriminator → a new
    `gateId`, and marks the prior record `superseded`) instead of an integer
    generation-match the down-path can no longer carry. The ack is
    `cockpit_gate_ack(applied | superseded | failed)` (the MCP tool builds the
    `gate-outcome`). Adds a § Generation discriminator note (durable per-gateType
    derivation) documenting the head-SHA / occurrence-counter / drain-counter /
    batch-id-hash data gaps as a follow-up (durable-discriminator derivation is out
    of scope for this wire-shape reconciliation).

  Pairs with `@generacy-ai/cockpit` / `@generacy-ai/orchestrator` /
  `@generacy-ai/generacy` (generacy#1034) — the plugin emits the frozen record
  shape those consume. Supersedes the wire-envelope parts of the earlier gate-open
  (#1033) and gate-ack (#455) fixes.

- cc00dfb: fix(cockpit:auto): route the fresh-epic P1 bootstrap through the UI gate under `--gates=ui`. On a fresh epic (every issue `pending`, nothing queued), the startup sweep produced no synthetic events and no `phase-complete` ever fires, so the loop improvised a local `AskUserQuestion` to confirm queueing P1 — which bypasses the operator inbox and blocks a headless UI-driven session with no answerer. The step-3 sweep now detects "no phase in flight" and dispatches a synthetic `phase-bootstrap` event through the existing D.8 / G.5 phase-queue gate (already UI-mapped, `issueRef = <epic-ref>`, distinct `gateId`), so the bootstrap confirm opens via `cockpit_gate_open` like every other gate. Adds a § G.5 Bootstrap variant presentation and a playbook-verification pin.

## 0.1.0

### Minor Changes

- c0548f6: New package: publish the cockpit Claude Code plugin to npm so cluster setup can
  deliver the `/cockpit:*` commands without the manual marketplace step (#374).
  Ships the six command playbooks, `.claude-plugin/plugin.json`, and README as
  static files — no build step, no runtime code. First release is 0.1.0.
