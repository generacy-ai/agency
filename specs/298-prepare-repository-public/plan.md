# Implementation Plan: Prepare Repository for Public Visibility

## Summary

Add the required community health files (LICENSE, SECURITY.md, .github/CODEOWNERS) and perform a git history secrets audit before making the `generacy-ai/agency` repository public. All work is done on the `298-prepare-repository-public` feature branch and merged via PR to `develop`.

## Technical Context

- **Repository**: `https://github.com/generacy-ai/agency.git`
- **Type**: pnpm monorepo with 8 publishable packages + 1 non-standard package
- **Runtime**: Node.js >=20, pnpm 9.15.4, Turborepo
- **Branch**: `298-prepare-repository-public` (merges to `develop`)
- **License consistency**: All 8 publishable packages already declare `"license": "MIT"` in their package.json files
- **Current state**: No LICENSE, SECURITY.md, .github/CODEOWNERS, or secrets scanning config exists

## Architecture Overview

This feature involves no application code changes. It adds three static files and performs an audit:

```
agency/                          (repo root)
├── LICENSE                      ← NEW: MIT license text
├── SECURITY.md                  ← NEW: Security policy
├── .github/
│   └── CODEOWNERS               ← NEW: PR review ownership
└── packages/
    ├── agency/                   (mapped in CODEOWNERS)
    ├── agency-extension/         (mapped in CODEOWNERS)
    ├── agency-plugin-docker/     (mapped in CODEOWNERS)
    ├── agency-plugin-firebase/   (mapped in CODEOWNERS)
    ├── agency-plugin-git/        (mapped in CODEOWNERS)
    ├── agency-plugin-humancy/    (mapped in CODEOWNERS)
    ├── agency-plugin-npm/        (mapped in CODEOWNERS)
    ├── agency-plugin-spec-kit/   (mapped in CODEOWNERS)
    └── claude-plugin-agency-spec-kit/  (covered by * fallback only)
```

## Implementation Phases

### Phase 1: Add LICENSE file

**File**: `/LICENSE`

Create an MIT license file at the repository root.

**Content specifications** (from clarifications Q1):
- License type: MIT (consistent with all package.json declarations)
- Copyright line: `Copyright (c) 2026 The Generacy AI Authors`
- Use the standard MIT license text from https://opensource.org/licenses/MIT

**File content**:
```
MIT License

Copyright (c) 2026 The Generacy AI Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Verification**: File exists at repo root, contains correct copyright line and MIT text.

---

### Phase 2: Add SECURITY.md

**File**: `/SECURITY.md`

Create a security policy file at the repository root.

**Content specifications** (from clarifications Q2-Q4):
- **Reporting channel**: GitHub Security Advisories (primary), security@generacy.ai (fallback)
- **Response timeline**: Best-effort — "as soon as possible" (no SLA commitments)
- **Supported versions**: General statement — pre-1.0, latest version only
- **Disclosure policy**: Coordinated disclosure; reporters should not publicly disclose until a fix is available or a mutually agreed timeline has passed

**Sections to include**:
1. **Reporting a Vulnerability** — How to report (GitHub Security Advisories + email fallback)
2. **Supported Versions** — Pre-1.0 general statement
3. **Response Process** — What happens after a report is received
4. **Disclosure Policy** — Coordinated disclosure expectations

**File content**:
```markdown
# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Preferred method**: Use [GitHub Security Advisories](https://github.com/generacy-ai/agency/security/advisories/new) to report vulnerabilities privately.

**Fallback**: If you are unable to use GitHub Security Advisories, email [security@generacy.ai](mailto:security@generacy.ai).

Please include:
- A description of the vulnerability
- Steps to reproduce the issue
- Any potential impact

**Do not** open a public issue for security vulnerabilities.

## Supported Versions

This project is pre-1.0. Only the latest released version receives security updates. Users are encouraged to keep their installations up to date.

## Response Process

1. Your report will be acknowledged as soon as possible.
2. We will investigate and validate the reported vulnerability.
3. A fix will be developed and tested.
4. A security advisory will be published alongside the fix.

## Disclosure Policy

We follow coordinated disclosure. Please do not publicly disclose the vulnerability until a fix has been released or a mutually agreed-upon timeline has passed.
```

**Verification**: File exists at repo root, contains correct email, advisories link, and policy sections.

---

### Phase 3: Add .github/CODEOWNERS

**File**: `/.github/CODEOWNERS`

Create the CODEOWNERS file for automated PR review assignment.

**Content specifications** (from clarifications Q5, Q9):
- **Team**: `@generacy-ai/core-team` (single team owns all)
- **Prerequisite**: Verify the `@generacy-ai/core-team` GitHub team exists before implementation
- **Package mapping**: Map each of the 8 publishable packages explicitly
- **Exclusion**: `claude-plugin-agency-spec-kit` is excluded from package-specific mappings (covered by `*` fallback)
- **Default fallback**: `*` rule covers all files not explicitly listed

**File content**:
```
# Default owners for everything in the repo
* @generacy-ai/core-team

