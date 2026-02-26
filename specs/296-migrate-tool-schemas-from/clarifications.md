# Clarification Questions

## Status: Resolved

## Questions

### Q1: Telemetry Event ID Format — ULID vs UUID
**Context**: Agency's existing `ToolCallEventV1` uses UUID v4 for event IDs (`z.string().uuid()`), while contracts uses ULID (`ulid()` from the `ulid` package) with a specific 26-char Crockford Base32 regex. Switching from UUID to ULID is a semantic change — any code that validates or stores event IDs against a UUID pattern will break. The spec says "preserve current exports" and "no breaking changes" but also says contracts is the canonical source.
**Question**: Should migrated telemetry events use ULID (contracts format) or UUID (current agency format) for event IDs?
**Options**:
- A) Keep UUID for ToolCallEventV1, add ULID-based ToolCallEventV2 alongside: Fully backward-compatible, but adds a second event schema. Both coexist until V1 is deprecated.
- B) Switch to ULID, update ToolCallEventV1 in-place: Contracts is canonical, ULID is superior (sortable, embeds timestamp). Existing tests/consumers that expect UUID format will need updating.
- C) Accept both formats: Make the `id` field accept either UUID or ULID via `z.union()`. Pragmatic but muddies the schema.
**Answer**: **B) Switch to ULID, update ToolCallEventV1 in-place.** No active repo depends on contracts or consumes agency's telemetry externally. ULID is strictly superior (sortable, embeds timestamp). Since agency is the sole producer/consumer, the "breaking change" concern is moot — just update agency's own code. No need for a V2 schema or a loose union.

### Q2: validateToolName() Return Type Incompatibility
**Context**: Agency's current `validateToolName()` returns `{ valid: boolean, errors: string[], warnings: string[] }` (a `ValidationResult`). Contracts' `validateToolName()` returns `ToolValidationError | undefined` with structured error codes (`INVALID_PREFIX`, `INVALID_ACTION_NAME`, etc.). These are fundamentally different signatures. The spec says to "preserve the `validateToolName()` export signature or re-export from naming module" but also says contracts' Zod-based version should subsume agency's validation logic.
**Question**: How should the `validateToolName()` export signature be reconciled?
**Options**:
- A) Keep agency's signature, implement using contracts' Zod schemas internally: The public API stays the same (`ValidationResult`), but the implementation uses contracts' richer validation under the hood. Contracts' `validateToolNameWithResult()` is also exported separately.
- B) Switch to contracts' signature, add adapter for old callers: Export contracts' version as canonical `validateToolName()`. Provide a `validateToolNameLegacy()` or adapter function for existing callers.
- C) Export both under different names: Agency's version stays as `validateToolName()`, contracts' version exported as `validateToolNameStrict()` or via the `naming` submodule.
**Answer**: **A) Keep agency's signature, implement using contracts' Zod schemas internally.** Agency has 100+ assertions in `validation.test.ts` testing the current `ValidationResult` return type. The public API is solid. Replacing the implementation with contracts' Zod schemas under the hood gives richer validation without breaking existing callers. Export contracts' structured version separately if needed.

### Q3: TerseToolResult — Zod Schema vs Plain Type Coexistence
**Context**: Agency currently exports `TerseToolResult` as a plain TypeScript interface from `output/types.ts`. Contracts exports `TerseToolResultSchema` (Zod) with `TerseToolResult` as `z.infer<typeof TerseToolResultSchema>`. The Zod version includes `.passthrough()` (allows extra properties), while the plain interface does not. The spec says "Adopt Zod schema, derive type with `z.infer<>`, keep backward-compatible export" — but `z.infer` with `.passthrough()` produces `objectOutputType` which has different structural typing than the current interface.
**Question**: Where should the canonical `TerseToolResultSchema` live, and how should the existing `TerseToolResult` type in `output/types.ts` relate to it?
**Options**:
- A) Schema in `src/schemas/tool-result.ts`, type in `output/types.ts` re-exported from schema: The Zod schema is the source of truth. `output/types.ts` imports and re-exports `TerseToolResult` from the schema file. Existing imports from `output/` still work.
- B) Move everything to `src/schemas/tool-result.ts`, update `output/types.ts` to re-export: Same as A but explicitly deprecate the `output/types.ts` location for this type.
- C) Keep both independently: Schema in `schemas/`, plain interface in `output/types.ts`. Risk of drift but zero breakage.
**Answer**: **A) Schema in `src/schemas/tool-result.ts`, type re-exported from `output/types.ts`.** Zod schema becomes the source of truth. The existing `output/types.ts` import path keeps working via re-export. Clean progression without breakage.

