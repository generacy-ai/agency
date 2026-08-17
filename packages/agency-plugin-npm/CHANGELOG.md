# @generacy-ai/agency-plugin-npm

## 2.0.0

### Patch Changes

- a97a23b: fix(npm): cap failure output, stop stream masking, and bound execution time in the build/test tools.

  - Failure paths previously embedded one raw stream whole (`stderr || stdout` for build tools, `stdout || stderr` for test tools) with no size limit — a failing test suite could return an unbounded log (a real hazard for agent context windows), and a single warning line on one stream hid the actual error on the other. Failures now return both streams labeled, clamped to the last 200 lines / 8 KB with an explicit truncation marker (`formatFailureOutput` in `src/exec/output.ts`). Success output is unchanged (terse).
  - `exec` never set a timeout, so a hung script stalled the MCP call forever. A 10-minute default now applies, with a note appended when the process is killed by a signal.
  - Removed the `watch` parameter from the `test.run_*` schemas — `--watch` never exits, which guaranteed a hang.
  - `test.run_coverage` now reads the "All files" row of the coverage summary instead of the first percentage anywhere in stdout, which could match an unrelated number.

- 5d3e502: feat(modes): add a `speckit` mode and a `--mode` CLI flag to scope the advertised tool surface for automated workflow sessions.

  A default (coding-mode) session advertises 49 tools ≈ 26 KB (~6.5k tokens) of definitions, of which the speckit playbooks use six. The new built-in `speckit` mode advertises only the 11 tools the workflows need — the six spec*kit workflow tools plus the terse `build.compile`/`build.validate`/`test.run*\*` checks — measuring 11 tools ≈ 6 KB (~1.5k tokens), a 77% reduction in per-session definition cost.

  - `DEFAULT_MODE_PATTERNS` gains `speckit: []`: the empty pattern list excludes every tool that does not explicitly opt in via its `modes` array (so pattern-fallback families like docker and humancy are out by construction).
  - The CLI now accepts `--mode <name>`, and `AgencyServer.create` accepts `modeOverride` — an explicit invocation-level override that beats `defaultMode` from every config source (previously `AGENCY_DEFAULT_MODE` silently lost to any `.agency/config.json`). Unknown modes warn on stderr and keep the configured default.
  - The 11 workflow tools add `'speckit'` to their `modes` arrays.

  Also slims the heaviest spec_kit payloads: `get_ticket` and `tasks_to_issues` responses are now compact JSON instead of 2-space pretty-printed (tickets carry full issue bodies), and `manage_clarifications`' advertised schema drops a triple-nested per-field `questions` description (~0.9 KB of every tools/list) in favor of a one-line shape description — runtime behavior is unchanged since the tool validates parameters itself.

- Updated dependencies [5d3e502]
  - @generacy-ai/agency@0.2.0

## 1.0.2

### Patch Changes

- Updated dependencies [7a0ff8c]
  - @generacy-ai/agency@0.1.2

## 1.0.1

### Patch Changes

- Updated dependencies [1603962]
  - @generacy-ai/agency@0.1.1

## 1.0.0

### Minor Changes

- 1c22c84: Initial release of agency packages

### Patch Changes

- Updated dependencies [1c22c84]
  - @generacy-ai/agency@0.1.0
