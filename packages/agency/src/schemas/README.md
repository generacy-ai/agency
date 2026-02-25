# Generated Tool Schemas

This directory contains generated JSON schemas for tool validation and documentation.

## Purpose

Generated schemas provide:
- Machine-readable tool interface definitions
- JSON Schema format for validation and documentation
- Export format for external tool consumers
- Schema versioning and compatibility tracking

## Migrated from @generacy-ai/contracts

This module was migrated from `@generacy-ai/contracts/generated/` as part of the contracts retirement effort (Issue 246-1-9).

## Contents

This directory will contain generated JSON schema files, such as:
- `tool-result.schema.json` - Schema for tool result structures
- Additional generated schemas for tool interfaces

## Generation

Schemas in this directory are generated from Zod schemas using `zod-to-json-schema`. The generation process should be automated as part of the build pipeline.

## Usage

```typescript
import toolResultSchema from './schemas/tool-result.schema.json';

// Use for validation
import Ajv from 'ajv';
const ajv = new Ajv();
const validate = ajv.compile(toolResultSchema);

const isValid = validate(toolResult);
```

## Integration

Generated schemas complement the runtime Zod validation in `../output/` by providing JSON Schema format for:
- API documentation generation
- External tool integration
- Schema registries and catalogs
