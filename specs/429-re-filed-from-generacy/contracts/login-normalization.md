# Contract: Login normalization

A single normalization rule for every `login` comparison in `postcondition-check.md`. Sits as a preamble at the top of that document, referenced by name (not restated) at each comparison site.

## Rule

Given two GitHub login strings `A` and `B`, define `normalize(x)` as:

1. If `x` ends with the literal suffix `[bot]`, strip that suffix (once).
2. Lowercase the result.

Two logins compare equal iff `normalize(A) == normalize(B)`.

## Examples

| A | B | normalize(A) | normalize(B) | Equal? |
|---|---|---|---|---|
| `generacy-ai` | `generacy-ai` | `generacy-ai` | `generacy-ai` | ✓ |
| `generacy-ai[bot]` | `generacy-ai` | `generacy-ai` | `generacy-ai` | ✓ |
| `Generacy-AI[bot]` | `generacy-ai` | `generacy-ai` | `generacy-ai` | ✓ |
| `generacy-ai[bot]` | `Generacy-AI` | `generacy-ai` | `generacy-ai` | ✓ |
| `generacy-ai` | `other-bot` | `generacy-ai` | `other-bot` | ✗ |
| `foo[bot]bar` | `foo[bot]bar` | `foo[bot]bar` | `foo[bot]bar` | ✓ (no trailing `[bot]` — no strip) |

## Application

**Every** `login` comparison in `postcondition-check.md` uses this rule. Today that is one site:

- **Leg 2** filter: `comments.nodes[0].author.login == <acting-bot-login>` — both sides normalized before comparison.

Tomorrow, any new leg that reads a `login` field is automatically covered — the preamble binds the whole document.

## Why case-insensitive

GitHub usernames are case-preserved but not case-guaranteed. `Generacy-AI` and `generacy-ai` refer to the same account. A future leg or a future implementer binding `<acting-bot-login>` to a case-preserving REST source (where a display-cased form might appear) should not trip the postcondition on a rendering difference.

## Why `[bot]` suffix strip

REST-derived bot logins render as `<name>[bot]` (e.g., `generacy-ai[bot]`). GraphQL-derived bot logins render as `<name>` (e.g., `generacy-ai`). Legs may compare a login from one API against a login from another (or against a session-derived `viewer.login` from GraphQL). Stripping the suffix once from either side makes the comparison API-agnostic.

**Only trailing `[bot]`** is stripped. `foo[bot]bar` keeps its inner `[bot]` because it's not a suffix.

## Non-goals

- **User accounts** — this rule applies to all logins, but its practical purpose is defense against bot-login rendering drift. Applying it to human-user logins is harmless (human usernames don't carry `[bot]` suffixes, so step 1 is a no-op; step 2 folds case, which is what username comparison should do anyway).
- **Email or full name** — those aren't logins; this rule doesn't apply.
- **Deep normalization** (Unicode NFC, homoglyph filtering, etc.) — out of scope. GitHub logins are ASCII-restricted.

## Application in Leg 2 today (defense-in-depth)

Leg 2 as currently specified in `postcondition-check.md` compares GraphQL `reviewThreads…author.login` (renders `generacy-ai`) against `<acting-bot-login>` bound to GraphQL `viewer.login` (also `generacy-ai`). Both sides are already GraphQL-derived so the pre-normalization comparison is correct today.

The normalization is defense against:
1. A future leg that reads a `login` from REST.
2. A future implementer that binds `<acting-bot-login>` to a REST-derived source (e.g., the POST response's `.user.login`, which does render `generacy-ai[bot]`).
3. Any GitHub-side rendering change that alters case for either source.

## Drift pin

`playbook-verification.test.ts` asserts the "Login normalization" heading string is present in `postcondition-check.md`. See `research.md` § R5.
