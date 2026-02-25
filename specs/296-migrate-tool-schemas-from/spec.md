# Feature Specification: Migrate Tool Schemas from Contracts Repo

**Branch**: `296-migrate-tool-schemas-from` | **Date**: 2026-02-25 | **Status**: Draft

## Summary

Migrate all tool-related schemas, platform schemas, telemetry event schemas, and JSON schema generation scripts from `@generacy-ai/contracts` into `@generacy-ai/agency`. Agency owns tool execution, so tool schemas belong here. This is a "move types to their proper home" migration — no active repo currently depends on `@generacy-ai/contracts`, making this a clean, non-breaking migration.

### Background

- Contracts repo contains ~1,152 exports across 209 TS files
- No active repo currently depends on `@generacy-ai/contracts` (humancy had a `file:` dep but is deferred)
- Agency already has placeholder directories with README files at `src/schemas/`, `src/tools/naming/`, and `src/telemetry/events/`
- Agency already has partial implementations: `ToolCallEventV1` in `telemetry/schemas.ts`, tool validation in `tools/validation.ts`, and standard prefixes in `tools/prefixes.ts`

### Migration Inventory

| Source (contracts) | Files | Tests | Target (agency) |
|---|---|---|---|
| `src/schemas/tool-naming/` | 7 TS | 4 | `src/tools/naming/` |
| `src/schemas/tool-result.ts` | 1 TS | 1 | `src/schemas/tool-result.ts` |
| `src/schemas/extension-comms/` | 10 TS (4 subdirs) | 8 | `src/schemas/extension-comms/` |
| `src/schemas/github-app/` | 4 TS | 3 | `src/schemas/github-app/` |
| `src/schemas/platform-api/` | 10 TS (3 subdirs) | 10 | `src/schemas/platform-api/` |
| `src/schemas/knowledge-store/` | 7 TS | 5 | `src/schemas/knowledge-store/` |
| `src/schemas/learning-loop/` | 7 TS | 5 | `src/schemas/learning-loop/` |
| `src/schemas/decision-model/` | 7 TS | 6 | `src/schemas/decision-model/` |
| `src/schemas/attribution-metrics/` | 10 TS | 8 | `src/schemas/attribution-metrics/` |
| `src/schemas/data-export/` | 7 TS | 5 | `src/schemas/data-export/` |
| `src/telemetry/` | 6 TS | 5 | `src/telemetry/events/` |
| `scripts/generate-*.ts` | 3 scripts | — | `scripts/` |
| **Totals** | **~79 source + 3 scripts** | **~60 tests** | |

---

## User Stories

### US1: Tool Schema Co-location

**As a** agency developer,
**I want** tool-related Zod schemas and types to live in the agency package,
**So that** I can import tool schemas directly without depending on an external contracts repo.

**Acceptance Criteria**:
- [ ] All tool-naming schemas (`ToolNameSchema`, `ToolPrefixSchema`, `parseToolName()`, `validateToolName()`) are available from `@generacy-ai/agency`
- [ ] `TerseToolResultSchema` is importable from agency
- [ ] No import references to `@generacy-ai/contracts` remain in agency

### US2: Platform and Domain Schema Access

**As a** developer building on the agency platform,
**I want** platform-api, github-app, extension-comms, and domain schemas available in agency,
**So that** I have a single package for all tool and platform type definitions.

**Acceptance Criteria**:
- [ ] Extension communication schemas (coaching, decision-queue, SSE, workflow) are in `src/schemas/extension-comms/`
- [ ] GitHub App schemas (permission scopes, webhooks, progressive permissions) are in `src/schemas/github-app/`
- [ ] Platform API schemas (auth, organization, subscription) are in `src/schemas/platform-api/`
- [ ] Domain schemas (knowledge-store, learning-loop, decision-model, attribution-metrics, data-export) are in their respective `src/schemas/` subdirectories
- [ ] All schemas have barrel exports and are re-exported from the package root

### US3: Telemetry Event Schema Migration

**As a** developer working on tool telemetry,
**I want** telemetry event schemas from contracts consolidated with agency's existing telemetry module,
**So that** telemetry types are co-located with the telemetry bus and interceptor.

**Acceptance Criteria**:
- [ ] Contracts telemetry schemas (`ToolCallEvent`, `AnonymousToolMetric`, `ToolStats`, `ErrorCategory`, `TimeWindow`) are merged into `src/telemetry/events/`
- [ ] Existing agency telemetry schemas (`ToolCallEventV1`, `TelemetryFilterSchema`, `ToolStatsSchema`) are reconciled — no duplicates, no breaking changes to current exports
- [ ] Telemetry barrel export includes all migrated schemas

### US4: JSON Schema Generation

