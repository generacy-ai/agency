# Data Model: Integrate Label Protocol for Clarification and Phase Management

## Core Entities

### Extended ManageClarificationsParams

```typescript
interface ManageClarificationsParams {
  operation: 'read' | 'append' | 'update_answer';
  feature_dir?: string;
  cwd?: string;
  questions?: ClarificationQuestionInput[];
  question_number?: number;
  answer?: string;

  // NEW: GitHub issue integration
  issue_number?: number;  // When provided, enables GitHub comment mode
}
```

### GitHub Comment Output Types

```typescript
/** Result of posting a clarification comment to GitHub */
interface GitHubCommentResult {
  comment_id: string;
  issue_number: number;
  batch_number: number;
  marker: string;  // e.g., 'generacy-clarification:batch-1'
}

/** A parsed answer from a GitHub issue comment */
interface ParsedAnswer {
  question_number: number;
  answer: string;
  source: 'file' | 'github';
  comment_id?: string;  // GitHub comment ID where answer was found
}

/** Extended read output with GitHub comment data */
interface ReadClarificationsOutput {
  success: boolean;
  exists: boolean;
  batches: ClarificationBatch[];
  pending_count: number;
  total_count: number;
  error?: string;

  // NEW: GitHub-sourced answers
  github_answers?: ParsedAnswer[];
  github_comment_ids?: string[];
}

/** Extended append output with GitHub comment data */
interface AppendClarificationsOutput {
  success: boolean;
  batch_number: number;
  questions_added: number;
  first_question_number: number;
  humancy_requests?: HumancyRequestStatus[];
  error?: string;

  // NEW: GitHub comment posting result
  github_comment?: GitHubCommentResult;
}
```

### IssueTracker Facet Extension

```typescript
/** Added to the IssueTracker interface in Latency */
interface IssueTracker {
  // ... existing methods ...

  /**
   * List comments on an issue.
   * Returns comments in chronological order.
   */
  listComments(issueId: string): Promise<Comment[]>;
}
```

### Comment Marker Format

```typescript
/** HTML marker embedded in clarification comments */
const CLARIFICATION_MARKER_PREFIX = 'generacy-clarification';

/** Build marker string for a batch */
function buildClarificationMarker(batchNumber: number): string {
  return `<!-- ${CLARIFICATION_MARKER_PREFIX}:batch-${batchNumber} -->`;
}

/** Extract batch number from a marker string */
function parseClarificationMarker(marker: string): number | null {
  const match = marker.match(/generacy-clarification:batch-(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
```

## Relationships

```
ManageClarificationsParams
  ├── issue_number? ──→ IssueTracker.addComment()
  │                      IssueTracker.listComments()
  ├── questions[] ──→ ClarificationQuestionInput
  │                    ├── formatAsGitHubComment() → markdown string
  │                    └── formatBatch() → clarifications.md entry
  └── operation
       ├── 'append' ──→ AppendClarificationsOutput
       │                 ├── writes clarifications.md
       │                 ├── posts GitHub comment (if issue_number)
       │                 └── invokes Humancy (if available)
       ├── 'read' ──→ ReadClarificationsOutput
       │               ├── parses clarifications.md
       │               └── fetches + parses GitHub answers (if issue_number)
       └── 'update_answer' ──→ UpdateAnswerOutput
                                └── updates clarifications.md
```

## Validation Rules

- `issue_number` must be a positive integer when provided
- `questions` array must be non-empty for `append` operation
- Question numbers are globally unique across batches
- Batch numbers are sequential starting from 1
- Answer format: `Q<N>: <answer text>` where N matches a question number
- HTML markers must be the first line of the comment body