### Q4: Prefix Count Mismatch — 7 vs 9 Prefixes
**Context**: Agency's `STANDARD_PREFIXES` defines 7 prefixes (source_control, build, run, test, humancy, debug, docs). Contracts defines 9 prefixes (source_control, build, run, test, debug, deploy, humancy, file, database) — it adds `deploy`, `file`, `database` but omits `docs`. The spec says "agency's `STANDARD_PREFIXES` becomes a re-export" from contracts, but this changes the set of valid prefixes. Any code that registers tools with a `docs` prefix would fail validation with contracts' schema.
**Question**: How should the prefix sets be reconciled?
**Options**:
- A) Use contracts' 9 prefixes plus add `docs` from agency (10 total): Union of both sets. No existing prefix becomes invalid. Contracts' `ToolPrefixSchema` Zod enum needs to be extended.
- B) Use contracts' 9 prefixes, drop `docs`: Contracts is canonical. Audit agency for any `docs`-prefixed tools and migrate them to another prefix (e.g., `file`).
- C) Use contracts' 9 prefixes, keep `docs` as a deprecated alias: Add `docs` to the enum but mark it deprecated in documentation/comments for future removal.
**Answer**: **A) Union of both sets (10 total).** Agency actively uses `docs` in `prefixes.ts`. Dropping it would break existing tools. Adding contracts' `deploy`, `file`, `database` expands capability. Straightforward merge.

### Q5: Telemetry Schema Field Name Differences
**Context**: Agency's `ToolCallEventV1` uses `toolName` and `serverName` as field names. Contracts' `ToolCallEvent` uses `tool` and `server`. These are not just additions — they are renames of the same concept. The spec mentions merging but doesn't specify which field names win. Since agency has existing telemetry producers and consumers that use `toolName`/`serverName`, changing these fields breaks runtime serialization/deserialization.
**Question**: Which field naming convention should the merged telemetry schema use?
**Options**:
- A) Keep agency's names (`toolName`, `serverName`), add contracts' extra fields: Existing telemetry pipeline is undisturbed. Contracts' additional fields (`errorCategory`, `workflowId`, `phase`, etc.) are added as optional.
- B) Use contracts' names (`tool`, `server`), migrate agency's producers: Contracts is canonical. Update all agency code that emits/reads telemetry events to use new names.
- C) Support both via Zod transform: Accept either `tool`/`toolName` and `server`/`serverName` with a Zod `.transform()` that normalizes to one canonical form.
**Answer**: **A) Keep agency's names (`toolName`, `serverName`), add contracts' extra fields.** Agency is the active codebase with real producers and consumers. Contracts has zero active consumers. Keep the field names that are actually in use. Add contracts' extra fields (`errorCategory`, `workflowId`, `phase`, etc.) as optional extensions.

