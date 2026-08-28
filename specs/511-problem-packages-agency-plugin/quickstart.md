# Quickstart: /plan step 5 redirect

## Prerequisites

```bash
pnpm install
```

## Making the change

1. Edit step 5 in `packages/agency-plugin-spec-kit/commands/plan.md` to the exact text
   in `contracts/plan-step5.md`.
2. Copy the file byte-for-byte to `packages/claude-plugin-agency-spec-kit/commands/plan.md`:
   ```bash
   cp packages/agency-plugin-spec-kit/commands/plan.md packages/claude-plugin-agency-spec-kit/commands/plan.md
   ```
3. Add `packages/agency-plugin-spec-kit/tests/plan-command-pin.test.ts`.
4. Update `packages/claude-plugin-agency-spec-kit/README.md`:
   - Line ~104: replace "Updates agent context files (CLAUDE.md, etc.)" with
     "Writes the tech stack summary to `specs/<feature>/stack.md`"
   - Line ~285: remove `update_agent` from the `/speckit:plan` tool row
5. Add a changeset:
   ```bash
   pnpm changeset
   # select @generacy-ai/agency-plugin-spec-kit, minor
   ```

## Verifying

```bash
# Full package test suite (pin test + update-agent.test.ts + commands.test.ts)
pnpm --filter @generacy-ai/agency-plugin-spec-kit test

# SC-001: no stray references
grep -ri update_agent packages/agency-plugin-spec-kit/commands/plan.md \
  packages/claude-plugin-agency-spec-kit/commands/plan.md   # expect: no output
grep -in claude.md packages/agency-plugin-spec-kit/commands/plan.md
# expect: exactly one match, inside the NEVER-modify sentence

# Copies identical
diff packages/agency-plugin-spec-kit/commands/plan.md \
  packages/claude-plugin-agency-spec-kit/commands/plan.md   # expect: no output

# SC-002 negative check: revert step 5 in one copy, re-run tests, confirm pin failure,
# then restore.
```

## Troubleshooting

- **Pin test fails on header line**: check the em dash (`—`, U+2014) wasn't normalized
  to a hyphen; the assertion is exact-bytes.
- **Byte-identity failure**: re-run the `cp` above; don't hand-edit the mirror.
- **`update-agent.test.ts` fails**: the tool must not have been touched — this feature
  changes only command markdown, tests, docs, and a changeset.
