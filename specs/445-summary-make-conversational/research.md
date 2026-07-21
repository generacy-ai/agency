# Research: `/cockpit:auto` conversational entry-point discoverability (#445)

## Question 1 — Where does the offer-guidance content need to live so future Claude sessions consistently apply it?

**Decision**: Inside `commands/auto.md` as a dedicated `## Offering auto` H2 section, plus a mirrored section in `README.md` for human readers that points back to the auto.md section.

**Rationale**: Claude Code auto-consumes `commands/*.md` on plugin install (skill descriptions + full playbook body land in the session's tool binding). A section inside `auto.md` therefore travels wherever `/cockpit:auto` is available — this is the only surface guaranteed to be in-context whenever a session might reasonably offer the command. README-only is not enough: README is only in context when a human explicitly opens it (or the session reads it).

**Alternatives considered**:

- **A new `commands/offer-auto.md`** — REJECTED. Verified against the plugin's current `commands/` directory: every `commands/*.md` in this plugin registers as a slash command (the plugin's seven existing files each surface as `/cockpit:<name>`). A new `offer-auto.md` would create a spurious `/cockpit:offer-auto` command the operator never asked for. Q1 rejects this option for the same reason.
- **Plugin-level `CLAUDE.md`** — REJECTED. The plugin has no `CLAUDE.md` today, and introducing one to carry one guidance section adds a new surface that would need to be maintained separately from the command's own playbook. Keeping the guidance inside `auto.md` co-locates it with the machinery it describes.
- **README-only** — REJECTED. Session-context guarantees are weaker; the guidance would only fire when the reader (human or model) walks through the README.

**Source**: spec Q1 clarification (2026-07-21 batch), `packages/claude-plugin-cockpit/commands/` directory listing.

## Question 2 — What edit does `plugin.json` need?

**Decision**: Edit only the plugin-level `description` field to mention issue-list invocation (e.g. append or rewrite to include "…for speckit epics or ad-hoc issue lists"). Do not introduce a `commands` array.

**Rationale**: The Claude Code plugin schema for `plugin.json` today accepts plugin-level `name`, `description`, and `author` — no per-command metadata slot exists. Per-command descriptions live in each `commands/*.md` file's frontmatter. Adding a `commands` array to `plugin.json` would either be silently ignored (no schema recognition) or actively confuse future tooling. The Q2 clarification confirms: the correct surface for per-command description drift is the command file's frontmatter, which is covered by the auto.md edit; `plugin.json` gets one string change.

**Alternatives considered**:

- **Introduce a `commands` array in `plugin.json`** — REJECTED. Invents a schema Claude Code does not read.
- **Skip `plugin.json` entirely** — REJECTED. The plugin-level description IS one of the surfaces that lists this plugin's purpose; leaving it as "for speckit epics" understates what the plugin now does.

**Source**: spec Q2 clarification (2026-07-21 batch), current `packages/claude-plugin-cockpit/.claude-plugin/plugin.json`.

## Question 3 — What trigger condition should the offer-guidance describe?

**Decision**: Any 1+ issues successfully filed to the workspace's repo during the current session, regardless of who drafted the text.

**Rationale**: Simplest rule to state and follow. The offer is cheap (one prose sentence) and confirmation-gated (developer must say yes). An occasional unwanted offer costs one "no". Provenance filters ("only when Claude drafted the body") add judgment calls a session has to make from context that may be lost across turns. Content heuristics ("only issues with bug labels or repro steps") add another judgment layer that will misfire on styling variation.

**Alternatives considered**:

- **Claude-drafted-only trigger** — REJECTED. Requires session bookkeeping across turns and misses the common case where a developer pastes `gh issue create` output after their own investigation.
- **Content-heuristic trigger (labels / repro steps)** — REJECTED. Style variation across teams means a rule like "must have a `bug` label" would silently miss legitimate cases; the offer's low cost doesn't justify the miss.

**Source**: spec Q3 clarification (2026-07-21 batch).

## Question 4 — Should offer wording be prescribed?

**Decision**: Suggested phrasing plus three hard invariants — MUST include the concrete resolved issue-number list; MUST be a confirmation-gated suggestion (never auto-run); SHOULD fire at most once per batch of filed issues.