### Q6: ToolCallEventV1 `inputs` — Required vs Optional
**Context**: Agency's `ToolCallEventV1` has `inputs` as optional (`z.record(z.unknown()).optional()`). Contracts' `ToolCallEvent` has `inputs` as required (`z.record(z.unknown())`). Making a previously optional field required is a breaking change — existing telemetry events that omit `inputs` would fail validation against the merged schema.
**Question**: Should `inputs` be required or optional in the merged telemetry event schema?
**Options**:
- A) Keep optional (agency's convention): Backward-compatible. Contracts' test expectations for required `inputs` are relaxed.
- B) Make required (contracts' convention): More strict, ensures all events carry input data for debugging. Existing agency producers must be updated to always provide `inputs` (even if `{}`).
**Answer**: **A) Keep optional (agency's convention).** Agency's existing telemetry producers may omit `inputs`. Making it required gains nothing (no external consumer demands it) and risks breaking existing event emission. Keep it optional.

### Q7: Generated JSON Schema Output Location and Git Tracking
**Context**: The spec says generated JSON schemas go to `src/schemas/generated/` and the assumptions state they are "not committed to git — they are regenerated on demand." However, contracts currently has a package.json export for `./schemas/tool-result.json` pointing to a generated file, and consumers might rely on the JSON schema files being present in the published package. If they're not committed, they must be generated before `pnpm build` or `pnpm publish`.
**Question**: Should generated `.schema.json` files be committed to git or generated as build artifacts?
**Options**:
- A) Not committed, generated before publish: Add `generate:schemas` to the `prepublishOnly` script chain. `.gitignore` the `generated/` directory. CI must run generation before tests that depend on schema files.
- B) Committed to git, regenerated via script: Generated files are checked in and validated in CI (diff check). Easier for consumers but adds generated files to the repo.
- C) Not committed, not published: Generated only on-demand for local use. Not part of the package distribution.
**Answer**: **A) Not committed, generated before publish.** Standard practice. `.gitignore` the `generated/` directory, add `generate:schemas` to the `prepublishOnly` script chain. CI generates before running tests that depend on schema files.

### Q8: Contracts' ToolStats vs Agency's ToolStatsSchema — Field Divergence
**Context**: Agency's `ToolStatsSchema` includes fields not in contracts (`successCount`, `errorCount`, `minDurationMs`, `maxDurationMs`, `p99DurationMs`). Contracts' `ToolStats` includes fields not in agency (`version`, `server`, `tool`, `timeWindow`, `successRate`, `errorBreakdown`). These are two different designs for the same concept. The spec doesn't provide specific reconciliation guidance for ToolStats beyond the telemetry merge directive.
**Question**: How should the two ToolStats schemas be reconciled?
**Options**:
- A) Union of all fields, non-shared fields optional: Merge both schemas into one, keeping all fields. Fields unique to either source become optional. Maximally compatible but creates a loose schema.
- B) Agency's schema is canonical for runtime stats, contracts' schema is canonical for API stats: Keep them as separate schemas for different use cases — `ToolStatsSchema` (agency, runtime aggregation) and `ToolStatsApiSchema` (contracts, API response format).
- C) Adopt contracts' schema, extend with agency's extra fields: Use contracts as the base and add agency's `p99DurationMs`, `successCount`, `errorCount`, `minDurationMs`, `maxDurationMs` as optional extensions.
**Answer**: **B) Separate schemas for different use cases.** These are genuinely different designs for different contexts. Agency's `ToolStatsSchema` is for runtime aggregation (counts, percentiles, min/max). Contracts' version is for API responses (rates, breakdowns, time windows). Keep them as `ToolStatsSchema` (runtime) and `ToolStatsApiSchema` (API). Merging them into one loose schema would make neither useful.

### Q9: Scope of "No Active Repo Depends on Contracts"
**Context**: The spec states "No active repo currently depends on `@generacy-ai/contracts`" and notes humancy had a `file:` dep but is deferred. However, if humancy or any other repo is later un-deferred, it would need to switch from contracts imports to agency imports. The spec explicitly puts "live dependency swap" out of scope, but doesn't clarify whether the migrated schemas should maintain identical export names/paths so that a future swap is a simple find-replace of the package name.
**Question**: Should migrated schema export names exactly match contracts' export names to facilitate future consumer migration?
**Options**:
- A) Yes, match contracts' export names exactly: Every schema, type, and function exported from contracts is exported with the same name from agency. Future consumers just change `@generacy-ai/contracts` to `@generacy-ai/agency` in imports.
- B) No, use agency's conventions where they differ: Agency's existing naming conventions take precedence (e.g., `toolName` vs `tool`). A migration guide documents the mapping for future consumers.
**Answer**: **B) Use agency's conventions where they differ.** Agency is the living codebase; contracts is being archived. Contorting agency's naming to match a dead repo is backwards. A brief migration guide documenting the mapping (e.g., `tool` -> `toolName`) is sufficient for the hypothetical future where humancy un-defers.