**As a** developer maintaining tool interfaces,
**I want** JSON schema generation scripts to run from agency,
**So that** machine-readable schemas (`.schema.json` files) are generated from the Zod source of truth in this repo.

**Acceptance Criteria**:
- [ ] Generation scripts are migrated to `scripts/` in the agency package
- [ ] `pnpm generate:schemas` (or equivalent) produces all JSON schema files in `src/schemas/generated/`
- [ ] Generated schemas include: tool-result, telemetry events, and tool-naming schemas
- [ ] Generation is documented and can be run as part of the build pipeline

### US5: Test Coverage Preservation

**As a** developer maintaining migrated schemas,
**I want** all tests from contracts to pass in agency,
**So that** the migration doesn't introduce regressions.

**Acceptance Criteria**:
- [ ] All ~60 migrated test files pass under vitest in agency
- [ ] Tests are adapted to agency's vitest conventions (inline `.test.ts` files, explicit imports, no globals)
- [ ] Tests that used contracts-specific `__tests__/` directory pattern are restructured to use co-located `.test.ts` files

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Migrate `tool-naming/` schemas to `src/tools/naming/` with Zod schemas for prefix, action, tool-name, tool-definition, validation-error, and tool-catalog | P1 | Reconcile with existing `tools/validation.ts` and `tools/prefixes.ts` — avoid duplication |
| FR-002 | Migrate `tool-result.ts` (`TerseToolResultSchema`) to `src/schemas/tool-result.ts` | P1 | Reconcile with existing `TerseToolResult` type in `output/types.ts` |
| FR-003 | Migrate `extension-comms/` schemas (coaching, decision-queue, SSE, workflow subdirs) to `src/schemas/extension-comms/` | P1 | 4 subdirectories, 10 source files, 8 tests |
| FR-004 | Migrate `github-app/` schemas to `src/schemas/github-app/` | P1 | Permission scopes, progressive permissions, webhooks |
| FR-005 | Migrate `platform-api/` schemas (auth, organization, subscription subdirs) to `src/schemas/platform-api/` | P1 | 3 subdirectories, 10 source files, 10 tests |
| FR-006 | Migrate `knowledge-store/` schemas to `src/schemas/knowledge-store/` | P2 | Domain schemas — 7 files, 5 tests |
| FR-007 | Migrate `learning-loop/` schemas to `src/schemas/learning-loop/` | P2 | Domain schemas — 7 files, 5 tests |
| FR-008 | Migrate `decision-model/` schemas to `src/schemas/decision-model/` | P2 | Domain schemas — 7 files, 6 tests |
| FR-009 | Migrate `attribution-metrics/` schemas to `src/schemas/attribution-metrics/` | P2 | Domain schemas — 10 files, 8 tests |
| FR-010 | Migrate `data-export/` schemas to `src/schemas/data-export/` | P2 | Domain schemas — 7 files, 5 tests |
| FR-011 | Migrate telemetry event schemas to `src/telemetry/events/` | P1 | Reconcile with existing `telemetry/schemas.ts` — merge or extend, preserve current exports |
| FR-012 | Migrate 3 JSON schema generation scripts to `scripts/` | P1 | `generate-tool-result-schema.ts`, `generate-json-schemas.ts`, `generate-tool-naming-schemas.ts` |
| FR-013 | Add `zod-to-json-schema` dependency | P1 | Required for generation scripts; contracts used ^3.23.5 |
| FR-014 | Add `ulid` dependency | P1 | Required for telemetry event ID generation |
| FR-015 | Create barrel exports (`index.ts`) for each migrated schema directory | P1 | Follow agency's existing barrel export conventions |
| FR-016 | Update root `src/index.ts` to re-export migrated schemas | P1 | Selective re-export of public types |
| FR-017 | Adapt all test files from `__tests__/` pattern to co-located `.test.ts` pattern | P1 | Agency uses `src/**/*.test.ts` vitest pattern |
| FR-018 | Add `generate:schemas` script to `package.json` | P2 | For on-demand and CI schema regeneration |
| FR-019 | Output generated JSON schemas to `src/schemas/generated/` | P2 | Replace placeholder README with actual generated files |

---

## Implementation Plan

### Phase 1: Core Tool Schemas (P1)

1. **Tool naming** — Migrate `tool-naming/` schemas into `src/tools/naming/`. Reconcile with existing `validation.ts` and `prefixes.ts` to eliminate duplication. The contracts schemas are the richer version with Zod validation; agency's existing validation logic should be subsumed or wrapped.

2. **Tool result** — Migrate `tool-result.ts` into `src/schemas/tool-result.ts`. Reconcile with the existing `TerseToolResult` type in `output/types.ts` — the contracts version uses Zod with `.passthrough()`, which is the canonical form.