# Package-specific ownership
/packages/agency/                      @generacy-ai/core-team
/packages/agency-extension/            @generacy-ai/core-team
/packages/agency-plugin-docker/        @generacy-ai/core-team
/packages/agency-plugin-firebase/      @generacy-ai/core-team
/packages/agency-plugin-git/           @generacy-ai/core-team
/packages/agency-plugin-humancy/       @generacy-ai/core-team
/packages/agency-plugin-npm/           @generacy-ai/core-team
/packages/agency-plugin-spec-kit/      @generacy-ai/core-team
```

**Prerequisite check**: Before committing, verify the team exists:
```bash
gh api orgs/generacy-ai/teams/core-team --jq '.slug' 2>/dev/null
```
If the team doesn't exist, flag this to the user and pause — an invalid CODEOWNERS file will silently fail.

**Verification**: File exists at `.github/CODEOWNERS`, GitHub validates it (no warnings in PR).

---

### Phase 4: Audit Git History for Secrets

**Tool**: [gitleaks](https://github.com/gitleaks/gitleaks) (pre-built Linux binary)

**Steps**:

1. **Install gitleaks**:
   ```bash
   # Download latest pre-built Linux binary
   GITLEAKS_VERSION=$(curl -s https://api.github.com/repos/gitleaks/gitleaks/releases/latest | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')
   curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" | tar -xz -C /tmp
   chmod +x /tmp/gitleaks
   ```

2. **Run full history scan**:
   ```bash
   /tmp/gitleaks detect --source /workspaces/agency --report-path /tmp/gitleaks-report.json --report-format json --verbose
   ```

3. **Analyze results**:
   - If **no findings**: Record the clean scan result
   - If **findings exist**: Assess each finding — determine if it's a real secret or false positive

4. **Handle findings** (if any):
   - **False positives**: Document why they're false positives in the audit summary
   - **Real secrets**:
     a. Rotate/revoke the exposed credentials immediately
     b. Notify the team (per Q8 — team notification before history rewrite)
     c. Use `git filter-repo` to remove secrets from history
     d. Coordinate force-push with all contributors
     e. Re-run gitleaks to verify clean history

5. **Archive report** (per Q7):
   - Post scan summary to GitHub issue #298
   - Include: tool version, scan date, total commits scanned, findings count, disposition of each finding

**Verification**: Gitleaks scan completes with exit code 0 (no leaks detected). Report archived in issue #298.

---

## Implementation Order

```
Phase 1: LICENSE           ──┐
Phase 2: SECURITY.md       ──┼── Can be done in parallel (independent files)
Phase 3: CODEOWNERS        ──┘
Phase 4: Secrets audit     ──── Run last (final validation step before merge)
```

Phases 1-3 are independent file additions and can be implemented in a single commit or separate commits on the feature branch. Phase 4 (secrets audit) should run as the final step, scanning the complete history including the new files, before the PR is merged.

## Commit Strategy

```
Commit 1: "feat: add LICENSE, SECURITY.md, and .github/CODEOWNERS for public release"
  - LICENSE
  - SECURITY.md
  - .github/CODEOWNERS

(Phase 4 audit runs but produces no committed artifacts — report goes to GitHub issue #298)
```

A single commit for the three files is appropriate since they are all part of the same logical change (preparing for public visibility) and are tightly coupled in purpose.

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| License type | MIT | All 8 packages already declare MIT; consistency is essential |
| Copyright holder | "The Generacy AI Authors" | Future-proof; covers all contributors without needing updates |
| Copyright year | 2026 | Year of public release, no range needed |
| Security email | security@generacy.ai | Dedicated, professional, scales with team growth |
| Response SLA | Best-effort | Honest for pre-1.0 project; avoids over-promising |
| CODEOWNERS team | @generacy-ai/core-team | Single team, membership managed centrally |
| Secrets scanner | gitleaks (binary) | No dependencies, works in Linux/WSL2, industry standard |
| Report storage | GitHub issue #298 | Provides traceability tied to the "go public" event |
| Non-standard package | Excluded from CODEOWNERS | `*` fallback covers it; no complexity for non-publishable package |

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `@generacy-ai/core-team` doesn't exist on GitHub | Medium | CODEOWNERS silently fails | Verify team exists via `gh api` before committing; pause if not found |
| Gitleaks finds real secrets in history | Low | Requires history rewrite + team coordination | Notify team, rotate credentials, use `git filter-repo`, re-scan |
| Gitleaks false positives | Medium | May delay audit completion | Review each finding manually; document false positive rationale |
| security@generacy.ai not configured | Medium | Dead-end for vulnerability reporters | Verify email routing works before repo goes public (out of scope for this PR but should be confirmed) |
| CODEOWNERS syntax error | Low | Silent failure in PR review assignment | Validate syntax; GitHub shows warnings on invalid CODEOWNERS in PRs |

## Out of Scope

Per the specification:
- GitHub Settings configuration (branch protection, PR restrictions, interaction limits, Actions permissions)
- README.md content updates
- CONTRIBUTING.md
- CODE_OF_CONDUCT.md
- CI/CD pipeline changes
- Package publishing configuration

## Acceptance Criteria Checklist

- [ ] `LICENSE` file present at repo root with MIT license text and correct copyright line
- [ ] `SECURITY.md` present at repo root with reporting instructions, supported versions, response process, and disclosure policy
- [ ] `.github/CODEOWNERS` present with `@generacy-ai/core-team` ownership mappings for all 8 publishable packages
- [ ] `@generacy-ai/core-team` GitHub team verified to exist
- [ ] Gitleaks scan completed against full git history
- [ ] Scan report archived in GitHub issue #298
- [ ] No real secrets found in history (or remediated if found)
- [ ] PR created from `298-prepare-repository-public` to `develop`
