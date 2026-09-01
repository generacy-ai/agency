---
"@generacy-ai/agency-plugin-spec-kit": minor
---

Redirect `/plan` step 5 to write per-feature tech context to `specs/<feature>/stack.md` instead of the repo-root `CLAUDE.md`, and stop calling the `update_agent` MCP tool from the plan phase. This prevents `CLAUDE.md` bloat and cross-branch merge conflicts. The plan phase now explicitly refuses to modify repo-root agent-context files, and a pin test guards against regression.

The deprecated mirror `claude-plugin-agency-spec-kit` copy of the `/plan` playbook was updated in lockstep (it has no `package.json`, so it cannot be named as a changeset target).
