# Feature Specification: Prepare Repository for Public Visibility

Add the required code artifacts and perform pre-publication audits before making the agency repo public.

**Branch**: `298-prepare-repository-public` | **Date**: 2026-02-25 | **Status**: Draft

## Summary

The `generacy-ai/agency` monorepo is being prepared for public visibility on GitHub. This involves adding standard open-source community health files (LICENSE, SECURITY.md, CODEOWNERS) and auditing the full git history for accidentally committed secrets or credentials. The repository already uses MIT licensing consistently across all 9 packages; the root LICENSE file formalizes this at the repository level.

GitHub Settings configuration (branch protection, PR restrictions, interaction limits, Actions permissions) is explicitly out of scope and will be handled in a separate interactive session.

## User Stories

### US1: Open-Source License Clarity

**As a** potential contributor or user of the agency packages,
**I want** a clear LICENSE file at the repository root,
**So that** I understand the terms under which I can use, modify, and distribute the software.

**Acceptance Criteria**:
- [ ] MIT LICENSE file exists at `/LICENSE`
- [ ] License text includes the correct copyright holder (`Generacy AI`) and year
- [ ] License is consistent with the `"license": "MIT"` field already declared in all package.json files

### US2: Security Vulnerability Reporting

**As a** security researcher who discovers a vulnerability in the agency codebase,
**I want** a clearly documented security policy with reporting instructions,
**So that** I can responsibly disclose the vulnerability through the proper channels.

**Acceptance Criteria**:
- [ ] SECURITY.md exists at `/SECURITY.md`
- [ ] Document specifies supported versions or a support policy
- [ ] Document provides clear instructions for reporting vulnerabilities (e.g., private email or GitHub Security Advisories)
- [ ] Document sets expectations for response timeline
- [ ] Document explicitly states that public disclosure should be avoided until a fix is available

### US3: Code Ownership and Review Assignment

**As a** maintainer of the agency monorepo,
**I want** a CODEOWNERS file that maps directories to responsible owners,
**So that** pull requests are automatically assigned to the correct reviewers.

**Acceptance Criteria**:
- [ ] CODEOWNERS file exists at `/.github/CODEOWNERS`
- [ ] Root-level fallback owner is defined (e.g., `@generacy-ai/core`)
- [ ] Package directories are mapped to appropriate teams or individuals
- [ ] File follows GitHub CODEOWNERS syntax and is valid

### US4: Clean Git History

**As a** repository maintainer preparing for public visibility,
**I want** the full git history audited and scrubbed of any secrets,
**So that** no credentials, API keys, or sensitive data are exposed when the repo becomes public.

**Acceptance Criteria**:
- [ ] Full git history scanned using an automated secrets detection tool
- [ ] Any detected secrets are documented and remediated (rotated if live, scrubbed from history if needed)
- [ ] A final verification scan confirms no secrets remain in any commit
- [ ] Scan results or summary are recorded for audit trail

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Add MIT LICENSE file to repository root | P1 | Copyright holder: `Generacy AI`. Use standard MIT text. All 9 packages already declare `"license": "MIT"` in package.json. |
| FR-002 | Add SECURITY.md to repository root | P1 | Include: supported versions policy, reporting instructions (prefer GitHub Security Advisories or a security email), expected response timeline, responsible disclosure guidelines. |
| FR-003 | Create `.github/` directory | P1 | Directory does not currently exist. Required for CODEOWNERS. |
| FR-004 | Add `.github/CODEOWNERS` file | P1 | Define fallback owner for `*` (all files). Map each `packages/*` directory to the appropriate team. Use GitHub team handles from the `generacy-ai` org. |
| FR-005 | Audit git history for secrets using automated tooling | P1 | Use a tool such as `gitleaks`, `trufflehog`, or `git-secrets`. Scan all branches and all commits, not just the current HEAD. |
| FR-006 | Remediate any secrets found in git history | P1 | Rotate any live credentials found. Use `git filter-repo` or BFG Repo Cleaner to remove secrets from history if any are found. Document findings. |
| FR-007 | Run final verification scan after remediation | P1 | Confirm zero findings after any history rewriting. Record scan output for audit purposes. |
| FR-008 | Add `"license": "MIT"` to root `package.json` | P2 | Root package.json currently lacks a license field, though it is marked `"private": true`. Adding it ensures consistency. |

## Implementation Details

### FR-001: LICENSE File

Use the standard MIT License text. The copyright line should read:

```
Copyright (c) 2025-present Generacy AI
```

File location: `/LICENSE`

### FR-002: SECURITY.md

