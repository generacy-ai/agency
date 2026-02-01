# Implementation Plan: E5: Claude Code plugin: clarify command

**Feature**: Implement the `/agency-spec-kit:clarify` slash command for the Claude Code plugin
**Branch**: `169-e5-claude-code-plugin`
**Status**: Complete

## Summary

This task involves implementing the clarify command for the Claude Code plugin. The clarify command enables developers to identify and resolve ambiguous or underspecified areas in feature specifications by:
1. Analyzing spec.md for ambiguities
2. Generating structured clarification questions
3. Persisting questions to clarifications.md
4. Collecting answers from the user
5. Integrating answers back into spec.md

## Current State Assessment

**The clarify command implementation already exists** at `packages/claude-plugin-agency-spec-kit/commands/clarify.md`. This implementation fully meets all acceptance criteria from the spec:

| Acceptance Criteria | Status | Evidence |
|---------------------|--------|----------|
| Create `commands/clarify.md` | ✅ Complete | File exists (230 lines) |
| Analyze spec.md for underspecified areas | ✅ Complete | Step 3 in existing command |
| Generate clarification questions | ✅ Complete | Step 4 in existing command |
| Use AskUserQuestion or direct prompts | ✅ Complete | Step 6 uses direct prompts |
| Update clarifications.md with answers | ✅ Complete | Step 7 updates answers |
| Integrate answers back into spec.md | ✅ Complete | Step 7 includes spec integration |

## Technical Context

### Language & Framework
- **Language**: Markdown (command definition file)
- **Framework**: Claude Code Plugin system
- **Dependencies**: `@generacy-ai/agency-plugin-spec-kit` MCP server

### MCP Tools Used
The clarify command uses these MCP tools from the `agency_spec_kit` namespace:
- `check_prereqs` - Validate spec.md exists
- `manage_clarifications` - Read/append/update clarifications
- `manage_clarification_labels` - Track workflow state via GitHub labels

## Project Structure

```
packages/claude-plugin-agency-spec-kit/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── commands/
│   ├── clarify.md           # ✅ COMPLETE - This task
│   ├── specify.md           # Create feature spec
│   ├── plan.md              # Generate implementation plan
│   ├── tasks.md             # Generate task list
│   ├── implement.md         # Execute tasks
│   ├── analyze.md           # Consistency analysis
│   ├── checklist.md         # Quality checklists
│   ├── constitution.md      # Project governance
│   └── taskstoissues.md     # Convert tasks to issues
└── README.md                # Plugin documentation
```

## Implementation Details

### Command Flow
```
┌─────────────────────────────────────────────────────────────────┐
│ /agency-spec-kit:clarify                                        │
├─────────────────────────────────────────────────────────────────┤
│ 1. Check Prerequisites                                          │
│    └── check_prereqs(require_spec=true)                         │
│                                                                 │
│ 2. Read Existing Clarifications                                 │
│    ├── manage_clarifications(operation="read")                  │
│    └── Process any GitHub answers (if issue_number available)   │
│                                                                 │
│ 3. Analyze Spec for Ambiguities                                 │
│    └── Read spec.md and identify underspecified areas           │
│                                                                 │
│ 4. Generate Clarification Questions                             │
│    ├── Create up to 5 targeted questions                        │
│    └── Semantic duplicate check against existing questions      │
│                                                                 │
│ 5. Persist Questions                                            │
│    ├── manage_clarifications(operation="append")                │
│    └── manage_clarification_labels(has_pending=true)            │
│                                                                 │
│ 6. Collect Answers from User                                    │
│    └── Present questions and wait for user input                │
│                                                                 │
│ 7. Update Answers                                               │
│    ├── manage_clarifications(operation="update_answer")         │
│    ├── Update spec.md with clarified information                │
│    └── manage_clarification_labels(has_pending=false)           │
│                                                                 │
│ 8. Report Completion                                            │
│    └── Summary of questions/answers and any spec updates        │
└─────────────────────────────────────────────────────────────────┘
```

### Key Features
1. **Iterative clarification**: Can run multiple times to progressively clarify
2. **GitHub integration**: Posts questions to issues and fetches answers from comments
3. **Label management**: Tracks clarification state via `waiting-for:clarification`
4. **Duplicate detection**: Semantic checking to avoid re-asking questions
5. **Workflow integration**: Works with `/autodev:continue` workflow

## Validation Checklist

- [x] Command file exists at correct path
- [x] Frontmatter contains description
- [x] All 8 workflow steps documented
- [x] MCP tool calls use correct tool names
- [x] Question format specified
- [x] Label lifecycle documented
- [x] Constraints section present
- [x] Post-command check for workflow continuation
- [x] Iterative clarification documented

## Recommendations

Since the implementation is already complete, the remaining tasks are:

1. **Verification** - Run the clarify command to ensure it works correctly
2. **Testing** - Test against a real spec.md to verify question generation
3. **Documentation** - README.md already documents the command

## Files Modified

| File | Action | Status |
|------|--------|--------|
| `packages/claude-plugin-agency-spec-kit/commands/clarify.md` | Created | ✅ Complete |

## Next Steps

Since the implementation is complete, proceed to:
1. `/speckit:tasks` - Generate task list (will likely show all tasks complete)
2. Validate implementation by testing the command manually
