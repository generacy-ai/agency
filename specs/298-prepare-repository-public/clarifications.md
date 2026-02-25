# Clarification Questions

## Status: Pending

## Questions

### Q1: Copyright Year Format
**Context**: The spec states the copyright line should read `Copyright (c) 2025-present Generacy AI`. The current year is 2026. The "2025" presumably reflects the year the project was first created, but this should be confirmed since an incorrect start year could have legal implications for the license validity period.
**Question**: Is 2025 the correct inception year for the copyright notice, or should it be a different year?
**Options**:
- A) 2025-present: The project was first created in 2025, use `Copyright (c) 2025-present Generacy AI`
- B) 2024-present: The project started earlier and should reflect 2024
- C) 2025 only: Use a fixed year `Copyright (c) 2025 Generacy AI` without "present"
**Answer**:

### Q2: Security Contact Email
**Context**: The SECURITY.md spec says to prefer GitHub Security Advisories with a "fallback email" for reporting vulnerabilities. The actual email address to use is not specified anywhere in the spec. This is critical — a security policy without a working contact channel is ineffective.
**Question**: What email address should be listed as the fallback security contact in SECURITY.md?
**Options**:
- A) security@generacy.ai: Use a dedicated security email
- B) General contact email: Use an existing general-purpose org email (please specify)
- C) No email fallback: Only list GitHub Security Advisories, omit email entirely
**Answer**:

### Q3: Security Response Timeline
**Context**: The spec mentions "expected acknowledgment timeline (e.g., 48 hours)" and "fix timeline expectations" but uses example language rather than specifying concrete commitments. The response timeline is a public commitment that sets reporter expectations, so it should be a deliberate choice by the maintainers rather than a default assumption.
**Question**: What specific response timelines should SECURITY.md commit to?
**Options**:
- A) 48h ack / 90-day fix: Acknowledge within 48 hours, aim to release a fix within 90 days
- B) 72h ack / 90-day fix: Acknowledge within 72 hours (more realistic for a small team), fix within 90 days
- C) Best-effort: State that the team will respond "as soon as possible" without committing to specific timelines
**Answer**:

### Q4: Supported Versions Policy
**Context**: The SECURITY.md requires a "supported versions" section, but the spec doesn't define what the support policy actually is. The packages are at various versions (e.g., some at 0.x, some at 1.x). For an open-source project, this policy determines which versions receive security patches and directly impacts user trust and maintainer burden.
**Question**: What versions should be listed as supported for security updates?
**Options**:
- A) Latest only: Only the latest released version of each package receives security updates
- B) Current major: All versions within the current major version receive updates
- C) General statement: Use a general policy like "We only support the latest version. Users are encouraged to keep their installations up to date."
**Answer**:

### Q5: CODEOWNERS Team Verification
**Context**: The spec maps all packages to `@generacy-ai/core` as the owning team. If this GitHub team doesn't exist, the CODEOWNERS file will be invalid and GitHub will silently fail to assign reviewers. The spec notes "Team handles should be confirmed with the org before implementation."
**Question**: Does the `@generacy-ai/core` GitHub team exist, and should all packages be owned by this single team, or should ownership be split?
**Options**:
- A) Single team confirmed: `@generacy-ai/core` exists and owns everything
- B) Use individual handles: Map to individual GitHub usernames instead of a team (please provide usernames)
- C) Create team first: The team needs to be created before this work proceeds
**Answer**:

### Q6: Gitleaks Installation Method
**Context**: The spec lists multiple installation methods for gitleaks (brew, go install, binary release) but doesn't specify which is appropriate for the CI/development environment. Since this is running in a Linux/WSL2 development environment without Homebrew, the installation method matters for reproducibility.
**Question**: How should gitleaks be installed for the secrets audit?
**Options**:
- A) Binary release: Download the pre-built Linux binary from GitHub releases (simplest, no dependencies)
- B) Go install: Use `go install` (requires Go toolchain)
- C) Docker: Run gitleaks via its official Docker image (`ghcr.io/gitleaks/gitleaks`)
- D) npx/npm: Use a Node-based secrets scanner like `secretlint` instead, since this is a Node.js project
**Answer**:

### Q7: Scan Report Storage
**Context**: The spec says to "Archive scan report (do NOT commit the report to the repo)" and "Record scan output for audit purposes." These two instructions create ambiguity — the report needs to be preserved but not in the repository. Where should the audit trail be stored? This matters for compliance and future reference.
**Question**: Where should the gitleaks scan report be stored for audit purposes?
**Options**:
- A) GitHub Issue: Attach or paste the summary in the tracking GitHub issue (#298)
- B) Private storage: Store in a private location outside the repo (e.g., internal wiki, shared drive)
- C) PR description: Include the scan summary in the PR description for this feature branch
- D) Spec directory: Store as a non-committed local file and summarize findings in the spec's implementation notes
**Answer**:

### Q8: History Rewrite Coordination
**Context**: If secrets are found, the spec calls for `git filter-repo` to rewrite history, which changes all commit SHAs and requires all contributors to re-clone. The spec notes "coordinate with all contributors" but doesn't specify the coordination process. Since this is a pre-publication step, the impact depends on how many people are currently working with the repo.
**Question**: If history rewriting is needed, how should contributor coordination be handled?
**Options**:
- A) Solo operation: Only one person has clones, no coordination needed — proceed with rewrite
- B) Team notification: Notify the team via Slack/email before rewriting, give a window to push pending work
- C) Defer to post-publication: If secrets are found, document them but defer history rewriting to avoid disruption
**Answer**:

### Q9: claude-plugin-agency-spec-kit Package Status
**Context**: The spec references 9 packages and all their package.json files declaring MIT license. However, the `claude-plugin-agency-spec-kit` package does not have a standard package.json — it appears to be structured differently (README + commands). This package may need different treatment in the CODEOWNERS mapping and license verification.
**Question**: Should `claude-plugin-agency-spec-kit` be treated the same as other packages in CODEOWNERS and license verification, even though it has a non-standard structure?
**Options**:
- A) Include as-is: List it in CODEOWNERS like other packages; its directory structure is intentional
- B) Verify and adjust: Investigate whether it needs a package.json with license field added
- C) Exclude: It's not a publishable package, omit from CODEOWNERS package-specific mappings (the `*` fallback will still cover it)
**Answer**:

### Q10: Branch Strategy for File Additions
**Context**: The spec doesn't specify whether the LICENSE, SECURITY.md, and CODEOWNERS files should be added on the feature branch (`298-prepare-repository-public`) and merged via PR, or directly to the main/develop branch. Since the repo isn't public yet, there's flexibility, but the approach affects the git history audit (new files added after the audit won't contain secrets, but the audit should run against the final state).
**Question**: Should the community health files be committed to the feature branch and merged via PR to develop, following the normal workflow?
**Options**:
- A) Feature branch + PR: Add files on `298-prepare-repository-public`, merge via PR to `develop` (standard workflow)
- B) Direct to develop: Commit directly to `develop` since the repo isn't public yet and review overhead is unnecessary
**Answer**:
