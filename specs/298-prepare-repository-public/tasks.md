# Tasks: Prepare Repository for Public Visibility

**Input**: Design documents from feature directory
**Prerequisites**: plan.md (required), spec.md (required)
**Status**: Ready

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Community Health Files

### T001 [P] Add LICENSE file
**File**: `LICENSE`
- Create MIT license file at repository root
- Use copyright line: `Copyright (c) 2026 The Generacy AI Authors`
- Use standard MIT license text from https://opensource.org/licenses/MIT
- Verify content matches what all 8 package.json files declare (`"license": "MIT"`)

### T002 [P] Add SECURITY.md
**File**: `SECURITY.md`
- Create security policy file at repository root
- Include "Reporting a Vulnerability" section with GitHub Security Advisories link (`https://github.com/generacy-ai/agency/security/advisories/new`) as primary channel
- Include fallback email: `security@generacy.ai`
- Include "Supported Versions" section (pre-1.0, latest version only)
- Include "Response Process" section (best-effort, no SLA)
- Include "Disclosure Policy" section (coordinated disclosure)

### T003 [P] Verify `@generacy-ai/core-team` GitHub team exists
**Command**: `gh api orgs/generacy-ai/teams/core-team --jq '.slug'`
- Run prerequisite check before creating CODEOWNERS
- If team does not exist, stop and flag to user — CODEOWNERS will silently fail without a valid team
- Document result for audit trail

### T004 Add .github/CODEOWNERS
**File**: `.github/CODEOWNERS`
**Depends on**: T003
- Create `.github/` directory (does not currently exist)
- Create CODEOWNERS file with `* @generacy-ai/core-team` default fallback rule
- Add explicit package-specific ownership rules for all 8 publishable packages:
  - `/packages/agency/`
  - `/packages/agency-extension/`
  - `/packages/agency-plugin-docker/`
  - `/packages/agency-plugin-firebase/`
  - `/packages/agency-plugin-git/`
  - `/packages/agency-plugin-humancy/`
  - `/packages/agency-plugin-npm/`
  - `/packages/agency-plugin-spec-kit/`
- Intentionally exclude `claude-plugin-agency-spec-kit` from explicit rules (covered by `*` fallback)

---

## Phase 2: Commit Community Health Files

### T005 Commit all community health files
**Files**:
- `LICENSE`
- `SECURITY.md`
- `.github/CODEOWNERS`
**Depends on**: T001, T002, T004
- Stage all three files
- Commit with message: `feat: add LICENSE, SECURITY.md, and .github/CODEOWNERS for public release`
- Single commit since all files serve the same logical purpose (public visibility preparation)

---

## Phase 3: Secrets Audit

### T006 Install gitleaks
**Depends on**: T005 (run after files are committed so the scan covers the full history)
- Download latest gitleaks pre-built Linux binary from GitHub releases
- Extract to `/tmp/gitleaks`
- Verify binary is executable and runs (`/tmp/gitleaks version`)

### T007 Run full git history secrets scan
**Depends on**: T006
- Execute gitleaks against the full repository history:
  ```
  /tmp/gitleaks detect --source /workspaces/agency --report-path /tmp/gitleaks-report.json --report-format json --verbose
  ```
- Capture exit code: `0` = no leaks, `1` = leaks found
- Save report to `/tmp/gitleaks-report.json`

### T008 Analyze and triage scan results
**Depends on**: T007
- If exit code 0 (no findings): record clean result, proceed to T009
- If findings exist, for each finding:
  - Determine if real secret or false positive
  - **False positives**: document rationale
  - **Real secrets**: stop and escalate — rotate/revoke credentials, notify team, plan history rewrite with `git filter-repo`, re-scan after remediation

### T009 Archive audit report to GitHub issue #298
**Depends on**: T008
- Post scan summary as a comment on GitHub issue #298 using `gh issue comment`
- Include: gitleaks version, scan date, total commits scanned, findings count, disposition of each finding (or "clean" if no findings)

---

## Phase 4: Verification & PR

### T010 Verify all acceptance criteria
**Depends on**: T005, T009
- [ ] `LICENSE` file present at repo root with MIT license text and correct copyright line
- [ ] `SECURITY.md` present at repo root with all four required sections
- [ ] `.github/CODEOWNERS` present with ownership mappings for all 8 publishable packages
- [ ] `@generacy-ai/core-team` GitHub team verified to exist (T003)
- [ ] Gitleaks scan completed against full git history with exit code 0
- [ ] Scan report archived in GitHub issue #298

### T011 Create pull request
**Depends on**: T010
- Push `298-prepare-repository-public` branch to remote
- Create PR from `298-prepare-repository-public` to `develop` using `gh pr create`
- PR title: `feat: prepare repository for public visibility`
- PR body should summarize: LICENSE added, SECURITY.md added, CODEOWNERS added, secrets audit clean
- Reference issue #298

---

## Dependencies & Execution Order

**Phase dependencies (sequential)**:
- Phase 1 must complete before Phase 2 (files must exist before committing)
- Phase 2 must complete before Phase 3 (commit files so secrets scan covers full history)
- Phase 3 must complete before Phase 4 (audit must pass before PR)

**Parallel opportunities within phases**:
- T001, T002, T003 can all run in parallel (independent files/checks, no dependencies)
- T004 depends on T003 (team verification prerequisite)

**Critical path**:
T001 + T002 + T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011

**Conditional path (if secrets found)**:
T008 → escalate → rotate credentials → `git filter-repo` → re-run T007 → T008 (re-triage) → T009
