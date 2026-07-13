# Clarifications

## Batch 1 — 2026-07-07T03:44:08Z

### Q1: PATH remedy format
**Context**: The spec says the cluster remedy should tell users to "put `/shared-packages/node_modules/.bin` on `$PATH`" but does not specify whether the printed remedy should include an explicit, copy-pasteable shell command or just describe the action in prose. This affects one-step recovery per US1 AC.
**Question**: Should the cluster remedy include an explicit copy-pasteable shell command for adding the directory to `$PATH`, or describe the action in prose?
**Options**:
- A: Include an explicit command like `export PATH="/shared-packages/node_modules/.bin:$PATH"`
- B: Prose only — e.g., "add `/shared-packages/node_modules/.bin` to your `$PATH`"
- C: Both — prose sentence followed by the exact command inside a fenced block

**Answer**: A — include the explicit command. Prose-only fails the one-step-recovery test; the reader is mid-failure and should copy-paste, not translate. It appears inline (backtick-quoted) per Q2/Q3, not in a fenced block.

### Q2: Single-line vs two-part remedy
**Context**: FR-005 requires the final wording to fit on a single line when inlined into `commands/*.md`, but the remedy is now two-part (cluster PATH fix + standalone `npm install -g @generacy-ai/generacy` fallback). The current single-line convention is preserved in FR-005 (P2). This constraint materially shapes the string.
**Question**: How should the two-part remedy (cluster fix + standalone fallback) be reconciled with the single-line inline convention?
**Options**:
- A: One long single line joining both remedies with a separator (e.g., "…add it to `$PATH`; for standalone installs, run `npm install -g @generacy-ai/generacy`.")
- B: Inlined command files carry only the cluster remedy (primary); README carries both (cluster + fallback)
- C: Relax FR-005 — both README and command files may span multiple lines

**Answer**: A — one single line carrying both remedies, audience-labeled. Option B would break the byte-for-byte identity requirement (command copies would differ from the README's), which is the drift disease this convention exists to cure. Canonical payload (one line): `The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: `export PATH="/shared-packages/node_modules/.bin:$PATH"` (persist it in ~/.bashrc). Standalone: install it with `npm install -g @generacy-ai/generacy`.` Rationale for the `(persist it in ~/.bashrc)` hint: a bare export lives for one shell only — in a Claude Code session each Bash invocation is fresh, so the durable stopgap is the profile line (the real fix is generacy-ai/cluster-base#73's entrypoint symlink, after which this remedy is rarely seen).

### Q3: Byte-for-byte scope
**Context**: US3 AC and FR-002 require the remedy string in the README and six command files to be identical byte-for-byte. Today the README wraps the remedy in a triple-backtick fenced code block, while the six command files inline it as backtick-quoted text after "Print:" (no fence). It is unclear whether "byte-for-byte" applies to the payload text only, or also the surrounding markdown/fence markup.
**Question**: Does "identical byte-for-byte" refer only to the remedy payload text, or also to the surrounding markdown formatting (fences, backticks, "Print:" prefix)?
**Options**:
- A: Text-only — the payload string between fences/backticks must match; existing wrappers (fence in README, inline backticks in commands) stay as-is
- B: Full byte-for-byte — command files must also switch to fenced code blocks so the exact rendered block matches
- C: Full byte-for-byte in the other direction — README drops the fence and inlines like the command files

**Answer**: A — text-only. The point of byte-identity is greppable drift detection: one string findable in seven files. The surrounding markup (README fence vs inline backticks after "Print:") is presentation, and churning it (B/C) buys no drift protection.

### Q4: README Installation §Runtime dependencies scope
**Context**: FR-003 requires fixing the stale `@generacy-ai/cli` reference in the README §Installation "Runtime dependencies" bullet (line 24). It is unclear whether this bullet should also mention the `/shared-packages/node_modules/.bin` cluster convention (mirroring the new remedy) or only correct the package name.
**Question**: For the README §Installation line 24 update, should the bullet only correct the package name, or also mention the cluster `/shared-packages/node_modules/.bin` convention?
**Options**:
- A: Package name only — `npm install -g @generacy-ai/generacy` in place of the old name; leave the bullet's structure unchanged
- B: Also mention cluster convention — add that cluster sessions already have the CLI under `/shared-packages/node_modules/.bin`, PATH-add rather than reinstall
- C: Package name + a one-line pointer/cross-reference to the Error Handling §MISSING_BINARY block

**Answer**: C — correct the package name AND add a one-line cross-reference to §Error Handling / MISSING_BINARY. Option B would restate the cluster remedy in a third location with independent wording — a new drift site, the exact disease being cured. The cross-ref keeps the remedy single-sourced.

### Q5: Verify-check step in cluster remedy
**Context**: The spec's summary says the remedy should tell cluster users to "check `/shared-packages/node_modules/.bin` and put it on `$PATH` first". "Check" is ambiguous — it could mean a literal verify command (e.g., `ls /shared-packages/node_modules/.bin/generacy`) before PATH-adding, or it could mean "look at that location" as a conceptual pointer.
**Question**: Should the cluster remedy include an explicit verify step (e.g., `ls /shared-packages/node_modules/.bin/generacy`) before the PATH fix, or go straight to the PATH remedy?
**Options**:
- A: Skip verify — go straight to PATH-add ("put `/shared-packages/node_modules/.bin` on your `$PATH`"), since the check is what pre-flight already did
- B: Include verify — instruct the user to `ls` the directory first, then add to PATH if the binary is present
- C: Combined — a single command like `[ -x /shared-packages/node_modules/.bin/generacy ] && export PATH="/shared-packages/node_modules/.bin:$PATH"`

**Answer**: A — no verify step. Preflight already performed the check that matters (`command -v generacy` failed), and the Q2 payload is self-selecting: cluster users run the export, standalone users run the install, and a "cluster" user whose shared-packages is unexpectedly empty falls through to the install remedy sitting in the same sentence. An ls step makes recovery two steps for zero information gain.
