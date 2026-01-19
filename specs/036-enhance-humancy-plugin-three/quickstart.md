# Quickstart: Three-Layer Decision Model

## Overview

The enhanced humancy plugin supports a three-layer decision model:
1. **Baseline** - AI recommendation without human wisdom
2. **Protégé** - Trained AI prediction based on human's principles
3. **Human** - Final decision with optional coaching feedback

## Installation

The humancy plugin is included in the agency workspace:

```bash
# From repository root
pnpm install
pnpm build
```

## Basic Usage

### Simple Decision (Backward Compatible)

```typescript
// Works exactly as before
const result = await humancy.request_decision({
  question: "Which database should we use?",
  options: [
    { id: "postgres", label: "PostgreSQL" },
    { id: "mysql", label: "MySQL" }
  ]
});

// Returns: { selectedOption: "postgres" }
```

### Enhanced Decision with Three-Layer

```typescript
const result = await humancy.request_decision({
  question: "Which database should we use?",
  options: [
    {
      id: "postgres",
      label: "PostgreSQL",
      tradeoffs: {
        pros: ["ACID compliance", "JSON support", "Extensions"],
        cons: ["More complex setup"]
      }
    },
    {
      id: "mysql",
      label: "MySQL",
      tradeoffs: {
        pros: ["Simple", "Fast reads", "Widely supported"],
        cons: ["Less feature-rich"]
      }
    }
  ],
  domain: ["backend", "infrastructure"],
  decisionContext: {
    projectConstraints: ["prefer-managed-services"],
    relatedIssue: "#42"
  },
  includeRecommendations: true
});

// Returns enhanced response:
{
  decisionId: "abc-123-def",
  selectedOption: "postgres",
  baseline: {
    optionId: "mysql",
    confidence: 65,
    reasoning: ["Simpler setup", "Common choice"]
  },
  protege: {
    optionId: "postgres",
    confidence: 82,
    reasoning: ["JSON support aligns with API requirements"],
    appliedPrinciples: ["prefer-type-safety"]
  },
  human: {
    optionId: "postgres",
    matchedProtege: true,
    coaching: null
  }
}
```

### Reporting Decision Outcomes

After implementing a decision, report the outcome for learning:

```typescript
// Decision was successful
await humancy.report_decision_result({
  decisionId: "abc-123-def",
  outcome: "success",
  details: "PostgreSQL performed well under load"
});

// Decision had mixed results
await humancy.report_decision_result({
  decisionId: "abc-123-def",
  outcome: "mixed",
  details: "Good for queries but migration was complex"
});
```

### Retrieving Decision History

Look up a previous decision and its outcome:

```typescript
const record = await humancy.get_decision_outcome({
  decisionId: "abc-123-def"
});

// Returns:
{
  decisionId: "abc-123-def",
  request: {
    question: "Which database should we use?",
    options: [...],
    domain: ["backend", "infrastructure"],
    timestamp: "2026-01-19T10:00:00Z"
  },
  selectedOption: "postgres",
  threeLayer: { ... },
  decidedAt: "2026-01-19T10:05:00Z",
  outcome: {
    result: "success",
    details: "PostgreSQL performed well under load",
    reportedAt: "2026-01-20T15:00:00Z"
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `humancy.request_decision` | Request human decision with optional three-layer support |
| `humancy.report_decision_result` | Report outcome of a previous decision |
| `humancy.get_decision_outcome` | Retrieve decision record and outcome |

## Parameters Reference

### request_decision

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | Yes | The decision question |
| `options` | array | Yes | Available choices (2-10) |
| `options[].id` | string | Yes | Unique option identifier |
| `options[].label` | string | Yes | Display text |
| `options[].description` | string | No | Detailed explanation |
| `options[].tradeoffs` | object | No | Pros and cons |
| `context` | string | No | Additional context text |
| `domain` | string[] | No | Domain tags for principle matching |
| `decisionContext` | object | No | Structured context |
| `includeRecommendations` | boolean | No | Get three-layer breakdown |
| `urgency` | string | No | blocking_now, blocking_soon, when_available |
| `timeout` | number | No | Max wait time in ms |

### report_decision_result

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `decisionId` | string | Yes | ID from decision response |
| `outcome` | string | Yes | success, failure, or mixed |
| `details` | string | No | Additional context |

### get_decision_outcome

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `decisionId` | string | Yes | ID to look up |

## Troubleshooting

### "Humancy is offline"

The plugin couldn't detect a connection to the human portal:
- Ensure VS Code with Humancy extension is running
- Check network connectivity
- Retry after a brief delay

### "Decision not found"

The requested decisionId doesn't exist:
- Verify the decisionId is correct
- Decision records may expire after extended periods
- Only decisions made with this plugin instance are stored

### "Invalid parameters"

Parameter validation failed:
- Check all required fields are provided
- Ensure options array has 2-10 items
- Verify option IDs are unique
