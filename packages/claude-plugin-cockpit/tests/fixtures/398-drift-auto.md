<!--
Fixture: pre-fix agency#398 D.5 drift (NOT a real playbook)

Feeds through parseInvocations + drift audit in playbook-verification.test.ts
(assertion 398-2). Reproduces the pre-fix `<pr-ref>` invocation on the D.5
dispatch step so the audit's regex/logic is exercised on a known-drifted input.
Any prose here that mentions `generacy cockpit merge` without an argument is a
bare-verb reference and MUST NOT produce an Invocation (Q2=B safety check).
-->

# Fixture: pre-fix agency#398 D.5 drift

## Dispatch

| # | Event | Action shape |
|---|-------|--------------|
| D.5 | `completed:validate` + green | `cockpit merge` (no gate — human verdict was implementation-review) |

### D.5 — `completed:validate` (checks green) → merge without gate

**Trigger**: An issue enters `completed:validate` and the PR's checks are all green.

**Dispatch**:
1. **Confirm state via `cockpit status --json`**.
2. **Merge**: `generacy cockpit merge <pr-ref>` (squash, branch delete per the CLI's default).
3. **No gate.**