Structure:
1. **Security Policy** — Brief statement of commitment to security
2. **Supported Versions** — Table or statement about which versions receive security updates
3. **Reporting a Vulnerability** — Step-by-step instructions (GitHub Security Advisories preferred, with a fallback email)
4. **Response Process** — Expected acknowledgment timeline (e.g., 48 hours), fix timeline expectations
5. **Disclosure Policy** — Coordinated disclosure approach; request reporters avoid public disclosure until fix is available

### FR-003 / FR-004: CODEOWNERS

Suggested structure based on the repository's package layout:

```
# Default owners for everything in the repo
*                                        @generacy-ai/core

# Package-specific ownership
/packages/agency/                        @generacy-ai/core
/packages/agency-extension/              @generacy-ai/core
/packages/agency-plugin-docker/          @generacy-ai/core
/packages/agency-plugin-firebase/        @generacy-ai/core
/packages/agency-plugin-git/             @generacy-ai/core
/packages/agency-plugin-humancy/         @generacy-ai/core
/packages/agency-plugin-npm/             @generacy-ai/core
/packages/agency-plugin-spec-kit/        @generacy-ai/core
/packages/claude-plugin-agency-spec-kit/ @generacy-ai/core
```

Team handles should be confirmed with the org before implementation. If individual maintainers are preferred over teams, substitute accordingly.

### FR-005 / FR-006 / FR-007: Git History Audit

**Recommended tool**: `gitleaks` (widely used, actively maintained, supports custom rules)

**Process**:
1. Install `gitleaks` (available via brew, go install, or binary release)
2. Run full history scan: `gitleaks detect --source . --verbose --report-path gitleaks-report.json`
3. Review findings — distinguish between true positives and false positives
4. For true positives:
   - Immediately rotate any live credentials
   - Use `git filter-repo` to remove the secrets from history (preferred over BFG for modern repos)
   - Force-push cleaned history (coordinate with all contributors)
5. Re-run scan to verify clean history
6. Archive scan report (do NOT commit the report to the repo)

**Important considerations**:
- History rewriting changes all commit SHAs from the rewrite point forward
- All contributors must re-clone or rebase after a history rewrite
- Force-push to all affected branches is required
- If no secrets are found, document the clean scan result and skip remediation steps

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | LICENSE file present | File exists at repo root | `test -f LICENSE` |
| SC-002 | SECURITY.md present | File exists at repo root | `test -f SECURITY.md` |
| SC-003 | CODEOWNERS valid | File exists at `.github/CODEOWNERS` and follows GitHub syntax | GitHub renders ownership correctly on PR file views |
| SC-004 | Secrets scan clean | 0 true-positive findings across full git history | `gitleaks detect` exits with code 0 |
| SC-005 | License consistency | Root LICENSE matches all package.json `license` fields | All package.json files declare `"license": "MIT"` and root LICENSE is MIT |

## Assumptions

- The repository will be made public under the `generacy-ai` GitHub organization
- MIT is the correct license choice (consistent with all existing package.json declarations across all 9 packages)
- The `@generacy-ai/core` GitHub team exists (or will be created) for CODEOWNERS assignment
- The git history is likely clean given that `.gitignore` already excludes `.env` files, but a scan is still required for due diligence
- Contributors are aware that history rewriting (if needed) will require re-cloning
- GitHub Security Advisories is the preferred vulnerability reporting channel

## Out of Scope

- **GitHub Settings configuration** — branch protection rules, PR restrictions, interaction limits, and Actions permissions (handled in a separate interactive session)
- **README.md content** — the root README is currently empty but is not part of this issue
- **CONTRIBUTING.md** — contribution guidelines are not part of this issue
- **CODE_OF_CONDUCT.md** — community code of conduct is not part of this issue
- **CI/CD workflows** — GitHub Actions workflow files are not part of this issue
- **PR/issue templates** — GitHub templates for issues and pull requests are not part of this issue
- **npm publishing configuration** — package registry settings and access controls are separate concerns
- **Dependency vulnerability audit** — `pnpm audit` for supply chain security is a separate concern

## Task Checklist

- [ ] Add `LICENSE` (MIT) to repo root
- [ ] Add `SECURITY.md` to repo root
- [ ] Create `.github/` directory
- [ ] Add `.github/CODEOWNERS` with package ownership mappings
- [ ] Install and run `gitleaks` (or equivalent) against full git history
- [ ] Review and triage any findings
- [ ] Remediate findings if any (rotate credentials, scrub history)
- [ ] Run final verification scan
- [ ] Add `"license": "MIT"` to root `package.json`

---

*Generated by speckit*
