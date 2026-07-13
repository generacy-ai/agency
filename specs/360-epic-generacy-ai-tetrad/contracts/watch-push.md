# Contract: `/cockpit:watch` AFK push amendment

**Feature**: AFK `PushNotification` amendment to `/cockpit:watch` (A5.3)
**Branch**: `360-epic-generacy-ai-tetrad`
**Date**: 2026-06-29

This is the external contract of the additive edit to `packages/claude-plugin-cockpit/commands/watch.md`. It is binding on the implementation. It documents only the new push surface; the existing inline-chat surface, transition classification, dedupe, and stream lifecycle are owned by A5.1 and are unchanged by this issue.

---

## Scope of the amendment

The amendment adds **one new output surface** to `/cockpit:watch`: an OS-level push notification, emitted via the `PushNotification` host primitive, paired one-to-one with the existing inline-chat line that the playbook already emits for non-auto-dispatched transitions.

The amendment does NOT change:
- The inline-chat line format (A5.1 owns it; unchanged byte-for-byte).
- The transition classification rules (baseline / echo / dedupe / policy lookup; A5.1 owns).
- The stream lifecycle (spawn / Monitor / permanent failure; A5.1 owns).
- The autonomy-policy schema (A5.1 owns).
- Which transitions are user-visible (the parity invariant in `## Fire conditions` below codifies "if it shows up inline, it shows up in the push").

---

## Push payload format

The push is emitted via `PushNotification` with a single `message` field, capped by the host primitive at 200 chars. The message format is the literal compact string:

```
<repo>#<number> <kind> <from>→<to> [<class>]
```

| Slot | Source | Format |
|------|--------|--------|
| `<repo>` | `TransitionRecord.repo` (e.g. `generacy-ai/agency`) | string, verbatim |
| `<number>` | `TransitionRecord.number` | integer, no padding |
| `<kind>` | `TransitionRecord.kind` (e.g. `issue`, `pr`) | string, verbatim |
| `<from>` | `TransitionRecord.from` | string, verbatim (never `null` at this point — baseline lines were dropped earlier) |
| `<to>` | `TransitionRecord.to` | string, verbatim |
| `<class>` | derived from `PolicyEntry` (see table below) | string |

### Class derivation

| `PolicyEntry` | `<class>` token |
|---------------|-----------------|
| `mode: "notify-only"` | `notify-only` |
| no mapping (lookup returned `undefined`) | `unmapped` |
| `mode: "auto"` with missing `command` | `policy-error: missing command` |
| `mode: <unknown future value>` | `policy-error: unknown mode '<value>'` |
| `mode: "auto"` with valid `command`, dispatched successfully | (no push fires — see Fire conditions) |

### Formatting invariants

- **Single line.** No embedded `\n`.
- **Arrow.** `→` is the Unicode right-arrow `U+2192`. No surrounding whitespace inside the arrow.
- **Square brackets** around the class token, with one space before `[`.
- **Field order is fixed.** Lockscreen previews truncate from the right, so the most-actionable field (`<repo>#<number>`) MUST come first (locked by clarification Q4=B over Q4 option C).
- **≤200 chars by construction.** The playbook does NOT truncate. If the composed message exceeds 200 chars (extremely long state names), the host primitive's own behaviour applies and that is acknowledged as an upstream contract violation, not a slash-command bug.
- **No platform-specific reformatting.** The same string is sent regardless of iOS / Android / desktop / wearable.

### Examples

```
generacy-ai/agency#360 issue ready→in-progress [auto]            # (would-be auto; never actually emitted — see Fire conditions)
generacy-ai/agency#360 issue review-requested→approved [notify-only]
generacy-ai/agency#42 pr open→closed [unmapped]
generacy-ai/tetrad-development#85 issue blocked→ready [policy-error: missing command]
generacy-ai/agency#360 issue ready→in-progress [policy-error: unknown mode 'prompt-once']
```

---

## Fire conditions

The push fires for every transition that produces an inline chat line, and only for those. This parity is the simplest invariant to test and to enforce in review: **inline emitted ⇔ push fired**.

| Transition class | Inline chat | Push |
|------------------|-------------|------|
| Auto-dispatched (mapped `auto` policy with valid `command`) | no | no |
| `notify-only` policy | yes | yes (class `notify-only`) |
| Unmapped (policy lookup returned `undefined`) | yes | yes (class `unmapped`) |
| `auto` policy with missing `command` (config error) | yes (with `policy-error:` prefix) | yes (class `policy-error: missing command`) |
| Unknown `mode` value (forward-compat) | yes (with `policy-error:` prefix) | yes (class `policy-error: unknown mode '<value>'`) |
| Baseline line (`from === null`) | no (dropped in step 3b) | no |
| Echo line (`from === to`) | no (dropped in step 3c) | no |
| Already-`seen` transition | no (dropped in step 3d) | no |
| Malformed record (parse error) | yes (A5.1 diagnostic line) | no (no record to format from) |

