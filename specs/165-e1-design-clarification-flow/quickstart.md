# Quickstart: Clarification Flow with Humancy

## Overview

This document describes how to use the clarification workflow with Humancy integration for real-time human-in-the-loop specification refinement.

## Prerequisites

- Agency MCP server running
- Speckit plugin installed
- Humancy plugin installed (optional - GitHub fallback available)

## Installation

### Required Plugins

```bash
# Install speckit (clarifications)
pnpm install @agency/plugin-speckit

# Install humancy (optional, for real-time)
pnpm install @agency/plugin-humancy
```

### Configuration

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "speckit": {
      "command": "node",
      "args": ["path/to/speckit/dist/index.js"]
    },
    "humancy": {
      "command": "node",
      "args": ["path/to/humancy/dist/index.js"],
      "env": {
        "HUMANCY_API_URL": "https://humancy.example.com",
        "HUMANCY_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Usage

### Running the Clarify Command

```bash
# From within an active feature branch
/speckit:clarify
```

This will:
1. Analyze `spec.md` for underspecified areas
2. Generate clarification questions
3. Store questions in `clarifications.md`
4. Send questions to Humancy (or GitHub if unavailable)
5. Wait for and process answers

### Question Types

#### Freeform Questions

```markdown
### Q1: Timeout Value
**Context**: Need to define default timeout for API calls
**Question**: What should the default timeout be in seconds?
**Answer**: *Pending*
```

Sent via `humancy.ask_question` - human can provide any text response.

#### Multiple Choice Questions

```markdown
### Q2: Authentication Method
**Context**: Choosing between auth approaches
**Question**: Which authentication method should we use?
**Options**:
- A: JWT tokens - Stateless, scalable
- B: Server sessions - Traditional, simpler
- C: OAuth 2.0 - Third-party integration
**Answer**: *Pending*
```

Sent via `humancy.request_decision` - human selects from options.

### Urgency Levels

Questions can have different urgency levels:

| Level | Behavior | Use Case |
|-------|----------|----------|
| `blocking` | Agent waits for answer | Critical architectural decisions |
| `important` | Agent can continue briefly | Important clarifications |
| `optional` | Non-blocking | Nice-to-have details |

### Checking Clarification Status

```bash
# Read current clarifications
/speckit:clarify --status

# Or manually check the file
cat specs/<feature>/clarifications.md
```

### Manual Answer Entry

If not using Humancy, answers can be provided via:

1. **GitHub Issue Comments**: Reply to the posted questions
2. **Direct File Edit**: Edit `clarifications.md` directly

```markdown
### Q1: Timeout Value
...
**Answer**: 30 seconds is the standard for our APIs
```

## Available Commands

| Command | Description |
|---------|-------------|
| `/speckit:clarify` | Run clarification analysis |
| `/speckit:clarify --status` | Check pending questions |
| `/speckit:clarify --retry` | Retry unanswered questions |

## Workflow Integration

### With /autodev:continue

The clarification flow integrates with the autodev workflow:

```bash
/autodev:continue <issue-url>
```

This automatically:
1. Detects if clarify phase is needed
2. Runs `/speckit:clarify`
3. Waits for answers (if Humancy available)
4. Continues to planning phase when complete

### Phase Flow

```
specify → clarify → plan → tasks → implement
```

## Troubleshooting

### Humancy Not Available

**Symptom**: Questions posted to GitHub instead of Humancy

**Solution**:
- Verify Humancy plugin is installed
- Check API configuration (URL, API key)
- Verify network connectivity

### Questions Timing Out

**Symptom**: Questions marked as "skipped" or workflow blocked

**Solution**:
- Check Humancy decision queue in VS Code
- Increase timeout configuration
- Change urgency level to non-blocking

### Answers Not Syncing

**Symptom**: GitHub answers not appearing in clarifications.md

**Solution**:
- Re-run `/speckit:clarify` to fetch latest answers
- Ensure answers follow expected format:
  ```
  @agent-reply Q1: Your answer here
  ```

## Configuration Options

### Global Settings

```json
{
  "clarifications": {
    "defaultUrgency": "important",
    "defaultTimeout": 900000,
    "maxQuestionsPerBatch": 10,
    "fallbackToGitHub": true
  }
}
```

### Per-Question Settings

Questions can override global settings:

```typescript
const question: ClarificationQuestion = {
  number: 1,
  topic: "Critical Decision",
  context: "...",
  question: "...",
  urgency: "blocking",
  timeout: 600000 // 10 minutes
};
```

## Best Practices

1. **Be Specific**: Provide clear context for each question
2. **Limit Batch Size**: Keep batches under 10 questions
3. **Use Options**: Multiple choice questions get faster responses
4. **Set Urgency Appropriately**: Only use "blocking" for critical decisions
5. **Follow Up**: Re-run clarify if new questions emerge during planning
