# Quickstart: E5: Claude Code plugin: clarify command

## Installation

The clarify command is part of the `agency-spec-kit` Claude Code plugin. To use it:

1. Ensure the plugin is installed in your Claude Code environment
2. Configure the `@generacy-ai/agency-plugin-spec-kit` MCP server

## Usage

### Basic Usage

```
/agency-spec-kit:clarify
```

This will:
1. Check that `spec.md` exists in your feature directory
2. Read any existing clarifications
3. Analyze your spec for ambiguous areas
4. Generate up to 5 clarification questions
5. Present questions for you to answer
6. Update spec.md with clarified information

### Within Workflow

The clarify command is typically run as part of the specification workflow:

```
/specify     # Create initial spec
/clarify     # Resolve ambiguities ← This command
/plan        # Generate implementation plan
/tasks       # Create task list
/implement   # Execute tasks
```

Or via the automated workflow:

```
/autodev:continue https://github.com/owner/repo/issues/123
```

## Example Session

```
> /agency-spec-kit:clarify

Checking prerequisites...
✓ spec.md exists

Reading existing clarifications...
✓ No pending questions found

Analyzing spec.md for underspecified areas...

Found 2 areas needing clarification:

### Q1: Error Handling
**Context**: The spec mentions "graceful error handling" but doesn't define specific behaviors.
**Question**: What should happen when the API returns a 500 error?
**Options**:
- A: Retry up to 3 times with exponential backoff
- B: Show error message and stop
- C: Log error and continue with default values

### Q2: Cache Duration
**Context**: The caching strategy mentions "reasonable TTL" without specifics.
**Question**: How long should cached responses be valid?
**Options**:
- A: 5 minutes
- B: 1 hour
- C: Configurable via environment variable

Questions persisted to clarifications.md.
Please provide your answers:
```

## Question Format

Questions follow this structure:

```markdown
### QN: Topic
**Context**: Why this matters for implementation
**Question**: Specific question to answer
**Options** (when applicable):
- A: First option
- B: Second option
```

## Answering Questions

You can answer questions in several ways:

1. **Select an option**: "Q1: A, Q2: C"
2. **Provide custom answer**: "Q1: Retry 5 times with 1s delay"
3. **Answer one at a time**: Just respond naturally

## Troubleshooting

### "spec.md not found"

The clarify command requires a spec.md file. Run `/specify` first or ensure you're in a feature branch with a specs directory.

### "No clarifications needed"

If the spec is sufficiently detailed, the command may complete without generating questions. This is normal - proceed to `/plan`.

### Questions already asked

The command performs semantic duplicate checking. If you see "skipping duplicate question", a similar question was already asked in a previous batch.

## Related Commands

| Command | When to Use |
|---------|-------------|
| `/specify` | Before clarify, to create the initial spec |
| `/plan` | After clarify, to generate implementation plan |
| `/analyze` | Anytime, to check consistency across artifacts |
