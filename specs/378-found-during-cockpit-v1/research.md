# Phase 0 Research: MISSING_BINARY remedy fix

**Feature**: 378-found-during-cockpit-v1
**Status**: Complete
**Scope**: This is a documentation-only fix. Research is scoped to (a) the inline-verbatim convention the plugin uses for cross-command shared text, (b) why the cluster PATH fix is primary and the `npm install` is fallback, and (c) why the specific package name and locations settled by clarifications are the right ones.

## Decision 1 — Preserve the inline-verbatim convention

**Decision**: Update all seven copies of the `MISSING_BINARY` remedy in place. Do NOT refactor the six `commands/*.md` files to import the block from `README.md`.

**Rationale**:
- Claude Code prompt commands are Markdown files read directly by the harness at command-invocation time. There is no template compiler in the plugin's build path (the package has no `scripts.build`), so a `{{include}}`-style refactor would either require adding a build step or would ship un-expanded template markers to end users.
- The plugin *deliberately* re-states the Error Handling block per-command with an explicit `<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->` marker. That comment is a documented invariant: the copies are expected to match byte-for-byte, and drift is caught by grep, not by a build step.
- Spec Out of Scope §1 explicitly rules out changing this convention as part of the current fix.

**Alternatives considered**:
- **Single-source refactor** (extract to a shared partial, include via a preprocessor): higher blast radius than the bug warrants (would touch every command file's structure, not just its `MISSING_BINARY` line), and would require agreeing on a preprocessor. Not the current bug's fix.
- **Reduce inline copies to a "see README" cross-reference**: viable in principle, but breaks the current convention that command files are self-contained prompt copy — Claude Code sessions do not always have the README in context when a command runs, so the inline copy exists precisely so the remedy prints even when README is absent. Rejected.

**References**:
- `packages/claude-plugin-cockpit/commands/*.md` — the `<!-- Canonical source of truth: ... -->` marker lines.
- Spec §Assumptions bullet 3 and §Out of Scope bullet 1.

## Decision 2 — Cluster PATH fix leads; `npm install` is the fallback

**Decision**: The single-line remedy names the cluster fix first (`export PATH="/shared-packages/node_modules/.bin:$PATH"`) and offers `npm install -g @generacy-ai/generacy` after an explicit "Standalone:" label.

**Rationale**:
- The bug was surfaced in a cluster session (tetrad-development#88), and `/cockpit:*` is used most heavily inside Generacy clusters where the CLI is preinstalled under `/shared-packages/node_modules/.bin`. For that audience, the current remedy prescribes an *unnecessary* global npm install and does not name the actual issue (missing PATH entry).
- The cluster-first ordering is a strict superset for standalone users: a standalone session hitting `MISSING_BINARY` typically has an empty (or nonexistent) `/shared-packages/node_modules/.bin` directory, so the `export` line is a harmless no-op and the reader falls through to the "Standalone:" install line. No user is worse off; cluster users are strictly better off.
- Ordering the standalone install first would train cluster users to run `sudo npm install -g` inside a shared-packages cluster, a footgun that clarifications Q5 was designed to avoid.

**Alternatives considered**:
- **Standalone first, cluster second**: rejected — makes the common (cluster) case hit an unnecessary step. Also misdirects new cluster developers to think the CLI isn't installed.
- **Two separate remedies, printed conditionally based on environment detection**: would require adding logic to the prompt that inspects env vars / paths at run time. Bigger change; the plugin's current design keeps prompt copy static and lets the reader self-select. Rejected as out of scope.
- **Print only the cluster remedy, defer the standalone install to README**: leaves standalone users with a broken command and forces a second lookup. Rejected.

**References**:
- Clarifications Q2 (single-line, two-part) and Q5 (no verify step; single-line payload is self-selecting).
- [generacy-ai/cluster-base#73](https://github.com/generacy-ai/cluster-base/issues/73) — the underlying cluster-side issue that the plugin remedy points around.
- [generacy-ai/tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) — the smoke test that surfaced the bug.

## Decision 3 — Correct package name is `@generacy-ai/generacy`, not `@generacy-ai/cli`

**Decision**: The fallback install command is `npm install -g @generacy-ai/generacy`.

**Rationale**:
- `@generacy-ai/cli` does not exist on the npm registry. `npm install -g @generacy-ai/cli` returns 404 today.
- The CLI ships from `packages/generacy` (or its published equivalent) with package name `@generacy-ai/generacy`. This is the name the CLI itself prints in its own `--version` output and the name that resolves on `npm view`.
- The same wrong name appears independently at `README.md:24` in the § Installation "Runtime dependencies" bullet. FR-003 requires fixing both sites in the same change, otherwise a follow-up would land immediately.

**Alternatives considered**:
- **Publish an `@generacy-ai/cli` alias package to satisfy the current wrong text**: explicitly rejected by clarifications and Out of Scope §4. The text is what is wrong; publishing an alias is a workaround that also pollutes the npm namespace.
- **Fix only the `MISSING_BINARY` remedy and leave README §Installation broken**: would leave a second copy-paste failure mode for the same bug. Rejected as an obvious partial fix.

**References**:
- npm registry — `npm view @generacy-ai/generacy` resolves; `npm view @generacy-ai/cli` returns 404.
- Spec FR-003 and FR-004; clarifications Q4.

## Decision 4 — Byte-identical text scope (payload only, not surrounding markup)

**Decision**: The seven files must match on the *payload string* (the printed remedy sentence). Surrounding Markdown structure — the fenced code block in `README.md` § Error Handling versus the inline `Print:` on a single list item in each command file — remains as-is.

**Rationale**:
- The plugin's grep-based drift check is over the payload text; each file wraps that text in whatever presentation format the surrounding block already uses (README is long-form docs; command files are single-line list items). Forcing the *markup* to match would either turn the six command files into multi-line blocks (breaking FR-005) or unfence the README (harming its readability outside the failure context).
- The `contracts/remedy-string.contract.md` in this feature captures the exact payload string and lists the seven anchor points; any future drift-detection sweep can grep for a distinctive fragment (e.g. `"In a Generacy cluster session it is already installed"`).

**Alternatives considered**:
- **Match markup byte-for-byte as well**: rejected — see clarifications Q3 and above.
- **Introduce a machine-checkable invariant** (e.g. a repo script that greps for the seven copies and diffs them): out of scope for this fix, but the contracts file leaves a specification a future check could hang off.

**References**:
- Clarifications Q3.
- Spec FR-002, FR-005.

## Decision 5 — No "verify" step embedded in the remedy

**Decision**: The remedy text does not include a follow-up command like `command -v generacy && echo OK` to verify the fix took.

**Rationale**:
- The pre-flight `command -v generacy` failing is what caused the remedy to print. After the reader runs `export PATH="..."` or `npm install -g @generacy-ai/generacy`, retrying the original `/cockpit:*` command is itself the verification — success means the pre-flight passes; failure re-prints the same remedy.
- Adding a verify step lengthens the payload, threatens the FR-005 single-line constraint, and duplicates information the next retry will surface anyway. Clarifications Q5 chose to trust the retry loop as the verify step.

**Alternatives considered**:
- **Include `command -v generacy` as an inline post-fix check**: adds noise, breaks the two-part structure that makes the payload readable, and the retry loop is a stronger check anyway. Rejected.

**References**:
- Clarifications Q5.
- Spec §Success Criteria SC-003 (cluster smoke test — success is retry-succeeds, not a separate command).
