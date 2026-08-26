# Quickstart: D.5 merge-past-G.8 guard + remediation-limit findings-fetch contract

This feature is a playbook / contract / test-repin change in
`packages/claude-plugin-cockpit`. There is nothing to install or run as an app — the
deliverable is corrected `auto.md` prose, one docstring, and re-pinned tests.

## Files you will edit

| File | What changes |
|------|--------------|
| `packages/claude-plugin-cockpit/commands/auto.md` | D.5 guard + ledger token; D.13/G.9 findings-fetch; G.8 `(none)` prose; `cockpit.auto.agents` drops `fixer`; UI-mode G.8 mapping row |
| `packages/claude-plugin-cockpit/lib/gate-status-check.ts` | docstring `:164-165` drops D.6/G.4a (comment only) |
| `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` | re-pin 437-5 / 500-5 / 500-6; fix stale `:2839` comment; add pins for the new contract |

## Build & test

```bash
# from repo root
pnpm install                       # once
pnpm --filter @generacy/claude-plugin-cockpit test
# or target the pinned suite directly
pnpm --filter @generacy/claude-plugin-cockpit test playbook-verification
```

The `playbook-verification.test.ts` suite is a **drift audit**: after each `auto.md`
edit, expect specific pins to fail, then re-pin them to the NEW contract in the same
change (CLAUDE.md § "Cockpit playbook pins"). Never weaken or delete a pin to make it
pass.

## Verifying the change by grep (SC-004)

After the edits, these should return no stale hits:

```bash
# no fixer role key in the agents selector
grep -n "fixer" packages/claude-plugin-cockpit/commands/auto.md

# no "10-row table" stale test comment
grep -n "10-row" packages/claude-plugin-cockpit/tests/playbook-verification.test.ts

# no removed escalation row in the docstring
grep -n "D.6 (G.4a)" packages/claude-plugin-cockpit/lib/gate-status-check.ts

# no G.8 gate-body findings claim
grep -n "wrote its remaining findings into the gate body" packages/claude-plugin-cockpit/commands/auto.md
```

And these SHOULD now be present:

```bash
# D.5 deferral outcome token
grep -n "deferred: implementation-review pending" packages/claude-plugin-cockpit/commands/auto.md

# remediation-limit comment heading anchor
grep -n "## Remediation limit reached" packages/claude-plugin-cockpit/commands/auto.md

# gh comment fetch in D.13/G.9
grep -n "gh issue view <issue-ref> --json comments" packages/claude-plugin-cockpit/commands/auto.md
```

## Acceptance walkthrough

1. **SC-001 (co-present → defer)**: enriched line `completed:validate` + green +
   `waiting-for:implementation-review` → D.5 writes `deferred: implementation-review
   pending`, calls no `cockpit_merge`; G.8 is presented by the D.3 trigger; `approve`
   merges.
2. **SC-002 (legacy path)**: `completed:validate` + green, no `implementation-review`
   label → D.5 merges (no regression).
3. **SC-003 (findings)**: D.13/G.9 walkthrough resolves to `gh issue view --json
   comments` → most-recent `## Remediation limit reached` comment → `- <file>:<line> —
   <title>` bullets → `(none)` if absent.
4. **SC-004 (no stale refs)**: the grep checks above are clean.
5. **SC-005 (tests green)**: `pnpm --filter @generacy/claude-plugin-cockpit test` passes
   with re-pinned assertions.

## Troubleshooting

- **A pin failed after an `auto.md` edit** — expected. Read the failing assertion, then
  update it to the new contract string. Do NOT soften the matcher.
- **437-5 fails on the deferral token** — check the token is exactly `deferred:
  implementation-review pending` (no whitespace after `defer`) and that D.5 still names
  `absent`/`pending` as `checks` fallback triggers.
- **Em-dash mismatch** — the bullet contract and heading use `—` (U+2014), not `-`.
