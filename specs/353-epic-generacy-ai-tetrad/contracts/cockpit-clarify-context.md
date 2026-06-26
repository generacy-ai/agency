# Contract: `generacy cockpit clarify-context`

**Consumer**: `/cockpit:clarify` Step 2
**Producer**: G1.2 / #788 (shipped — `packages/generacy/src/cli/commands/cockpit/clarify-context.ts`)
**Status**: Reconciled against the shipped surface on 2026-06-26.

## Invocation

```bash
generacy cockpit clarify-context <issue-ref>
```

| Argument | Required | Notes |
|----------|----------|-------|
| `<issue-ref>` (positional) | yes | `<number>`, `<owner>/<repo>#<n>`, or full GitHub URL. There is NO `--issue` flag. When cockpit has more than one monitored repo configured, the bare-number form fails; the verb MUST pass the qualified `<owner>/<repo>#<n>` form. |

The verb resolves the bare issue number from `$ARGUMENTS` (or branch fallback), then qualifies it with the current repo's `nameWithOwner` (via `gh repo view --json nameWithOwner -q .nameWithOwner`) before invoking `clarify-context`.

## Expected Output (JSON on stdout)

Single-line JSON document matching the `ClarifyContextOutput` schema (`specs/788-epic-generacy-ai-tetrad/contracts/clarify-context-output.schema.json`):

```json
{
  "issue": "generacy-ai/agency#353",
  "clarificationComment": {
    "body": "<!-- generacy-clarification:batch-1 -->\n\n## 🔍 Clarification Questions (Batch 1)\n…\n### Q1: Partial-approval semantics\n**Context**: …\n**Question**: …\n**Options**:\n- A: …\n- B: …\n\n### Q2: …",
    "author": "some-login",
    "createdAt": "2026-06-26T12:00:00Z",
    "url": "https://github.com/generacy-ai/agency/issues/353#issuecomment-123"
  },
  "spec": { "path": "/abs/path/specs/353-…/spec.md", "body": "…" },
  "plan": { "path": "/abs/path/specs/353-…/plan.md", "body": "…" },
  "codeReferences": {
    "touchedFiles": ["packages/.../foo.ts"],
    "prUrl": "https://github.com/generacy-ai/agency/pull/..." ,
    "prDiffSummary": "…unified diff truncated to 4096 chars…"
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `issue` | string | Echoes resolved ref in `owner/repo#n` form. |
| `clarificationComment` | object \| null | The pending-clarification comment posted by `/speckit:clarify`. `null` if the gate has not produced one. |
| `clarificationComment.body` | string | Raw markdown body of the comment — contains the `### Q<n>: <topic>` blocks the verb must parse. |
| `clarificationComment.author` / `createdAt` / `url` | string | Provenance only; not used by the verb. |
| `spec` | object \| null | Contents of `specs/<branch>/spec.md`. `null` if missing. |
| `plan` | object \| null | Contents of `specs/<branch>/plan.md`. `null` if missing. |
| `codeReferences` | object \| null | Touched files + open-PR summary for the in-flight branch. `null` off-branch. |

## Comment-body shape parsed by the verb

`clarificationComment.body` is the markdown emitted by `formatClarificationComment` in `packages/agency-plugin-spec-kit/src/utils/issue-comment.ts`. Per-question blocks look like:

```markdown
### Q<n>: <topic>

**Context**: <free text>

**Question**: <literal question>

**Options**:
- A: <description>
- B: <description>
```

The verb extracts one `OpenQuestion` per `### Q<n>: <topic>` heading until the next `### Q` heading or the trailing `---` separator. The leading marker (`<!-- generacy-clarification:batch-N -->`) and the "How to answer" footer are ignored.

## Error Conditions

| Condition | Exit code | stderr | Verb behavior |
|-----------|-----------|--------|---------------|
| Issue not in `waiting-for:clarification` | 3 | `gate refusal: issue <ref> is not in waiting-for:clarification` | Verb exits 0 with `no open clarification questions for issue <ref>` (treat as "nothing to do"). |
| Issue ref unparseable / cockpit config mismatch | 2 | `parse issue: …` | Surface verbatim; exit non-zero. |
| `gh issue view` / lookup error | 1 | `gh issue view: …` or similar | Surface verbatim; exit non-zero. |
| `generacy` binary missing | non-zero (shell ENOENT) | — | Surface error; exit non-zero. |

## Empty `clarificationComment`

If `clarificationComment` is `null` (the issue is in `waiting-for:clarification` but no qualifying comment was found at-or-after the most-recent label event), the verb exits 0 with `no clarification comment found for issue <ref>`. It does NOT call `gh issue comment` or `generacy cockpit advance`.

## Stability Note

This contract reflects the shipped surface as of 2026-06-26. If `ClarifyContextOutput` adds fields, the verb's parser is forward-compatible (it only consults `clarificationComment.body`, `spec.body`, `plan.body`, and `codeReferences.touchedFiles`). Field removals or renames require revisiting this contract and the parse step.
