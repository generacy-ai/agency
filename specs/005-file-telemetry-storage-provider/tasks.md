# Tasks: File Telemetry Storage Provider

**Input**: Design documents from `/specs/005-file-telemetry-storage-provider/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup & Types

- [x] T001 Create file provider module at `packages/agency/src/telemetry/providers/file.ts` with FileProviderOptions schema and type exports
- [x] T002 [P] Add RotationResult schema to `packages/agency/src/telemetry/providers/file.ts`
- [x] T003 Export FileStorageProvider from `packages/agency/src/telemetry/providers/index.ts`

## Phase 2: Core Implementation

- [x] T010 [US1] Implement FileStorageProvider class skeleton with constructor, name property, and option validation
- [x] T011 [US1] Implement `initialize()` method to create directory structure (daily mode: directory, session mode: directory + sessions/)
- [x] T012 [US1] Implement `shutdown()` method (no-op for now, placeholder for future handle cleanup)
- [x] T013 [US1] Implement `record(event)` method with JSONL append and best-effort error handling (warn, don't throw)
- [x] T014 [US1] Implement `getCurrentFilePath()` helper returning path based on mode (daily: YYYY-MM-DD.jsonl, session: sessions/{sessionId}.jsonl)

## Phase 3: Query Implementation

- [x] T020 [US1] Implement `readJsonlFile()` async generator for streaming file reads with corrupted line handling
- [x] T021 [US1] Implement `extractDateFromFilename()` helper to parse date from daily filenames
- [x] T022 [US1] Implement `getRelevantFiles()` to list and filter files by date range for daily mode
- [x] T023 [US1] Implement `query(filter)` method scanning relevant files and applying filters

## Phase 4: File Management

- [x] T030 [US3] Implement `getLogFiles()` method returning all .jsonl files in directory
- [x] T031 [US3] Implement `compressFile()` helper using zlib to gzip a file
- [x] T032 [US3] Implement `rotateOldLogs(maxAgeDays)` method with deletion and optional compression

## Phase 5: Session Mode

- [x] T040 [US2] Add session mode validation in constructor (require sessionId when mode="session")
- [x] T041 [US2] Update `getCurrentFilePath()` to handle session mode path generation
- [x] T042 [US2] Update `initialize()` to create sessions/ subdirectory when in session mode

## Phase 6: Integration & Export

- [x] T050 Export FileStorageProvider, FileProviderOptions, and RotationResult from telemetry index
- [x] T051 Add JSDoc comments to all public methods and interfaces

## Phase 7: Testing

- [x] T060 [P] Create test file `packages/agency/src/__tests__/telemetry/file-provider.test.ts`
- [x] T061 [P] Write unit tests for FileProviderOptions schema validation
- [x] T062 [P] Write unit tests for daily mode file path generation
- [x] T063 [P] Write unit tests for session mode file path generation
- [x] T064 Write integration tests for record() and query() round-trip
- [x] T065 Write unit tests for corrupted JSONL line handling (skip and continue)
- [x] T066 Write unit tests for rotateOldLogs() deletion behavior
- [x] T067 Write unit tests for rotateOldLogs() compression behavior
- [x] T068 Write unit tests for best-effort error handling (write failures logged, not thrown)

## Dependencies & Execution Order

### Sequential Dependencies

1. **T001 → T002 → T003**: Schema and export setup must complete first
2. **T010 → T011 → T012 → T013 → T014**: Core class implementation in order
3. **T020 → T021 → T022 → T023**: Query implementation builds on helpers
4. **T030 → T031 → T032**: File management builds on listing
5. **T040 → T041 → T042**: Session mode after core daily mode works
6. **T050 → T051**: Final export and documentation

### Parallel Opportunities

- **Phase 1**: T001 and T002 can run in parallel (both add schemas to same file)
- **Phase 7**: T060, T061, T062, T063 can run in parallel (independent test cases)
- **Phase 7**: T064-T068 must run after T060 (test file created)

### Cross-Phase Dependencies

- Phase 2-6 depend on Phase 1 completion
- Phase 7 can start after Phase 2 (T013, T014 for basic tests)
- T064 depends on T013 and T023 being complete
- T066, T067 depend on T032 being complete
