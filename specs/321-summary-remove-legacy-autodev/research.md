# Research: Remove Legacy Autodev References

## Technology Decisions

### Decision: Replace `/autodev:*` with `/speckit:*` (not remove entirely)

**Rationale**: The "Post-Command Check" sections in command markdown files serve a real purpose — they instruct the AI agent to check for remaining workflow steps when a command is invoked as part of a larger pipeline. The `/autodev:start` and `/autodev:continue` commands were the predecessors of the current speckit workflow. Replacing with `/speckit:start` and `/speckit:continue` preserves the intended behavior while removing the stale references.

**Alternative considered**: Removing the autodev references entirely without replacement. Rejected because the workflow integration instructions are still valuable for the speckit pipeline.

### Decision: Keep historical spec markdown references

**Rationale**: Files under `specs/` are historical records of past feature specifications. Modifying them would alter the project history without functional benefit. The spec explicitly excludes these from scope.

## Implementation Patterns

### Pattern: Bulk string replacement in markdown files

Both plugin packages (`claude-plugin-agency-spec-kit` and `agency-plugin-spec-kit`) contain identical command markdown files. The same replacements apply to both sets. The consistent pattern across files enables systematic find-and-replace.

### Pattern: Two distinct replacement patterns

1. **Workflow example references**: `/autodev:start` → `/speckit:start`, `/autodev:continue` → `/speckit:continue`
2. **Prose references**: "autodev workflow" → "speckit workflow" (only in `clarify.md`)

## Key Observations

- `.generacy/config.yaml` doesn't exist as a single file — the directory contains `speckit-bugfix.yaml` and `speckit-feature.yaml` templates instead. The spec's mention of `.generacy/config.yaml` is conceptual rather than literal.
- The two plugin packages (`claude-plugin-agency-spec-kit` and `agency-plugin-spec-kit`) appear to be parallel implementations with identical command content.
