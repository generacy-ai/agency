# Contract: `/cockpit:clarify`

**File**: `packages/claude-plugin-cockpit/commands/clarify.md`
**Related FRs**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-010, FR-012.

## Inputs

- `$ARGUMENTS`: optional `<epic-ref>` (or bare issue number when the underlying issue itself is being clarified). Passed to the CLI verbatim.

## Behavior

1. **Argument handling** — Trim outer whitespace.
   - Empty → print `Usage: /cockpit:clarify <ref>` and exit non-zero (no CLI invocation).
   - Non-empty → capture verbatim as `<ref>`.
2. Pre-flight `command -v generacy`. On failure, use the shared error block's `MISSING_BINARY` class.
3. **Context** — Run `generacy cockpit context <ref>` via the Bash tool. Capture stdout — this yields the grounded question set (each question with its metadata) and any repo context the CLI decides to attach.
   - Note the verb: `context`. The former `clarify-context` no longer exists.
4. **Draft answers** — For each question in the context payload, draft a grounded answer using the repo context returned in step 3.
5. **Per-question approval** — For each drafted answer, invoke `AskUserQuestion` with the drafted answer as the primary option. Only `Confirm` (or the user's edited answer) proceeds. On any non-affirmative response, skip the question and log inline `skipped: <question-id>`; do NOT abort the whole loop.
6. **Post marked comment** — For each approved answer, post a marked comment via the `generacy` CLI (e.g., `generacy cockpit clarify-answer <ref> --qid <id> --body <answer>` or the current CLI shape — the exact verb is owned by the CLI's `--help`, not this playbook).
7. **Advance** — After all questions are answered (or explicitly skipped), run `generacy cockpit advance <ref>` via the Bash tool.
8. On any non-zero CLI exit, invoke the shared error block for the failing step and abort the loop.

## Forbidden

- No `specs/**` reference (FR-002, FR-010).
- No cross-slash-command invocation (FR-005).
- No use of the deprecated `clarify-context` verb name.

## Success criteria

- `grep -F 'specs/' clarify.md` returns no matches (SC-002).
- `grep -F 'clarify-context' clarify.md` returns no matches.
- Shared error block byte-identical to the other five commands (SC-005).
- The three-step assist loop (context → per-question approval → advance) is present (FR-010, clarifications Q1).
