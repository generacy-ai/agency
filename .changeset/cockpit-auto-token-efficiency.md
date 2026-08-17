---
"@generacy-ai/claude-plugin-cockpit": minor
---

feat(cockpit): compact the auto playbook, add named analysis subagents with configurable models, quiet mode, and an adaptive heartbeat.

- **Playbook compaction**: `commands/auto.md` is rewritten from ~370 KB (~100k tokens, resident in every request of a run) to a fraction of that. Behavior is preserved — every string pinned by `tests/playbook-verification.test.ts` survives byte-exact; what's removed is spec provenance (`per FR-xxx`), inline rationale, historical notes, and the Examples appendix.
- **Named subagents** (`agents/`): the five analysis hops move from `subagent_type: "general-purpose"` to dedicated agent definitions — `cockpit-clarifier` (D.1), `cockpit-reviewer` (D.2/D.3), `cockpit-validator` (D.4), `cockpit-fixer` (D.6), `cockpit-diagnoser` (D.7/D.11) — each carrying its behavioral contract (grounding rules, prohibitions, strict-JSON return shape). Per-role `model`/`effort` overrides are read once at pre-flight from the `cockpit.auto.agents` block in `.generacy/config.yaml` (see the companion generacy PR) and threaded into each spawn; unset roles inherit the session model, exactly as before.
- **Quiet mode** (`--quiet` flag or `cockpit.auto.quiet: true`): suppresses transcript narration for headless runs — no `[ledger]` echoes (the ledger file is unchanged), no status tables outside gate bodies, run summary posted as a tracking-issue comment instead of printed. No tool-call or gate behavior changes.
- **Adaptive heartbeat**: the C4 belt-and-braces heartbeat starts at `cockpit.auto.heartbeatSeconds` (default 300, unchanged) and doubles after each empty drain up to a 1800 s cap, resetting on any actionable dispatch — cutting idle-epic wake cost ~4–6× while the doorbell remains the primary wake path.
