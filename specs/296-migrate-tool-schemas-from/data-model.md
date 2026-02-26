# Data Model: Migrated Schemas

**Branch**: `296-migrate-tool-schemas-from` | **Date**: 2026-02-25

This document catalogs every schema entity being migrated, showing before/after state and reconciliation decisions.

---

## 1. Tool Naming Schemas

### ToolPrefix (Reconciled)

**Before (agency)**: Plain array `STANDARD_PREFIXES` with 7 values
**Before (contracts)**: Zod enum `ToolPrefixSchema` with 9 values
**After**: Zod enum with 10 values (union)

```typescript
// src/tools/naming/prefix.ts
export const ToolPrefixValues = [
  'source_control', 'build', 'run', 'test', 'debug',
  'deploy', 'humancy', 'file', 'database', 'docs',
] as const;

export const ToolPrefixSchema = z.enum(ToolPrefixValues);
export type ToolPrefix = z.infer<typeof ToolPrefixSchema>;
```

**Backward compat**: `STANDARD_PREFIXES` in `prefixes.ts` becomes a re-export of `ToolPrefixValues`.

### ActionName (New from contracts)

```typescript
// src/tools/naming/action.ts
const ACTION_NAME_REGEX = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
export const ActionNameSchema = z.string().regex(ACTION_NAME_REGEX);
export type ActionName = z.infer<typeof ActionNameSchema>;
```

### ToolName (New from contracts)

```typescript
// src/tools/naming/tool-name.ts
const TOOL_NAME_REGEX = /^[a-z][a-z0-9]*(_[a-z0-9]+)*\.[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export const ToolNameSchema = z.string()
  .regex(TOOL_NAME_REGEX, 'Tool name must match prefix.action_name format')
  .superRefine((val, ctx) => {
    const [prefix] = val.split('.');
    const prefixResult = ToolPrefixSchema.safeParse(prefix);
    if (!prefixResult.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown prefix: ${prefix}` });
    }
  });

export type ToolName = z.infer<typeof ToolNameSchema>;

export function parseToolName(name: string): { prefix: string; action: string };
export function createToolName(prefix: ToolPrefix, action: ActionName): ToolName;
```

### ToolValidationError (New from contracts)

```typescript
// src/tools/naming/validation-error.ts
export const ToolValidationErrorCode = ['INVALID_PREFIX', 'INVALID_ACTION_NAME', 'MISSING_PREFIX', 'MALFORMED_NAME'] as const;

export const ToolValidationErrorSchema = z.object({
  code: z.enum(ToolValidationErrorCode),
  message: z.string(),
  suggestion: z.string().optional(),
});

