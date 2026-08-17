---
"@generacy-ai/agency-plugin-npm": patch
---

fix(npm): cap failure output, stop stream masking, and bound execution time in the build/test tools.

- Failure paths previously embedded one raw stream whole (`stderr || stdout` for build tools, `stdout || stderr` for test tools) with no size limit — a failing test suite could return an unbounded log (a real hazard for agent context windows), and a single warning line on one stream hid the actual error on the other. Failures now return both streams labeled, clamped to the last 200 lines / 8 KB with an explicit truncation marker (`formatFailureOutput` in `src/exec/output.ts`). Success output is unchanged (terse).
- `exec` never set a timeout, so a hung script stalled the MCP call forever. A 10-minute default now applies, with a note appended when the process is killed by a signal.
- Removed the `watch` parameter from the `test.run_*` schemas — `--watch` never exits, which guaranteed a hang.
- `test.run_coverage` now reads the "All files" row of the coverage summary instead of the first percentage anywhere in stdout, which could match an unrelated number.