3. **Telemetry events** — Migrate contracts telemetry schemas into `src/telemetry/events/`. Reconcile with existing `telemetry/schemas.ts` — contracts has `ToolCallEvent`, `AnonymousToolMetric`, `ToolStats`, `ErrorCategory`, `TimeWindow`; agency already has `ToolCallEventV1`, `TelemetryFilterSchema`, `ToolStatsSchema`. Merge without breaking existing exports.

### Phase 2: Platform and Extension Schemas (P1)

4. **Extension comms** — Migrate all 4 subdirectories to `src/schemas/extension-comms/`
5. **GitHub App** — Migrate to `src/schemas/github-app/`
6. **Platform API** — Migrate all 3 subdirectories to `src/schemas/platform-api/`

### Phase 3: Domain Schemas (P2)

7. **Knowledge store, learning loop, decision model, attribution metrics, data export** — Migrate each to its own subdirectory under `src/schemas/`

### Phase 4: Generation Scripts and Exports (P1–P2)

8. **Dependencies** — Add `zod-to-json-schema` and `ulid` to `package.json`
9. **Generation scripts** — Migrate scripts to `scripts/`, update import paths
10. **Barrel exports** — Create `index.ts` files, update root exports
11. **Package script** — Add `generate:schemas` to `package.json`

### Reconciliation Notes

The following existing agency code overlaps with contracts schemas and must be reconciled:

| Agency File | Contracts Source | Resolution |
|---|---|---|
| `tools/validation.ts` (validateToolName) | `schemas/tool-naming/tool-name.ts` | Replace agency validation with Zod-based contracts version; preserve the `validateToolName()` export signature or re-export from naming module |
| `tools/prefixes.ts` (STANDARD_PREFIXES) | `schemas/tool-naming/prefix.ts` | Contracts defines 10 prefixes vs agency's 7. Use contracts as canonical source; agency's `STANDARD_PREFIXES` becomes a re-export |
| `output/types.ts` (TerseToolResult) | `schemas/tool-result.ts` | Contracts uses Zod schema; agency uses plain TS type. Adopt Zod schema, derive type with `z.infer<>`, keep backward-compatible export |
| `telemetry/schemas.ts` (ToolCallEventV1) | `telemetry/tool-call-event.ts` | Merge — keep agency's V1 as current version, import contracts' richer fields if applicable |

---

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Migrated test pass rate | 100% | `pnpm test` — all ~60 migrated tests pass |
| SC-002 | Existing test pass rate | 100% | `pnpm test` — no regressions in agency's existing ~32 test files |
| SC-003 | Schema generation | All JSON schemas generated | `pnpm generate:schemas` produces expected files in `src/schemas/generated/` |
| SC-004 | Zero contracts imports | 0 references | `grep -r "@generacy-ai/contracts" src/` returns no results |
| SC-005 | Export completeness | All public schemas exported | Every migrated Zod schema and its inferred type is re-exported from `src/index.ts` |
| SC-006 | TypeScript build | Clean compilation | `pnpm build` succeeds with zero errors |
| SC-007 | No duplicate definitions | 0 duplicates | Each concept (tool prefix, tool result, tool call event) has exactly one canonical definition |

---

## Assumptions

- The contracts repo at `/workspaces/contracts/` is the canonical source and is accessible during migration
- No active repo depends on `@generacy-ai/contracts` — migration is non-breaking for downstream consumers
- Agency's existing Zod dependency (^3.24.1) is compatible with contracts' schemas (written against ^3.23.8)
- Contracts' test files use standard vitest patterns that are portable with minimal adaptation
- The `ulid` package used in contracts for telemetry event IDs has no native dependencies and is safe to add
- Existing agency exports (`ToolCallEventV1`, `TerseToolResult`, `validateToolName`, `STANDARD_PREFIXES`) must remain backward-compatible — types can be enriched but not narrowed
- Generated JSON schema files (`.schema.json`) are not committed to git — they are regenerated on demand

---

## Out of Scope

- **Shared/cross-component types migration** — Latency has a separate issue for types that aren't tool-specific
- **Deprecation or removal of the contracts repo** — This migration copies types into agency; contracts repo cleanup is a separate concern
- **Live dependency swap** — No consumer currently imports from contracts, so no import rewriting in external repos is needed
- **Runtime behavior changes** — This is a type/schema migration only; no tool execution logic changes
- **New schema design** — Schemas are migrated as-is from contracts; redesign or consolidation of domain schemas is out of scope
- **Package export path changes** — Agency's existing export map (`.` and `./cli`) is not modified; migrated schemas are added to the main export
- **CI/CD pipeline changes** — Schema generation integration into CI is recommended but not required for this feature

---

*Generated by speckit*
