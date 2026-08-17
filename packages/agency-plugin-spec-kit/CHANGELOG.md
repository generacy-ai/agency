# @generacy-ai/agency-plugin-spec-kit

## 2.0.0

### Patch Changes

- 5d3e502: feat(modes): add a `speckit` mode and a `--mode` CLI flag to scope the advertised tool surface for automated workflow sessions.

  A default (coding-mode) session advertises 49 tools ≈ 26 KB (~6.5k tokens) of definitions, of which the speckit playbooks use six. The new built-in `speckit` mode advertises only the 11 tools the workflows need — the six spec*kit workflow tools plus the terse `build.compile`/`build.validate`/`test.run*\*` checks — measuring 11 tools ≈ 6 KB (~1.5k tokens), a 77% reduction in per-session definition cost.

  - `DEFAULT_MODE_PATTERNS` gains `speckit: []`: the empty pattern list excludes every tool that does not explicitly opt in via its `modes` array (so pattern-fallback families like docker and humancy are out by construction).
  - The CLI now accepts `--mode <name>`, and `AgencyServer.create` accepts `modeOverride` — an explicit invocation-level override that beats `defaultMode` from every config source (previously `AGENCY_DEFAULT_MODE` silently lost to any `.agency/config.json`). Unknown modes warn on stderr and keep the configured default.
  - The 11 workflow tools add `'speckit'` to their `modes` arrays.

  Also slims the heaviest spec_kit payloads: `get_ticket` and `tasks_to_issues` responses are now compact JSON instead of 2-space pretty-printed (tickets carry full issue bodies), and `manage_clarifications`' advertised schema drops a triple-nested per-field `questions` description (~0.9 KB of every tools/list) in favor of a one-line shape description — runtime behavior is unchanged since the tool validates parameters itself.

- 7070bea: fix(spec-kit): remove phantom MCP tool references from the speckit playbooks and wire the implement increment sentinel.

  The playbooks instructed agents to call four tools that do not exist anywhere in the agency server (`manage_clarification_labels`, `preflight_check`, `merge_from_base`, `update_phase_labels`), so every clarify/tasks/implement run paid for a failed tool call and improvised recovery — and the label steps (`waiting-for:clarification`, `waiting-for:manual-validation`) silently never happened.

  - clarify.md: labels are now managed via `gh issue edit`; the redundant second `manage_clarifications read` (which re-fetched the whole clarifications file just to read `pending_count`) is replaced with local bookkeeping.
  - tasks.md: epic auto-detection now reads issue labels via `gh issue view` instead of the nonexistent `preflight_check`.
  - implement.md: base-branch sync uses plain `git fetch`/`git merge`; the manual-validation block label uses `gh issue edit`; completion validation now points at the terse `build_validate`/`test_run_unit` MCP tools; and a new "Task Increment Boundaries (Headless Mode)" section instructs emitting the `SPECKIT_IMPLEMENT_PARTIAL: {...}` sentinel after ~10 tasks — the orchestrator has parsed this sentinel since generacy spec 360 (T004), but no playbook ever emitted it, so the fresh-session re-invoke mitigation for implement-phase context exhaustion could never trigger.
  - taskstoissues.md: the mandatory `dry_run: true` preview pass (up to ~15 KB of discarded body previews) is now interactive-only; headless runs create issues in a single call.

  Both command directories (`agency-plugin-spec-kit/commands` and `claude-plugin-agency-spec-kit/commands`) updated in lockstep, byte-identical.

- Updated dependencies [5d3e502]
  - @generacy-ai/agency@0.2.0
  - @generacy-ai/agency-plugin-humancy@2.0.0

## 1.0.2

### Patch Changes

- Updated dependencies [7a0ff8c]
  - @generacy-ai/agency@0.1.2
  - @generacy-ai/agency-plugin-humancy@1.0.2

## 1.0.1

### Patch Changes

- 1603962: Initial `stable` dist-tag release. Publishes current main under the `stable` channel so the orchestrator's `npm install @generacy-ai/<pkg>@stable` resolves.
- Updated dependencies [1603962]
  - @generacy-ai/agency@0.1.1
  - @generacy-ai/agency-plugin-humancy@1.0.1

## 1.0.0

### Minor Changes

- 1c22c84: Initial release of agency packages

### Patch Changes

- Updated dependencies [1c22c84]
  - @generacy-ai/agency@0.1.0
  - @generacy-ai/agency-plugin-humancy@1.0.0
