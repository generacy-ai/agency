---
description: Watch an epic and apply the autonomy policy to each transition
---

# Watch Command

Spawn `generacy cockpit watch` against an epic and, for each emitted state transition, either invoke the mapped `/cockpit:*` command (when the autonomy policy says `auto`) or surface an inline chat notification (when it says `notify-only` or has no mapping).

This command is a long-running watch loop. Retry and reconnect are owned by `generacy cockpit watch` (per its FR-009). Ref resolution (`owner/repo#N` ↔ bare number) is owned by the engine resolver. This playbook does neither — it only routes transitions to actions.

## Arguments

- `$ARGUMENTS`: one positional `<epic-ref>`, either a bare issue number (e.g. `351`) OR the fully-qualified form (e.g. `generacy-ai/agency#351`).

The slash command does NOT resolve refs. `$ARGUMENTS` is passed verbatim to `generacy cockpit watch`; the engine's ref resolver is the single source of truth for `MONITORED_REPOS` lookup and disambiguation.

## Instructions

1. **Validate arguments.** If `$ARGUMENTS` is empty, print:

   ```
   Usage: /cockpit:watch <epic-ref>
     <epic-ref>  bare issue number (e.g. 351) or owner/repo#N (e.g. generacy-ai/agency#351)
   ```

   and stop. Do not spawn anything.

2. **Spawn the watch.** Use the `Monitor` tool to run `generacy cockpit watch $ARGUMENTS` — no extra flags. `Monitor` will emit one notification per stdout line. Initialize an in-memory `seen` set; it lives in the conversation context for the lifetime of this invocation only and is NOT persisted.

3. **Process each notification (one per stdout line).** For every line received:

   a. **Parse as JSON** (see `specs/351-epic-generacy-ai-tetrad/contracts/transition.schema.md`). On parse failure, OR on a parse that succeeds but is missing any of the required fields (`repo`, `kind`, `number`, `from`, `to`): log the offending line inline (one line, so the developer notices upstream regressions) and continue to the next notification. Do NOT terminate the watch loop.

   b. **Baseline (state-sync) classification.** If `from === null`, this is a baseline line — `generacy cockpit watch` emits one per currently-known epic state on (re)connect so a restart can re-sync without re-firing historical work. Compute the dedupe id `${repo}:${kind}:${number}:null→${to}` and add it to the `seen` set, then stop processing this line. Do NOT dispatch any command. Do NOT emit a notification.

   c. **Echo drop.** If `from === to` (same-state echo), drop silently. `generacy cockpit watch` is not supposed to emit these; this is a defensive guard.

   d. **Compute the transition id.** `transition_id = ${repo}:${kind}:${number}:${from}→${to}`. If `transition_id` is already in `seen`, drop silently — the dedupe gate.

   e. **Record before dispatch.** Add `transition_id` to `seen` BEFORE dispatching or notifying. A failed dispatch must not cause a duplicate fire on the next re-emission of the same transition.

   f. **Look up the autonomy policy** for this transition (see `specs/351-epic-generacy-ai-tetrad/contracts/autonomy-policy.schema.md`). Branch on the returned `PolicyEntry`:

      - **`mode === "auto"` with a valid `command`** (`command` starts with `/cockpit:`): invoke `command` with the args computed from `args_template` (substituting `<repo>`, `<kind>`, `<number>`, `<from>`, `<to>`). If `args_template` is omitted, pass `<repo>#<number>`. The dispatch itself is the user-visible signal — do NOT also emit the inline notification line for this transition.

      - **`mode === "auto"` with no `command`** (configuration error): degrade to notify-only. Emit the inline message (format in step 4) with the prefix `policy-error:` so the developer notices the malformed policy entry.

      - **`mode === "notify-only"`**: emit one inline chat message (format in step 4). Take no other action.

      - **No mapping** (lookup returned `undefined`): emit one inline chat message with `policy: unmapped`. Never silently drop, never fail-fast, never warn-once-then-ignore — every unmapped transition surfaces.

      - **Unknown `mode` value** (e.g. a future `"prompt-once"` that this playbook doesn't recognize): degrade to notify-only with the `policy-error:` prefix. Forward-compat per the contract's versioning rule.

4. **Inline notification format.** When a transition is notify-only or unmapped (or degraded per the `policy-error:` rules above), emit exactly one chat line in this shape:

   ```
   [cockpit:watch] <repo>#<number> <kind> <from> → <to> · policy: <policy> · suggested: /cockpit:<verb> <ref>
   ```

   Where:
   - `<policy>` is one of `notify-only`, `unmapped`, or `policy-error: <reason>`.
   - The `· suggested: …` segment is optional. Include it only when the next `/cockpit:*` verb is obvious from `kind`/`to`; otherwise omit the whole segment (do not print an empty `suggested:`).

   For **auto-dispatched** transitions, do NOT emit this line. The slash-command invocation itself is the user-visible signal.

5. **Permanent failure.** If the `Monitor` tool reports the spawned `generacy cockpit watch` process EXITED (i.e. actually gone, not a transient stream blip and not a reconnect):

   - Surface inline: `[cockpit:watch] watcher exited — re-run /cockpit:watch <epic-ref> to resume.`
   - Do NOT retry. Do NOT reconnect. Do NOT spawn a fresh `generacy cockpit watch`.
   - Retry/backoff for transient stream errors is owned entirely by `generacy cockpit watch`; if the process is gone, that contract has been exhausted and the developer needs to know.

## Notes

- **Dedupe scope is per-invocation.** The `seen` set is in-memory in the agent's conversation context. There is no on-disk persistence. A `/cockpit:watch` restart re-syncs state via baseline (`from: null`) lines, then resumes on real transitions.
- **Notification surface is inline chat only.** This playbook does not invoke `PushNotification`; OS-level notifications are out of scope.
- **Schema evolution.** Unknown extra fields on a transition record or policy entry MUST be ignored — both contracts are forward-compatible by design.