### Q10: Test File Restructuring — What Happens to Agency's Existing Validation Tests?
**Context**: Agency has an existing `src/tools/validation.test.ts` (8KB, 100+ assertions) that tests the current `validateToolName()` implementation. Contracts has `__tests__/validation.test.ts` (363 lines) testing its own version. If the validation implementation is replaced/reconciled, which test suite survives? Running both would test conflicting expectations if the signatures differ.
**Question**: How should overlapping test files be handled when both agency and contracts have tests for the same concept?
**Options**:
- A) Merge tests: Combine assertions from both test files into a single co-located test file. Remove duplicates, resolve conflicts by testing the reconciled implementation.
- B) Agency tests are canonical, supplement with contracts tests: Keep agency's existing tests as-is (they test the public API). Add contracts' tests only for newly migrated functionality not covered by agency's tests.
- C) Contracts tests replace agency tests: Since contracts' schemas are the canonical source, contracts' tests become the canonical test suite. Agency's old tests are removed.
**Answer**: **A) Merge tests.** Combine assertions from both into a single test file that tests the reconciled implementation. Remove duplicates, resolve conflicts against the new behavior. Best of both worlds.

### Q11: Extension Comms, GitHub App, and Platform API — Import Path Expectations
**Context**: The spec places extension-comms, github-app, and platform-api schemas under `src/schemas/` in agency. These are not tool schemas — they're platform and integration schemas. The spec adds them all to the main `.` export but doesn't discuss whether they should have their own subpath exports (e.g., `@generacy-ai/agency/schemas/platform-api`). Agency currently only has `.` and `./cli` as export paths. Adding many platform schemas to the root export increases the public API surface significantly.
**Question**: Should platform and domain schemas be exported from the package root, from subpath exports, or both?
**Options**:
- A) Root export only (as spec states): All schemas re-exported from `src/index.ts` via barrel files. Simple, matches spec. Consumers use `import { AuthSchema } from '@generacy-ai/agency'`.
- B) Add subpath exports for schema categories: Add exports like `./schemas/platform-api`, `./schemas/extension-comms` to `package.json`. Keeps the root export clean while providing organized access.
- C) Root export for P1 schemas, subpath exports for P2 domain schemas: Tool schemas, telemetry, and platform schemas in root. Domain schemas (knowledge-store, learning-loop, etc.) only via subpath exports to avoid bloating the main export.
**Answer**: **C) Root for P1 schemas, subpath for P2 domain schemas.** Tool schemas, telemetry, and platform schemas go in the root export (they're core to agency's purpose). Domain schemas (knowledge-store, learning-loop, decision-model, etc.) get subpath exports like `@generacy-ai/agency/schemas/knowledge-store`. Avoids bloating the root API surface while keeping everything accessible. Adding a few organized subpaths is a clean extension of the current `.` and `./cli` exports.

### Q12: Vitest Version Compatibility
**Context**: Agency uses vitest `^3.2.4` while contracts uses vitest `^4.0.18`. Migrated test files were written and validated against vitest 4.x. While vitest generally maintains backward compatibility, there could be subtle API differences (e.g., matcher behavior, mock APIs, configuration options) between major versions. The spec assumes tests are "portable with minimal adaptation" but doesn't address the major version gap.
**Question**: Should agency upgrade to vitest 4.x as part of this migration, or should migrated tests be adapted to work with vitest 3.x?
**Options**:
- A) Upgrade agency to vitest ^4.0.18: Ensures full compatibility with migrated tests. May require updating agency's existing 32 test files if there are breaking changes.
- B) Keep vitest ^3.2.4, adapt migrated tests if needed: Lower risk to existing tests. Only adjust migrated tests if they use vitest 4.x-specific features.
**Answer**: **B) Keep vitest ^3.2.4, adapt migrated tests.** The entire monorepo is standardized on 3.x. Upgrading to vitest 4.x across 32+ existing test files is out of scope for a schema migration. Adapt the handful of migrated contract tests if they use 4.x-specific features — this is lower risk.