**Rationale**: An exact template goes stale when syntax evolves (e.g., if `/cockpit:auto` grows a new flag, or the invocation form changes). Leaving wording entirely freeform loses the invariants that matter — a placeholder-numbered offer ("want me to run `/cockpit:auto <n>` on these?") is broken; an auto-run without confirmation is a safety violation; a session that re-nags after the operator declines is annoying. Rules-plus-suggestion strikes the balance.

**Alternatives considered**:

- **Exact template** — REJECTED. Brittle to future syntax changes.
- **Only when-to-offer, no wording guidance** — REJECTED. Loses the three invariants.

**Source**: spec Q4 clarification (2026-07-21 batch).

## Question 5 — What existing surfaces does the "mid-run add-issue" flow already document, and what does README need to add?

**Findings**: `commands/auto.md § Add-issue flow (mid-run)` (starts around auto.md:608) already fully documents:

- Add-existing intent recognition (parseAddExistingIntent, "also process X" phrasing tolerant list).
- File-new intent recognition (parseFileNewIntent, "file an issue for X" phrasing tolerant list).
- The two-path split — add-existing has no gate, file-new lands on G.6.
- Multiple-refs-in-one-message rule (first parseable ref wins).
- Restart safety (scope mutations reflected on the tracking issue's task list).

**Decision**: README does not re-document the mechanics. README shows the developer-visible surface — a one-line example per path (add-existing "also process #226"; file-new "file an issue for the flaky test in X") — and points to the `auto.md § Add-issue flow (mid-run)` section as the source of truth for the parsing rules and gate behavior.

**Rationale**: Avoids doc drift between README and auto.md. The playbook prose is the operational source of truth; README is the how-do-I-get-started surface.

**Source**: `packages/claude-plugin-cockpit/commands/auto.md § Add-issue flow (mid-run)`.

## Question 6 — What is the concrete concurrency caveat for multi-conversation usage?

**Findings**: Per spec § Proposed change item 2: multi-conversation sessions "watch in parallel, implementation is serialized" — each cluster runs a single worker per user, and issues from concurrent auto sessions interleave through that single worker.

**Decision**: The README `### Running multiple conversations` section should state:

- Concurrent sessions with different issue sets are supported (each has its own tracking ref and ledger).
- Implementation of the queued work interleaves through a single cluster worker per user — the *watch* / dispatch loops run in parallel across sessions, but the actual issue-processing runs one at a time on the cluster.

**Rationale**: Developers who kick off two sessions expecting 2× throughput need to understand they get parallel *observability* but serialized *execution*. Silence on this point creates a foot-gun.

**Source**: spec § Proposed change item 2c, spec § Acceptance criteria "README documents multi-conversation usage and the single-worker interleaving caveat".

## Question 7 — Which pinning tests may need to be re-pinned?

**Findings**: `tests/playbook-verification.test.ts` (2569 lines) pins `commands/*.md` playbooks by:

- Exact heading strings (`extractSubheadingBlock`, `extractH3Sections`, `parseSections`) — the new `## Offering auto` H2 section adds a new heading but does not rename or remove any existing one. The 402 audit `findGateSections` filter matches only `G.\d(a|b|c|d)?` gate headings; the 403 audit greps for D.9/D.9d headings. **Neither should trigger on a new H2.**
- Frontmatter description text — no existing pin greps `description:` in auto.md or plugin.json today (verified via `Grep description|Drive an epic` — matches are prose citations, not frontmatter pins).
- Playbook file sweep (`readdirSync(COMMANDS_DIR)`) at 398-1 — greps for `generacy cockpit <verb>` invocations; unrelated to frontmatter or new H2 sections.

**Decision**: No pinning changes are anticipated for the current auto.md edit shape. **Implementation MUST run the test suite before merge** — if any assertion fails against the new prose, re-pin in the same PR per the `CLAUDE.md` rule. Do NOT weaken or delete assertions.

**Rationale**: Pins are a drift audit, not a smoke test. Per `CLAUDE.md`: "the correct response is to re-pin the assertion to the NEW contract in the same PR."

**Source**: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`, `CLAUDE.md § Cockpit playbook pins`.
