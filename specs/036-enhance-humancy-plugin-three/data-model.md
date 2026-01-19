# Data Model: Three-Layer Decision Model

## Overview

This document defines the TypeScript interfaces and Zod schemas for the three-layer decision model enhancement to the humancy plugin.

## Core Entities

### Recommendation (Layer 1 & 2 Common)

```typescript
/**
 * Base recommendation from any layer
 */
interface Recommendation {
  /** ID of the recommended option */
  optionId: string;
  /** Confidence level 0-100 */
  confidence: number;
  /** Reasoning for the recommendation */
  reasoning: string[];
}
```

### ProtegeRecommendation (Layer 2)

```typescript
/**
 * Protégé recommendation with applied principles
 */
interface ProtegeRecommendation extends Recommendation {
  /** Principles from constitution that influenced this recommendation */
  appliedPrinciples: string[];
}
```

### HumanDecision (Layer 3)

```typescript
/**
 * Human's final decision with coaching metadata
 */
interface HumanDecision {
  /** ID of the option selected by human */
  optionId: string;
  /** Whether human agreed with protégé */
  matchedProtege: boolean;
  /** Coaching feedback if human disagreed with protégé */
  coaching: string | null;
}
```

### DecisionOption (Enhanced)

```typescript
/**
 * Enhanced decision option with tradeoffs
 */
interface DecisionOption {
  /** Unique identifier for selection */
  id: string;
  /** Display text */
  label: string;
  /** Optional explanation */
  description?: string;
  /** Optional tradeoff analysis */
  tradeoffs?: {
    pros: string[];
    cons: string[];
  };
}
```

### DecisionContext

```typescript
/**
 * Structured context for decision requests
 */
interface DecisionContext {
  /** Project-level constraints that may apply */
  projectConstraints?: string[];
  /** Related issue reference */
  relatedIssue?: string;
  /** Additional context fields */
  [key: string]: unknown;
}
```

### ThreeLayerBreakdown

```typescript
/**
 * Complete three-layer recommendation breakdown
 */
interface ThreeLayerBreakdown {
  baseline: Recommendation;
  protege: ProtegeRecommendation;
  human: HumanDecision;
}
```

### DecisionRecord

```typescript
/**
 * Complete decision record for storage and retrieval
 */
interface DecisionRecord {
  /** Unique decision identifier */
  decisionId: string;
  /** Original request details */
  request: {
    question: string;
    options: DecisionOption[];
    domain?: string[];
    context?: DecisionContext;
    timestamp: Date;
  };
  /** Three-layer breakdown (if requested) */
  threeLayer?: ThreeLayerBreakdown;
  /** Final selected option */
  selectedOption: string;
  /** When decision was made */
  decidedAt: Date;
  /** Outcome data (if reported) */
  outcome?: DecisionOutcome;
}
```

### DecisionOutcome

```typescript
/**
 * Outcome reported after decision implementation
 */
interface DecisionOutcome {
  /** Result of the decision */
  result: 'success' | 'failure' | 'mixed';
  /** Additional details about the outcome */
  details?: string;
  /** When outcome was reported */
  reportedAt: Date;
  /** Quality score for attribution (computed) */
  quality?: number;
}
```

## Zod Schemas

```typescript
import { z } from 'zod';

// Recommendation schema
export const recommendationSchema = z.object({
  optionId: z.string().min(1),
  confidence: z.number().min(0).max(100),
  reasoning: z.array(z.string()),
});

// Protégé recommendation schema
export const protegeRecommendationSchema = recommendationSchema.extend({
  appliedPrinciples: z.array(z.string()),
});

// Human decision schema
export const humanDecisionSchema = z.object({
  optionId: z.string().min(1),
  matchedProtege: z.boolean(),
  coaching: z.string().nullable(),
});

// Tradeoffs schema
export const tradeoffsSchema = z.object({
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});

// Enhanced decision option schema
export const decisionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  tradeoffs: tradeoffsSchema.optional(),
});

// Decision context schema
export const decisionContextSchema = z.object({
  projectConstraints: z.array(z.string()).optional(),
  relatedIssue: z.string().optional(),
}).passthrough(); // Allow additional fields

// Three-layer breakdown schema
export const threeLayerBreakdownSchema = z.object({
  baseline: recommendationSchema,
  protege: protegeRecommendationSchema,
  human: humanDecisionSchema,
});

// Decision outcome schema
export const decisionOutcomeSchema = z.object({
  result: z.enum(['success', 'failure', 'mixed']),
  details: z.string().optional(),
  reportedAt: z.date(),
  quality: z.number().min(0).max(100).optional(),
});

// Decision record schema
export const decisionRecordSchema = z.object({
  decisionId: z.string().uuid(),
  request: z.object({
    question: z.string(),
    options: z.array(decisionOptionSchema),
    domain: z.array(z.string()).optional(),
    context: decisionContextSchema.optional(),
    timestamp: z.date(),
  }),
  threeLayer: threeLayerBreakdownSchema.optional(),
  selectedOption: z.string(),
  decidedAt: z.date(),
  outcome: decisionOutcomeSchema.optional(),
});
```

## Entity Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                       DecisionRecord                             │
├─────────────────────────────────────────────────────────────────┤
│ decisionId: string (PK)                                          │
│ request.question: string                                         │
│ request.options: DecisionOption[]                                │
│ request.domain?: string[]                                        │
│ request.context?: DecisionContext                                │
│ selectedOption: string (FK to options.id)                        │
│ decidedAt: Date                                                  │
└─────────────────────────────────────────────────────────────────┘
           │ 0..1
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ThreeLayerBreakdown                           │
├─────────────────────────────────────────────────────────────────┤
│ baseline: Recommendation                                         │
│ protege: ProtegeRecommendation                                   │
│ human: HumanDecision                                             │
└─────────────────────────────────────────────────────────────────┘
           │ 0..1
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DecisionOutcome                              │
├─────────────────────────────────────────────────────────────────┤
│ result: 'success' | 'failure' | 'mixed'                          │
│ details?: string                                                 │
│ reportedAt: Date                                                 │
│ quality?: number (computed for attribution)                      │
└─────────────────────────────────────────────────────────────────┘
```

## Validation Rules

1. **DecisionOption.id**: Must be unique within a single request
2. **Recommendation.confidence**: Integer 0-100
3. **HumanDecision.optionId**: Must match one of the request options
4. **DecisionOutcome.result**: Must be one of: success, failure, mixed
5. **DecisionRecord.decisionId**: UUID v4 format

## Notes

- Schemas designed for alignment with generacy-ai/contracts#27 when ready
- All three-layer fields are optional for backward compatibility
- Decision storage is in-memory; consider persistence for production use
