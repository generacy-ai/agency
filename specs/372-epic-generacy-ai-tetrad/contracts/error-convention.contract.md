# Contract: Shared error convention

**Files**: All six of `packages/claude-plugin-cockpit/commands/{watch,status,queue,clarify,review,merge}.md` PLUS the canonical copy in `packages/claude-plugin-cockpit/README.md`.
**Related FRs**: FR-012, SC-005.

## Purpose

Every command classifies failures the same way. Every command inlines the classification block byte-identically. Identical error paths render identically across commands.

## Canonical block

The block below is the reference form. Each of the six command files inlines this block *verbatim* as its terminal `Instructions` step. The README's `## Error Handling` section reproduces it (may be prose-expanded but the class names, match rules, and one-liners must remain identical).

```markdown
N. **Error handling** — When the CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
   <!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
   - **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. Install it with npm install -g @generacy-ai/cli (or the prevailing install command) and retry.`
   - **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
   - **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
```

(The leading step number `N.` is renumbered per command to fit each command's numbered playbook — the *number* is not part of the byte-identical block; the block starts at `**Error handling**` and ends at the closing backtick fence line for the `OTHER` class. The tasks phase defines the exact byte boundaries used by the SC-005 diff.)

## Invariants

| Invariant | Enforcement |
|---|---|
| Block appears in all six command files. | Grep for the canonical `<!-- Canonical source of truth: … -->` comment. |
| Block is byte-identical across the six files. | `diff` all pairs (SC-005). |
| README `## Error Handling` section contains the three class names and the two one-liners (install / auth). | Grep + manual review. |
| No sixth class, no fourth-class, no per-command extension. | Static count of `**CLASSNAME** —` bullets == 3 inside the block. |
| Canonical source-of-truth comment names **this plugin's** README (not `generacy` npm README). | Grep for the literal path `packages/claude-plugin-cockpit/README.md`. |

## Rationale

See [clarifications.md](../clarifications.md) Q5 and [research.md](../research.md) Decision 5. Slash commands must be self-contained at execution time — a canonical README that lives in the `generacy` npm package is not readable from a user's Claude Code session, and a `commands/_errors.md` file would be auto-discovered as `/cockpit:_errors`. Inlining is the only design that survives fresh-session runnability (FR-004) plus SC-005 (byte-identical enforcement).
