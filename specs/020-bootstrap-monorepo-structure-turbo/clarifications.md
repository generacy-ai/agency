# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-17 20:49

### Q1: @generacy-ai/contracts Dependency
**Context**: The spec lists @generacy-ai/contracts as a peer dependency, but this package doesn't exist in the generacy organization yet. This blocks the acceptance criteria item.
**Question**: Should we skip adding @generacy-ai/contracts for now and add it later when the package exists, or create a placeholder/stub package?
**Options**:
- A: Skip for now - add dependency later when contracts package exists
- B: Create placeholder package.json entry with 'workspace:*' that will resolve later
- C: Create a minimal contracts stub package in this repo temporarily

**Answer**: **A** - Skip for now, add dependency later when contracts package exists. Per the architecture docs, `@generacy-ai/contracts` is defined as a separate repository (`generacy-ai/contracts`), not part of the Agency monorepo.

### Q2: Plugin Package Contents
**Context**: The spec says plugin scaffolds should be 'empty, ready for implementation'. This could mean just package.json or include src/index.ts stub files.
**Question**: What should each plugin package scaffold contain?
**Options**:
- A: Minimal: package.json + tsconfig.json only
- B: Standard: package.json + tsconfig.json + src/index.ts (empty export)
- C: Full: Above plus basic test file and README

**Answer**: **B** - Standard: package.json + tsconfig.json + src/index.ts (empty export). This ensures `pnpm build` succeeds across all packages and meets the acceptance criteria "All packages build successfully (even if empty)" while keeping scaffolds minimal.

### Q3: CI Workflow Triggers
**Context**: The spec requires a CI workflow for build/test/lint but doesn't specify when it should run. This affects developer experience and resource usage.
**Question**: When should the GitHub Actions CI workflow trigger?
**Options**:
- A: On push to main/develop and all PRs
- B: On all pushes and PRs
- C: Only on PRs targeting main/develop

**Answer**: **A** - On push to main/develop and all PRs. Standard pattern for open-source projects. Validates protected branches immediately, provides PR feedback, avoids wasting CI minutes on every WIP push to feature branches.

### Q4: Node.js Version Support
**Context**: The spec mentions Node.js 20+ but doesn't specify if we should support multiple versions or pin to a specific version.
**Question**: What Node.js version strategy should we use?
**Options**:
- A: Pin to Node.js 20 LTS only (simpler CI)
- B: Support Node.js 20 and 22 (matrix build in CI)
- C: Support Node.js 20+ with engines field, CI tests only latest LTS

**Answer**: **C** - Support Node.js 20+ with engines field, CI tests only latest LTS. Pragmatic for a new project with no existing users. Declare intent via `"engines": { "node": ">=20" }`, keep CI simple with latest LTS only.