### AFK semantics

"AFK push" is the colloquial name for "OS-level push surface that reaches the operator when they are not at the screen" — NOT a conditional fire. The playbook has no signal for "operator is idle" and does not attempt to derive one. Every inline chat line is paired with a push; when the operator is at the keyboard they see both; when they are away the OS lockscreen / banner is the surface that reaches them.

### Ordering

For every fired transition:

1. Emit the inline chat line FIRST (existing A5.1 behaviour).
2. Then attempt the `PushNotification` call.
3. Then process the push result per `## Push failure handling` below.

Inline-first ordering ensures the chat surface (always-on backup) is never blocked or delayed by the push primitive.

---

## Push failure handling

If `PushNotification` itself returns an error (OS revoked permission, host primitive unavailable, network error inside the primitive):

1. **Emit one inline line**: `[cockpit:watch] push failed: <reason>` where `<reason>` is the host primitive's error message verbatim.
2. **Continue processing the stream.** A push failure MUST NOT terminate the watch loop.
3. **Do not retry.** The host primitive owns its own delivery semantics; the playbook is fire-and-forget per call.
4. **Do not roll back the inline chat line.** It was already emitted before the push was attempted (per `## Ordering` above).
5. **Do not remove the transition from `seen`.** The transition was added to `seen` BEFORE dispatch in existing step 3e; a push failure does not change that.

The inline `push failed:` line is itself an inline emission, but it does NOT trigger a second push (no recursive push attempt). It is a diagnostic for the operator.

---

## Side-effect contract

| Side effect | When |
|-------------|------|
| Calls `PushNotification` | Once per surfaced transition (per `## Fire conditions`) — never for auto-dispatched, baseline, echo, seen, or parse-error |
| Calls `Monitor` | Unchanged from A5.1 — once at watch start to spawn `generacy cockpit watch` |
| Calls `AskUserQuestion` | Never — `/cockpit:watch` is not a gated verb |
| Mutates any GitHub label | Never — the playbook never mutates labels (unchanged from A5.1) |
| Posts any PR comment | Never |
| Reads or writes any file on disk | Never |
| Runs `gh` or any other CLI directly | Never — only `generacy cockpit watch` (via `Monitor`) |

---

## Compatibility & versioning

- The push payload format is stable v1 surface. Changing the field order, the arrow character, the bracket style, the class token vocabulary, or the ≤200-char budget is a backward-incompatible change.
- The parity invariant ("inline emitted ⇔ push fired") is stable v1 surface. Decoupling the two surfaces — e.g. adding a rate limit that suppresses the push but not the inline — is a new clarification, not a v1 change.
- The push-failure diagnostic line format (`[cockpit:watch] push failed: <reason>`) follows the existing `[cockpit:watch]` inline-message prefix convention (A5.1).
- The `class` token vocabulary (`notify-only`, `unmapped`, `policy-error: <reason>`) is the v1 closed set. Future policy modes that need a new class token are a backward-compatible extension (older clients receive `policy-error: unknown mode '<value>'` and degrade gracefully).
- The `auto` class token is reserved but not emitted in v1. Reservation means: if a future clarification ever decides auto-dispatched transitions should ALSO push (e.g. as a "confirm-once" mode), the class token is already defined and the older clients will display it correctly.

---

## Reference: dependency contract (informational only)

### `PushNotification` (host primitive)

- **Inputs**: a single `message: string` field, ≤200 chars enforced by the primitive.
- **Outputs**: `ok` on successful enqueue; an error on permission revoked / OS unavailable / primitive misconfigured.
- **Side effects**: enqueues an OS-level notification. Per-platform delivery and rendering are owned by the OS, not the primitive and not this playbook.
- **Retry / backoff**: owned by the primitive (if any). The playbook does not retry.
- **AFK detection**: NOT a property of the primitive. The primitive fires unconditionally; whether the OS shows the banner depends on platform-level focus / DND / permission settings, which are out of scope for this contract.

This dependency is runtime-resolved. If the primitive is unavailable at call time, the playbook degrades to inline-chat-only per `## Push failure handling` and continues processing the stream.

### `generacy cockpit watch <epic-ref>` (existing)

Unchanged from A5.1. The amendment adds no flags and no new arguments to the stream spawn.
