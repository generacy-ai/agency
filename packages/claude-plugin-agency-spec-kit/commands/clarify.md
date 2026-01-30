---
description: Identify underspecified areas in the spec and integrate answers back
---

# Clarify Command

Identify ambiguous or underspecified areas in the feature specification and persist questions to `clarifications.md`.

## Arguments

- `$ARGUMENTS`: (No arguments required)

## Instructions

### Step 1: Check Prerequisites

Call the `check_prereqs` MCP tool:
- Require: `spec.md`
- Get list of available optional documents

### Step 2: Read Existing Clarifications

**Extract the issue number** from the current branch name (pattern: `###-*`, e.g., `155-feature-name` → `155`).

Call the `manage_clarifications` MCP tool with operation "read":
- Provide `issue_number` if extracted (enables GitHub answer fetching)
- This returns existing questions and their status
- Note the `pending_count` and `total_count`
- Store `batches` for duplicate checking in Step 4
- Check `github_answers` for any answers found on GitHub

**If `github_answers` contains answers**:
1. Present each GitHub answer to the user for confirmation:
   ```
   📥 Found answer on GitHub for Q[N]:
   Author: @[username]
   Answer: [answer_text]

   Do you want to accept this answer? (yes/no/edit)
   ```
2. If user accepts: Call `manage_clarifications` with operation "update_answer" for each accepted answer
3. If user wants to edit: Collect the edited answer, then update
4. If user rejects: Skip that answer

If there are pending questions (answers marked `*Pending*` and no GitHub answers):
- Present these to the user first
- Ask if they want to answer pending questions before generating new ones
- If yes, go to Step 6 (Collect Answers)

### Step 3: Analyze Spec for Ambiguities

**Read the spec.md file** and analyze for:
- Missing acceptance criteria
- Vague requirements
- Undefined edge cases
- Unstated assumptions
- Unclear priorities

### Step 4: Generate Clarification Questions

**Generate up to 5 highly targeted clarification questions**:
- Focus on areas that would block implementation
- Prioritize questions by impact
- Avoid questions that can be inferred from context
- Format questions clearly with context

**IMPORTANT - Semantic Duplicate Check**:
Before finalizing questions, compare each new question against existing questions from Step 2:
- Check if any existing question asks semantically the same thing (even with different wording)
- Skip questions that duplicate existing ones
- Only include truly new questions

If the spec is sufficiently clear (no ambiguities found) AND no pending questions exist:
- Output: "✓ No clarifications needed - spec is unambiguous"
- **Important**: The clarify phase still completes normally (it is NOT skipped)
- This ensures the `completed:clarify` label will be added by the workflow
- Skip to Step 8 (Report completion)

### Step 5: Persist Questions to clarifications.md

Call the `manage_clarifications` MCP tool with operation "append":
- Provide `issue_number` if extracted from branch name (enables GitHub posting)
- Provide the `questions` array with topic, context, question, and optional options for each
- The tool will:
  - Create `clarifications.md` if it doesn't exist
  - Add a batch header with timestamp
  - Assign sequential question numbers
  - Set answers to `*Pending*`
  - **If `issue_number` provided**: Post questions as a comment on the GitHub issue

**Check the response's `github` field**:
- If `github.success` is true: Questions were posted to GitHub
- If `github.warning` is present: Questions saved locally but GitHub posting failed (see warning for details)
- If `github.duplicates_skipped` > 0: Some questions were already on GitHub

### Step 5a: Update Labels for Pending Questions

After persisting questions, call `manage_clarification_labels` MCP tool to add the `waiting-for:clarification` label:

1. Extract the issue number from the current branch name (pattern: `###-*`, e.g., `155-feature-name` → `155`)
2. Call `manage_clarification_labels` with:
   - `issue_number`: The extracted issue number
   - `has_pending_questions`: `true`

This ensures the workflow blocks until the user answers the questions.

**Note**: If the issue number cannot be extracted from the branch name, skip label management and continue with Step 6.

### Step 6: Present Questions and Collect Answers

Present each NEW question to the user:

```markdown
### Q[N]: [Topic]
**Context**: [Why this matters]
**Question**: [Specific question]
**Options** (if applicable):
- A: [description]
- B: [description]
```

Wait for user answers. Users may:
- Answer all questions at once
- Answer questions individually
- Skip questions (leave as pending)
- Request clarification on the questions themselves

### Step 7: Update Answers in clarifications.md

For each answer provided by the user:
- Call `manage_clarifications` MCP tool with operation "update_answer"
- Provide `question_number` and `answer` text
- The tool replaces `*Pending*` with the actual answer

If answers reveal new information that should be in spec.md:
- Update the relevant sections of spec.md with the clarified information
- Remove any `[NEEDS CLARIFICATION]` markers that are resolved

### Step 7a: Update Labels When All Questions Answered

After updating answers, check if all questions have been answered (no `*Pending*` answers remain):

1. Call `manage_clarifications` with operation "read" to get updated `pending_count`
2. If `pending_count` is 0 (all questions answered):
   - Extract the issue number from the current branch name (pattern: `###-*`)
   - Call `manage_clarification_labels` with:
     - `issue_number`: The extracted issue number
     - `has_pending_questions`: `false`
   - This removes the `waiting-for:clarification` label

**Note**: The `completed:clarification` label is added by the USER to signal they are done answering, not by the agent.

### Step 8: Report Completion

Report completion with:
- Questions asked and their answers (or pending status)
- Number of new questions added to clarifications.md
- Number of pending questions remaining
- Sections updated in spec.md (if any)

**Note**: After reporting, check your todo list for any remaining parent workflow steps.

## Question Format

Questions MUST follow this format in clarifications.md:

```markdown
### Q[N]: [Topic]
**Context**: [Why this matters]
**Question**: [Specific question]
**Options** (if applicable):
- A: [description]
- B: [description]

**Answer**: *Pending*
```

Where:
- `[N]` is the sequential question number across all batches
- `[Topic]` is a 2-5 word identifier
- Context explains implementation impact
- Question is specific and answerable
- Options provide discrete choices when applicable

## Clarification Labels

When running as part of an autodev workflow, labels track clarification state:

### Label Lifecycle
1. **Questions pending**: `waiting-for:clarification` label may be added to the issue
2. **User completes answering**: User adds `completed:clarification` label manually

### Important Notes
- Label management is handled by autodev (via `manage_clarification_labels` MCP tool)
- The `completed:clarification` label must be added by the USER, not the agent

### Label Reference
| Label | Set By | Meaning |
|-------|--------|---------|
| `waiting-for:clarification` | Agent | Clarification pending |
| `completed:clarification` | User | User has finished answering questions |

## Constraints

- Maximum 5 questions per session
- Questions must be specific and actionable
- Avoid implementation details in questions
- Focus on requirements and user value
- ALWAYS persist questions to clarifications.md before presenting to user

## Post-Command Check

**IMPORTANT**: If this command was invoked as part of a larger workflow (e.g., `/autodev:start` or `/autodev:continue`):
1. This command's completion is NOT the end of the workflow
2. Check your todo list - there WILL be remaining tasks
3. You MUST immediately proceed to the next task in your todo list
4. Do NOT output a final response or wait for user input

Continue NOW with the parent workflow.

## Iterative Clarification

The clarify command can run multiple times:
1. **First run**: Identify ambiguities, persist questions, collect answers
2. **Second run** (after answers integrated): Identify any new ambiguities
3. **Repeat** until spec is sufficiently clear (no more questions generated)

Each run:
- Reads existing clarifications first (avoids duplicates)
- Only adds new questions that weren't previously asked
- Updates answers for any pending questions
