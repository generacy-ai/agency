# Contract: Posted Clarification-Answer Comment

**Consumer**: Cockpit resume tooling, manual reviewers
**Producer**: `/cockpit:clarify` Step 5

This contract defines the exact body of the comment the verb posts via `gh issue comment`. Resume tooling locates this comment by scanning the issue's comments for the canonical marker on the first line.

## Comment Body Format

```
<!-- generacy-cockpit:clarification-answers -->

### Q<n1>
<final_body for question n1>

### Q<n2>
<final_body for question n2>
```

### Line-by-line rules

| Line | Content | Rule |
|------|---------|------|
| 1 | `<!-- generacy-cockpit:clarification-answers -->` | Exact string. No leading whitespace. No trailing whitespace. (clarification Q2 / D2) |
| 2 | _(blank)_ | Exactly one blank line separating marker from first answer block. |
| 3+ | Answer blocks | One block per approved question, in ascending `question_number` order. |

### Answer block format

```
### Q<n>
<final_body>
```

| Element | Rule |
|---------|------|
| Header | `###` heading prefix + space + `Q<n>` where `<n>` is the integer question number (no zero-padding). |
| Body | The `final_body` from the `ApprovalDecision` (approved draft or developer-edited text). May span multiple lines. Markdown is preserved. |
| Separator between blocks | Exactly one blank line. |

### Trailing

The body ends with a single `\n` after the last answer block's last line. No trailing blank line.

## Posting Mechanics

The verb writes the body to a temp file and posts via `--body-file`:

```bash
gh issue comment <n> --body-file /tmp/cockpit-clarify-answers-<n>-<unix_ts>.md
```

| Choice | Reason |
|--------|--------|
| `--body-file` not `-b` | Preserves the HTML marker verbatim; avoids shell-quoting edge cases. (D2) |
| Tempfile path includes issue + timestamp | Avoids collisions if the verb runs for two issues in parallel. |
| Tempfile not cleaned up by the verb | OS `/tmp` handles cleanup; leaving the file aids post-mortem debugging. |

## Marker Discovery (informational)

Downstream tooling locates cockpit answer comments via:

```bash
gh issue view <n> --json comments \
  | jq '.comments[] | select(.body | startswith("<!-- generacy-cockpit:clarification-answers -->"))'
```

The first-line marker placement (D2) makes `startswith` sufficient — no regex or multi-line scan is needed.

## Non-Goals

- The verb does NOT edit prior cockpit comments on re-runs. Append-only (D6).
- The verb does NOT add a footer (no "posted by Claude Code" tagline). The marker is the only authorship signal.
- The verb does NOT add labels via `gh issue edit`. Label management is upstream's responsibility.
