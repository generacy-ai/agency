# Contract: `generacy cockpit clarify-context`

**Consumer**: `/cockpit:clarify` Step 2
**Producer**: A1.4 in the Epic Cockpit plan (tetrad-development#85)
**Status**: Assumed shape; reconcile against A1.4's shipped surface before Phase 2 validation.

## Invocation

```bash
generacy cockpit clarify-context --issue <n>
```

| Flag | Required | Notes |
|------|----------|-------|
| `--issue <n>` | yes | Positive integer; the child issue whose open clarifications are being fetched. |

The verb does NOT pass any other flags. It does not assume `--repo`, `--format`, or environment-variable overrides; if A1.4 requires them, update this contract first.

## Expected Output (preferred: JSON on stdout)

```json
{
  "issue": 353,
  "questions": [
    {
      "number": 1,
      "topic": "Partial-approval semantics",
      "context": "US1 acceptance says the developer …",
      "question": "When the developer approves only a subset …",
      "options": [
        { "label": "A", "description": "Post the approved subset and advance the gate; …" },
        { "label": "B", "description": "Post the approved subset but do not advance the gate; …" }
      ]
    }
  ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `issue` | integer | yes | Echoes the resolved issue number for sanity-checking. |
| `questions` | array of `OpenQuestion` | yes | May be empty — see "Empty result" below. |
| `questions[].number` | integer | yes | Matches `Q[N]` in `clarifications.md` and the marker comment. |
| `questions[].topic` | string | yes | 2–5 word identifier. |
| `questions[].context` | string | yes | May be multi-line. |
| `questions[].question` | string | yes | The literal question text. |
| `questions[].options` | array | no | Present iff the question is multiple-choice. |

## Fallback Output (plain text)

If A1.4 ships a text-only output, the verb falls back to parsing blocks of the form:

```
Q1: Partial-approval semantics
Context: …
Question: …
Options:
  A: …
  B: …

Q2: …
```

Block boundary is a blank line. The verb's parser MUST tolerate either shape; it does not require A1.4 to commit to one.

## Empty Result

When `questions` is empty (no open clarifications for the issue):
- stdout: `{"issue": <n>, "questions": []}` (JSON form) or no blocks (text form)
- exit code: 0

The verb treats this as "nothing to do" and exits 0 with a status message (`no open clarification questions for issue #<n>`). It does NOT call `gh issue comment` or `generacy cockpit advance`.

## Error Conditions

| Condition | Exit code | stderr | Verb behavior |
|-----------|-----------|--------|---------------|
| Issue not found / no access | non-zero | from `gh`/`generacy` | Surface the error verbatim; exit non-zero. |
| Auth missing | non-zero | `please run gh auth login` or similar | Surface verbatim; do not attempt re-auth. |
| Malformed output | 0 (unexpected) | — | Verb exits 1 with `clarify-context output not parseable as JSON or text`; includes the first 500 bytes of stdout. |

## Stability Note

The verb's tolerance for both JSON and text output is intentional — if A1.4 ships only one form, the unused branch in the verb is a single deletion away. Do not invest in a third format without revisiting this contract.
