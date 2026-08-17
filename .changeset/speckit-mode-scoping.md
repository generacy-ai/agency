---
"@generacy-ai/agency": minor
"@generacy-ai/agency-plugin-npm": patch
"@generacy-ai/agency-plugin-spec-kit": patch
---

feat(modes): add a `speckit` mode and a `--mode` CLI flag to scope the advertised tool surface for automated workflow sessions.

A default (coding-mode) session advertises 49 tools ≈ 26 KB (~6.5k tokens) of definitions, of which the speckit playbooks use six. The new built-in `speckit` mode advertises only the 11 tools the workflows need — the six spec_kit workflow tools plus the terse `build.compile`/`build.validate`/`test.run_*` checks — measuring 11 tools ≈ 6 KB (~1.5k tokens), a 77% reduction in per-session definition cost.

- `DEFAULT_MODE_PATTERNS` gains `speckit: []`: the empty pattern list excludes every tool that does not explicitly opt in via its `modes` array (so pattern-fallback families like docker and humancy are out by construction).
- The CLI now accepts `--mode <name>`, and `AgencyServer.create` accepts `modeOverride` — an explicit invocation-level override that beats `defaultMode` from every config source (previously `AGENCY_DEFAULT_MODE` silently lost to any `.agency/config.json`). Unknown modes warn on stderr and keep the configured default.
- The 11 workflow tools add `'speckit'` to their `modes` arrays.

Also slims the heaviest spec_kit payloads: `get_ticket` and `tasks_to_issues` responses are now compact JSON instead of 2-space pretty-printed (tickets carry full issue bodies), and `manage_clarifications`' advertised schema drops a triple-nested per-field `questions` description (~0.9 KB of every tools/list) in favor of a one-line shape description — runtime behavior is unchanged since the tool validates parameters itself.