export type ToolValidationError = z.infer<typeof ToolValidationErrorSchema>;
```

### ToolDefinition (New from contracts)

```typescript
// src/tools/naming/tool-definition.ts
export const ToolDefinitionSchema = z.object({
  name: ToolNameSchema,
  prefix: ToolPrefixSchema,
  action: ActionNameSchema,
  description: z.string(),
  parameters: z.unknown(),  // Zod schema (runtime)
  returns: z.unknown(),     // Zod schema (runtime)
  aliases: z.array(z.string()).optional(),
  deprecated: z.boolean().optional(),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
```

### ValidationResult (Unchanged in agency)

```typescript
// src/tools/types.ts — UNCHANGED
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

The `validateToolName()` function keeps this return type. Zod validation happens internally.

---

## 2. Tool Result Schema

### TerseToolResult (Reconciled)

**Before (agency)**: Plain TypeScript interface in `output/types.ts`
**Before (contracts)**: Zod schema with `.passthrough()` and `data` field
**After**: Zod schema is source of truth, re-exported from `output/types.ts`

```typescript
// src/schemas/tool-result.ts — SOURCE OF TRUTH
export const TerseToolResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  data: z.unknown().optional(),
}).passthrough();

export type TerseToolResult = z.infer<typeof TerseToolResultSchema>;

export interface TerseToolOptions {
  verbose?: boolean;
  includeStackTrace?: boolean;
}

export function parseTerseToolResult(data: unknown): TerseToolResult;
export function safeParseTerseToolResult(data: unknown): z.SafeParseReturnType<unknown, TerseToolResult>;
```

**Note**: The `data` field is new (from contracts). It's optional, so existing code producing `{ success, output }` objects remains valid. The `.passthrough()` means extra properties are preserved through parsing.

---

## 3. Telemetry Schemas

### ToolCallEventV1 (Reconciled)

**Before (agency)**: UUID-based ID, `toolName`/`serverName` fields, minimal optional fields
**Before (contracts)**: ULID-based ID, `tool`/`server` fields, rich optional fields
**After**: ULID-based ID, agency field names, contracts' extra fields added as optional

```typescript
// src/telemetry/schemas.ts — MODIFIED
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const ToolCallEventV1 = z.object({
  // Changed: UUID → ULID (Q1)
  id: z.string().regex(ULID_REGEX, 'Must be a valid ULID'),

  // Unchanged: agency field names (Q5)
  timestamp: z.string().datetime(),
  toolName: z.string().min(1),
  serverName: z.string().min(1),

  // Unchanged: optional (Q6)
  sessionId: z.string().optional(),
  inputs: z.record(z.unknown()).optional(),
  outputs: z.unknown().optional(),
  error: z.string().optional(),
  durationMs: z.number().nonnegative(),
  success: z.boolean(),

  // New: from contracts (Q5 — extra fields as optional)
  errorCategory: z.string().optional(),
  errorType: z.string().optional(),
  workflowId: z.string().optional(),
  issueNumber: z.number().int().optional(),
  phase: z.string().optional(),
}).passthrough();

// New: ULID generator
export function generateEventId(): string {
  return ulid();
}
```

### ToolStatsSchema (Unchanged)

```typescript
// src/telemetry/schemas.ts — UNCHANGED
export const ToolStatsSchema = z.object({
  totalCalls: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  avgDurationMs: z.number().nonnegative(),
  minDurationMs: z.number().nonnegative(),
  maxDurationMs: z.number().nonnegative(),
  p50DurationMs: z.number().nonnegative().optional(),
  p95DurationMs: z.number().nonnegative().optional(),
  p99DurationMs: z.number().nonnegative().optional(),
});
```

### ToolStatsApiSchema (New from contracts)

```typescript
// src/telemetry/schemas.ts — NEW
export const TimeWindowSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const ToolStatsApiSchema = z.object({
  version: z.string(),
  server: z.string(),
  tool: z.string(),
  timeWindow: TimeWindowSchema,
  totalCalls: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  avgDurationMs: z.number().nonnegative(),
  p50DurationMs: z.number().nonnegative().optional(),
  p95DurationMs: z.number().nonnegative().optional(),
  errorBreakdown: z.record(z.number().int().nonnegative()).optional(),
}).passthrough();

export type ToolStatsApi = z.infer<typeof ToolStatsApiSchema>;
```

---

## 4. Domain Schemas (P2 — Subpath Exports)

These are migrated as-is from contracts with minimal changes (import path fixes, vitest adaptation). Key entities per domain:

### Extension Comms
| Entity | Description |
|--------|-------------|
| `CoachingFeedbackSchema` | Coaching feedback with ULID ID, scope, provider, timestamps |
| `DecisionQueueFilter.V1` | Filter for decision queue (urgency, status, date range) |
| `SSEEvent.V1` | Server-sent event with type-safe data payloads |
| `WorkflowStatusDataSchema` | Workflow execution status tracking |
| `WorkflowDefinitionSchema` | Workflow step definitions |

### GitHub App
| Entity | Description |
|--------|-------------|
| `PermissionScope.V1` | Category + level permission pair |
| `ProgressivePermissionRequest.V1` | Permission request with ULID ID and lifecycle |
| `WebhookEvent.V1` | Typed webhook event with 41 event types |

### Platform API
| Entity | Description |
|--------|-------------|
| `ApiKeySchema` | API key with hashed value and scopes |
| `AuthTokenSchema` | JWT-like auth token |
| `SessionSchema` | User session with expiry |
| `OrganizationSchema` | Organization entity |
| `MembershipSchema` | Org membership with roles |
| `InviteSchema` | Org invitation |
| `GeneracyTierSchema` | Generacy subscription tier |
| `HumancyTierSchema` | Humancy subscription tier |
| `FeatureEntitlementSchema` | Feature access entitlement |
| `UsageLimitSchema` | Usage limit and tracking |

### Knowledge Store
| Entity | Description |
|--------|-------------|
| `PhilosophySchema` | Top-level values, boundaries, meta-preferences |
| `PrincipleSchema` | Derived principles with evidence records |
| `PatternSchema` | Observed behavioral patterns |
| `UserContextSchema` | Current priorities, constraints, energy levels |
| `IndividualKnowledgeSchema` | Composite of all 4 layers |

### Learning Loop
| Entity | Description |
|--------|-------------|
| `LearningCoachingDataSchema` | Raw coaching input data |
| `KnowledgeUpdateSchema` | Proposed knowledge modifications |
| `PatternCandidateSchema` | Candidate patterns for promotion |
| `LearningEventSchema` | Audit trail events |
| `LearningSessionSchema` | Session-level aggregation |

### Decision Model
| Entity | Description |
|--------|-------------|
| `ThreeLayerDecisionRequestSchema` | Decision request with options and context |
| `BaselineRecommendationSchema` | System baseline recommendation |
| `ProtegeRecommendationSchema` | AI recommendation with reasoning steps |
| `HumanDecisionSchema` | Human's final decision with coaching data |
| `ThreeLayerDecisionSchema` | Complete decision record with attribution |

### Attribution Metrics
| Entity | Description |
|--------|-------------|
| `DecisionOutcomeSchema` | Per-decision outcome with attribution |
| `DomainMetricsSchema` | Metrics aggregated by domain |
| `VolumeMetricsSchema` | Decision volume tracking |
| `MetricsTrendSchema` | Trend analysis over time |
| `IndividualMetricsSchema` | Individual user metrics |
| `LeaderboardEntrySchema` | Public leaderboard entry |
| `MetricsReportSchema` | Verified metrics report |

### Data Export
| Entity | Description |
|--------|-------------|
| `DecisionHistoryExport.V1` | Exportable decision history |
| `KnowledgeExport.V1` | Exportable knowledge layers |
| `ProtegeDataExport.V1` | Exportable protege/coaching data |
| `WorkflowCloudState.V1` | Exportable workflow definitions and state |
| `QueueState.V1` | Exportable queue items and filters |

---

## 5. Common/Shared Types (New)

Extracted from contracts' shared patterns used across domain schemas:

```typescript
// src/schemas/common/ids.ts
const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const UlidSchema = z.string().regex(ULID_REGEX, 'Must be a valid ULID');

export function createPrefixedIdSchema(prefix: string) {
  return z.string().regex(new RegExp(`^${prefix}_[a-z0-9]{8,}$`));
}

// Branded ID type pattern
export type BrandedId<Brand extends string> = string & { readonly __brand: Brand };
```

```typescript
// src/schemas/common/timestamps.ts
export const ISOTimestampSchema = z.string().datetime();
export const TimestampsSchema = z.object({
  createdAt: ISOTimestampSchema,
  updatedAt: ISOTimestampSchema,
});
```

---

## 6. Export Map Summary

### Root Export (`.`) — P1 schemas

| Export | Source |
|--------|--------|
| `ToolPrefixValues`, `ToolPrefixSchema`, `ToolPrefix` | tools/naming/ |
| `ActionNameSchema`, `ActionName` | tools/naming/ |
| `ToolNameSchema`, `ToolName`, `parseToolName`, `createToolName` | tools/naming/ |
| `ToolValidationErrorCode`, `ToolValidationErrorSchema`, `ToolValidationError` | tools/naming/ |
| `validateToolNameStructured` | tools/naming/ (contracts' version) |
| `ToolDefinitionSchema`, `ToolDefinition` (as `ToolNamingDefinitionSchema`/`ToolNamingDefinition`) | tools/naming/ |
| `TerseToolResultSchema`, `TerseToolOptions`, `parseTerseToolResult`, `safeParseTerseToolResult` | schemas/tool-result |
| `ToolStatsApiSchema`, `ToolStatsApi` | telemetry/ |
| `generateEventId` | telemetry/ |
| `TimeWindowSchema` | telemetry/ |
| Platform API schemas (all) | schemas/platform-api/ |
| All existing agency exports | unchanged |

### Subpath Exports — P2 schemas

| Path | Module |
|------|--------|
| `@generacy-ai/agency/schemas/extension-comms` | schemas/extension-comms/ |
| `@generacy-ai/agency/schemas/github-app` | schemas/github-app/ |
| `@generacy-ai/agency/schemas/knowledge-store` | schemas/knowledge-store/ |
| `@generacy-ai/agency/schemas/learning-loop` | schemas/learning-loop/ |
| `@generacy-ai/agency/schemas/decision-model` | schemas/decision-model/ |
| `@generacy-ai/agency/schemas/attribution-metrics` | schemas/attribution-metrics/ |
| `@generacy-ai/agency/schemas/data-export` | schemas/data-export/ |
