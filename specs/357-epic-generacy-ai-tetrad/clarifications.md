# Clarifications: /cockpit:breakdown command

**Issue**: generacy-ai/agency#357
**Branch**: 357-epic-generacy-ai-tetrad

## Batch 1 — 2026-06-29

### Q1: Engine invocation contract
**Context**: FR-006 says "on approval, call `generacy cockpit manifest` with the approved decomposition." The slash command (`breakdown.md`) needs a concrete way to hand the approved phase + issue list to the engine — without it we can't write the invocation in the playbook, and it determines what schema/shape the proposal must be drafted in.
**Question**: How does the slash command pass the approved decomposition to `generacy cockpit manifest`?
**Options**:
- A: As CLI flags / positional args (e.g., `generacy cockpit manifest <epic-ref> --phases ...`).
- B: As JSON on stdin (slash command pipes a `{phases:[...]}` doc to the CLI; engine validates schema).
- C: As a file path (slash command writes proposal JSON to a temp file and passes the path; engine reads + writes manifest).

**Answer**: Via the epic doc, not a direct data pass. `breakdown` writes the approved decomposition as the bounded section (see Q2) into the epic doc, then calls `generacy cockpit manifest init/sync <epic-ref>`, which parses that section using tetrad-development#790's grammar. One source of truth — no second JSON schema to maintain. This refines FR-006's "call manifest with the decomposition" — the decomposition travels through the doc, not as a separate argument.

### Q2: Doc section markers
**Context**: FR-007 says the appended phase-decomposition section is "bounded by stable HTML comment markers" so re-runs replace the section idempotently. SC-002 (no-op re-run = empty diff) and US3 (in-place replace) both depend on these markers being deterministic and exact. The marker strings are not specified.
**Question**: What exact HTML comment markers should bound the phase-decomposition section in the epic doc?
**Options**:
- A: `<!-- cockpit:breakdown:start -->` … `<!-- cockpit:breakdown:end -->` (verb-scoped).
- B: `<!-- cockpit:phase-decomposition:start -->` … `<!-- cockpit:phase-decomposition:end -->` (section-scoped, verb-agnostic).
- C: `<!-- generacy:manifest:start id="<epic-ref>" -->` … `<!-- generacy:manifest:end -->` (engine-scoped, includes epic ref).

**Answer**: B — `<!-- cockpit:phase-decomposition:start -->` … `<!-- cockpit:phase-decomposition:end -->`. Section-scoped and verb-agnostic, so `manifest` (or any future tool) can find and replace it regardless of which verb wrote it.

### Q3: Edit affordance during review
**Context**: FR-005 says "present the proposal for developer approval (approve / edit / reject) before any write." The shape of the "edit" path determines a large slice of the command's UX and prompt body. Without nailing it down we can't implement the review loop.
**Question**: When the developer chooses "edit," how do they edit the proposal?
**Options**:
- A: Free-form chat — the assistant re-drafts based on the developer's natural-language feedback, then re-presents for approve/edit/reject.
- B: File-based — the assistant writes the proposal to a temp file (e.g., proposal.yaml), the developer edits and saves, the assistant re-reads and re-presents.
- C: Structured re-prompt — the assistant asks targeted questions (add/remove phase? rename? move issue?) and applies discrete edits one at a time.

**Answer**: A — Free-form chat. The assistant re-drafts from the developer's natural-language feedback and re-presents for approve/edit/reject. (This is how this epic's breakdown was iterated.)

### Q4: Doc section placement
**Context**: FR-007 says "append a phase-decomposition section to the epic doc," but on re-run (US3) the section must be replaced in place between its markers. For first-run placement, "append" is literal end-of-file in option A, after a specific anchor in option B, or engine-decided in option C — and the choice affects how the doc reads to humans.
**Question**: On the first run (no existing markers), where in the epic doc is the phase-decomposition section inserted?
**Options**:
- A: At end of file (append literally; subsequent re-runs replace between the markers wherever they ended up).
- B: After a known anchor heading (e.g., immediately after a `## Phases` or `## Plan` heading if present; else end of file).
- C: The engine returns the splice point; the slash command writes wherever the engine says.

**Answer**: A — First run appends at end of file. The stable markers (Q2) make subsequent in-place replacement deterministic wherever the section ends up.

### Q5: Phase ID convention
**Context**: FR-004 specifies "ordered phases (id, title, summary)" in the proposal. The phase `id` is used in both the manifest (machine-read) and the doc section (human-read), and downstream `/cockpit:*` verbs will reference these ids. Without a fixed convention, the assistant's drafts will be inconsistent across runs/repos.
**Question**: What format should phase IDs use in the proposal and manifest?
**Options**:
- A: Sequential short codes (`P1`, `P2`, …) matching the convention used by parent epic docs (e.g., this issue's `P4`).
- B: Kebab-case slugs derived from the phase title (e.g., `foundations`, `manifest-writer`).
- C: Engine-assigned — the slash command leaves `id` blank in the proposal and `generacy cockpit manifest` (G3.1) fills it according to its own convention.

**Answer**: A — Sequential `P1`/`P2`/… short codes, matching the parent epic docs and tetrad-development#790's phase identity (the `P<n>` prefix is the stable phase id).
