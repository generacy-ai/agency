# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-18 03:58

### Q1: Package Manager Scope
**Context**: The spec mentions npm, yarn, pnpm detection. Bun is now a popular alternative with its own lockfile (bun.lockb). Supporting it adds value but also implementation scope.
**Question**: Should the plugin support Bun as a fourth package manager, or limit to npm/yarn/pnpm?
**Options**:
- A: Support Bun from the start (npm, yarn, pnpm, bun)
- B: Start with npm/yarn/pnpm, add Bun later

**Answer**: **B** - Start with npm/yarn/pnpm, add Bun later. The package is named `agency-plugin-npm` suggesting npm-ecosystem focus. Start lean, add Bun in a minor version when demand warrants.

### Q2: Working Directory
**Context**: Tools need to know where to execute commands. The implementation could assume the current working directory, or allow explicit directory specification for monorepo scenarios.
**Question**: Should all tools accept an optional `cwd` parameter to specify the working directory?
**Options**:
- A: Yes, accept optional cwd parameter on all tools
- B: No, always use current working directory

**Answer**: **A** - Yes, accept optional cwd parameter on all tools. Essential for monorepo support. The architecture explicitly uses pnpm workspaces and turborepo with `packages/` structure. Agents working across package boundaries need to specify target directories.

### Q3: Script Name Detection
**Context**: Projects use varying script names (e.g., 'build' vs 'compile', 'typecheck' vs 'check-types'). The plugin could auto-detect common variants or strictly use configured names.
**Question**: How should the plugin handle non-standard script names that aren't in package.json?
**Options**:
- A: Auto-detect common variants (build, compile, tsc, etc.)
- B: Fail with clear error if configured script not found
- C: Fall back to running the tool directly (npx tsc, etc.)

**Answer**: **B** - Fail with clear error if configured script not found. Aligns with the terse output pattern: "agents can't 'glaze over' irrelevant output like humans can." Auto-detecting variants could produce unexpected behavior. Explicit failure is better than implicit behavior that may not match intent.

### Q4: Error Recovery
**Context**: When a command fails (e.g., lint errors, test failures), the tool could just return the error or suggest recovery actions.
**Question**: Should tools provide actionable suggestions when commands fail (e.g., 'run npm install' after missing dependency)?
**Options**:
- A: Yes, include recovery suggestions where applicable
- B: No, just return the error output

**Answer**: **A** - Yes, include recovery suggestions where applicable. The terse output pattern specifies "minimal success, detailed failure." Recovery suggestions are part of the failure path where detail is expected. An agent benefits from actionable next steps rather than just raw error output.

### Q5: Monorepo Workspace Scope
**Context**: For monorepos, some operations should run at root level (install) while others might target specific packages (test). The plugin needs clear behavior.
**Question**: For monorepo projects, should tools support a `workspace` parameter to target specific packages?
**Options**:
- A: Yes, add optional workspace filter parameter
- B: No, always operate on entire project

**Answer**: **A** - Yes, add optional workspace filter parameter. Essential given the monorepo architecture. Combined with Q2's `cwd`, this provides: `cwd` for absolute directory targeting, `workspace` for named package targeting (e.g., `pnpm --filter @generacy-ai/agency test`).

