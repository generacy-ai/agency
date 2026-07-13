# Contract: Intent-class recognition

**Feature**: See [spec.md](../spec.md)
**Anchor**: spec § Changes item 2; clarifications Q2; plan.md § Add-issue flow new subsection

## Purpose

Recognize two intent classes in the operator's free-text mid-conversation input:

1. **Add-existing intent** — the operator asks to process an existing issue ("also process X", "process X too", "add X to scope").
2. **File-new intent** — the operator asks to file and process a new issue ("file an issue for X", "open a bug for X", "create an issue about X").

Recognition is generous by design; the safety net is structural (spec Q2 anchor):

- The add-existing path requires a parseable explicit ref — no ref → confirm intent conversationally.
- The file-new path always lands on the filing gate G.6 — a misread intent surfaces as a skippable gate, never as an unreviewed outward action.

## Types

```typescript
export type AddExistingIntent = {
  ref: string;  // "<owner>/<repo>#<n>" or "#<n>" shorthand
};

export type FileNewIntent = {
  topic: string;  // free-text description passed to drafter subagent
};
```

## Parsers

```typescript
export function parseAddExistingIntent(input: string): AddExistingIntent | null;
export function parseFileNewIntent(input: string): FileNewIntent | null;
```

Both parsers are pure functions — no I/O, no side effects, deterministic.

## `parseAddExistingIntent` — semantics

