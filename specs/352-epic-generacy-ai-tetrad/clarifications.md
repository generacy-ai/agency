# Clarifications

## Batch 1 — 2026-06-26

### Q1: Slash command vs. CLI rendering responsibility
**Context**: FR-003 says the slash command "renders the CLI output as a readable epic dashboard (phase grouping, per-child state, dependency / blocker flags)", but the Assumptions section says "The dashboard rendering is the CLI's responsibility; this command's responsibility is invocation, argument plumbing, and surfacing errors." Implementation will look very different depending on which is true: pure passthrough is a few lines of markdown; transforming/highlighting requires parsing the CLI output.
**Question**: What rendering work does `status.md` itself do on top of the CLI output?
**Options**:
- A: Pure passthrough — print whatever the CLI emits verbatim, no transformation.
- B: Wrap CLI output in a fenced code block so it renders as a monospaced dashboard in Claude Code.
- C: Light post-processing — e.g., highlight blocked items, add a one-line header, but don't re-render structure.
- D: Parse a structured (e.g., JSON) CLI output and re-render as markdown in the slash command.

**Answer**: B. Wrap the CLI output in a fenced code block so it renders monospaced in Claude Code (optionally with a one-line header). Structure/decoration stays in the CLI.

### Q2: CLI output format contract
**Context**: This command is a wrapper around `generacy cockpit status` (G1.1 / generacy#787). The output shape the CLI emits determines whether `status.md` can just pipe it through or needs to parse it. The spec doesn't pin this down, and G1.1 hasn't landed.
**Question**: What output format will `generacy cockpit status` emit that `/cockpit:status` should rely on?
**Options**:
- A: Pre-formatted human-readable text (already grouped/decorated by the CLI).
- B: Plain markdown (tables, headings) the CLI already produces.
- C: Structured JSON the slash command renders.
- D: Both — CLI defaults to text, supports `--json` for structured; slash command picks one.

**Answer**: D. `generacy cockpit status` defaults to human-readable text and supports `--json` (per #787 FR-013). This command uses the text form.

### Q3: No-argument epic resolution
**Context**: FR-005 / US2 say that with no arguments, the command should "infer the epic from the current branch / spec directory". The current branch convention is `<issue#>-<slug>` (e.g. `352-epic-generacy-ai-tetrad`), where the issue is a child of the epic — not the epic itself. So branch alone doesn't yield the epic ref; some lookup is required.
**Question**: How should `/cockpit:status` (no args) resolve the epic ref?
**Options**:
- A: Read the spec.md of the current branch and parse the `**Epic**:` line (e.g. `generacy-ai/tetrad-development#85`).
- B: Defer entirely to the CLI's own resolution logic (`generacy cockpit status` with no arg).
- C: Look for a local config file (e.g. `.cockpit.yml`) declaring the active epic.
- D: Print a list of known epics from the marketplace/plugin config and ask the user to pick.

**Answer**: A. Parse the current branch's `spec.md` `**Epic**:` line (e.g. `generacy-ai/tetrad-development#85`); fall back to the single epic under `.generacy/epics/` if not on a child branch.

### Q4: Default repository for `#N` shorthand
**Context**: FR-004 accepts three argument shapes: `owner/repo#N`, `#N`, or URL. The bare `#N` form is ambiguous — which repo does it resolve against? This matters because epics live in `generacy-ai/tetrad-development`, while this plugin ships from `generacy-ai/agency`.
**Question**: When the user passes only `#N` (no owner/repo), what repo should be used?
**Options**:
- A: The repo of the current git working directory (`git remote get-url origin`).
- B: A fixed default — `generacy-ai/tetrad-development` (epic repo).
- C: Whatever the underlying CLI defaults to — the slash command doesn't reinterpret.
- D: Reject `#N` without owner/repo and print a usage hint.

**Answer**: C. Don't reinterpret `#N` — pass it through to the CLI/engine resolver (consistent with #788).

### Q5: Error UX when CLI is missing or fails
**Context**: FR-006 / AC say errors must be "actionable" and "must not silently no-op", but don't specify what actionable means in practice — particularly for the "CLI not installed" case which is likely the most common failure for early adopters.
**Question**: For each failure mode, what should the command surface to the user?
**Options**:
- A: Raw stderr from the CLI, unmodified.
- B: Raw stderr plus a one-line hint with the recommended next step (e.g. install command, doc link).
- C: Detect specific failures (binary missing, auth failure, unknown epic) and emit tailored messages for each.
- D: B for missing binary, C-style detection for auth/unknown-epic.

**Answer**: D. Tailored messages for the common failures (missing binary → install hint; auth failure → `gh auth` hint; unknown epic → guidance); raw stderr otherwise. Never silently no-op.