**Returns `AddExistingIntent`** when:
- Input contains an explicit parseable ref matching one of:
  - Full form: `<owner>/<repo>#<n>` — e.g., `generacy-ai/agency#416`
  - Shorthand: `#<n>` — e.g., `#416` (playbook resolves against tracking ref's repo at dispatch time)
- AND the surrounding phrasing reads like an add-existing intent (heuristic: presence of any of "also process", "process ... too", "add ... to scope", "include", "queue", "pull in", "handle", "look at ... too"). Detection is regex + phrase-match; details are the parser's implementation choice.

**Returns `null`** when:
- No parseable ref is present in the input, regardless of phrasing signal.
- Or: parseable ref present but no add-existing phrasing signal (e.g., "the bug in #416 is annoying" — ref present but no add signal → null).

**Behavior when null**: playbook prose confirms intent — session asks "do you want me to add an issue to scope? which ref?" — before dispatching.

**Multiple refs in one message**: the FIRST parseable ref wins. Subsequent refs in the same message are ignored (the operator can re-invoke intent per-ref).

**Shorthand `#<n>` resolution**: the parser returns the shorthand as-is (`"#416"`); the playbook resolves the repo at dispatch time by prepending the tracking ref's `<owner>/<repo>/`. The resolved ref is what's written to the ledger and passed to `cockpit_scope_add`.

## `parseFileNewIntent` — semantics

**Returns `FileNewIntent`** when:
- Input matches one of the canonical trigger patterns (case-insensitive, tolerant of `a/an`):
  - `file an? issue (for|about|on) <topic>`
  - `open a? bug (for|about|on) <topic>`
  - `create an? issue (for|about|on) <topic>`
  - `raise an? issue (for|about|on) <topic>`
  - `report an? issue (for|about|on) <topic>` (case-insensitive)
- Topic is whatever follows the trigger clause (trimmed, non-empty).

**Returns `null`** when:
- No trigger pattern matches.
- Or: trigger pattern is ambiguous — specifically, chat-adjacent phrasings that could mean "investigate" or "chat about" rather than "file", including:
  - `look at <topic>`
  - `check <topic> out`
  - `investigate <topic>`
  - `let's discuss <topic>`

**Behavior when null**: playbook prose confirms intent — session asks "do you want me to file an issue? what's the topic?" — before dispatching. If the operator confirms and provides the topic, the session dispatches directly to the file-new path (G.6 filing gate).

## Safety net (Q2 anchor)

- **Add-existing false positive** (parser returns `AddExistingIntent` when the operator did NOT intend it): the session calls `cockpit_scope_add` + `cockpit_queue` on the ref, ledger line written. Recovery: the operator can immediately say "wait, remove that from scope" — a mid-run scope-remove flow is future work (out of scope for this fix); until then, the operator either closes the accidentally-added issue (which flips it to terminal) or lets it flow through. Because add-existing requires an explicit ref, the false-positive case only fires when the operator actually referenced a ref, which limits the blast radius.
- **Add-existing false negative** (parser returns `null` when the operator did intend it): the session confirms intent, and on the operator's confirmation the dispatch proceeds. Cost: one extra confirmation turn. Acceptable.
- **File-new false positive** (parser returns `FileNewIntent` when the operator did NOT intend it): the session drafts + presents G.6. The operator selects `Skip (don't file)`. No outward action. Cost: one gate turn. Acceptable — G.6 IS the safety net.
- **File-new false negative** (parser returns `null` when the operator did intend it): the session confirms intent, dispatches on confirmation. Cost: one extra confirmation turn. Acceptable.

The two false-positive costs are asymmetric: add-existing false-positive dispatches immediately (no gate), so the parser's ref requirement is load-bearing; file-new false-positive lands on G.6, so the parser can afford to be more generous. This is by design.

## Implementation notes

- The parsers live in `packages/claude-plugin-cockpit/lib/intent-recognition.ts` — pure functions, exported types.
- **Playbook prose is authoritative at runtime**; the parser is a machine-checkable reference. Runtime is Claude interpreting the § Add-issue flow prose; the parser exists so the prose's rule has a fixture-verifiable definition (pattern established by #394 + #400).
- The parsers do NOT invoke a drafter subagent or `cockpit_context` — they operate on operator input only, and return the intent+ref/topic. The drafter subagent (for file-new) is invoked by the playbook AFTER `parseFileNewIntent` returns a `FileNewIntent`.

## Fixtures

- `416-add-existing-full-ref.txt` — canonical full-ref phrasing (`also process generacy-ai/agency#420`). Assert: returns `{ref: "generacy-ai/agency#420"}`.
- `416-add-existing-shorthand.txt` — shorthand phrasing (`process #420 too`). Assert: returns `{ref: "#420"}`.
- `416-add-existing-multiple-refs.txt` — multiple refs (`add #420 and #421 to scope`). Assert: returns first parseable ref (`{ref: "#420"}`).
- `416-add-existing-nonref-chat.txt` — chat with no ref (`this is getting complicated`). Assert: returns `null`.
- `416-file-new-file-an-issue.txt` — canonical (`file an issue for the flaky test in module X and process it`). Assert: returns `{topic: "the flaky test in module X"}` (or similar — implementation choice on trailing "and process it").
- `416-file-new-open-a-bug.txt` — variant (`open a bug for the timeout regression`). Assert: returns `{topic: "the timeout regression"}`.
- `416-file-new-create-an-issue.txt` — variant (`create an issue about the missing loading state`). Assert: returns `{topic: "the missing loading state"}`.
- `416-file-new-ambiguous-look-at.txt` — ambiguous (`look at the timeout regression`). Assert: returns `null`.

## Verification

- **Static grep**: `commands/auto.md` § Add-issue flow subsection references `lib/intent-recognition.ts` explicitly ("see `lib/intent-recognition.ts` for the intent-class recognizer's canonical shape").
- **Behavioral**: 416-1 (add-existing) and 416-2 (file-new) — assertions in `tests/playbook-verification.test.ts` feed fixtures through the parsers and check returns.
- **True verifier**: operator smoke-test — one add-existing intent (parser returns ref, dispatches directly), one file-new intent (parser returns topic, drafter runs, G.6 fires), one ambiguous intent (parser returns null, session confirms intent, then dispatches).

## Related contracts

- [Filing gate](./filing-gate.md) — G.6 fires whenever `parseFileNewIntent` returns a `FileNewIntent`.
- [Invocation forms](./invocation-forms.md) — the `--new "<title>"` form fires the same drafter path (G.6) as a mid-run file-new intent.
