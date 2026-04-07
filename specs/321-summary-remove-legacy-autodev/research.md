# Research: Remove Legacy Autodev References

## Technology Decisions

### Decision: Remove `/autodev:*` references entirely (per clarification Q1, answer B)

**Rationale**: The `/autodev:start` and `/autodev:continue` commands don't exist in the codebase — they are stale references to a deprecated workflow system. Per clarification Q1 (option B), these references should be removed entirely rather than replaced with `/speckit:*` equivalents. The "Post-Command Check" sections themselves remain valid for detecting parent workflow context, but the specific autodev command examples are removed.

**Alternative considered**: Replacing with `/speckit:start` and `/speckit:continue`. Not chosen because these specific commands also don't exist as registered commands — the workflow mechanism has been restructured.

### Decision: Keep historical spec markdown references

**Rationale**: Files under `specs/` are historical records of past feature specifications. Modifying them would alter the project history without functional benefit. The spec explicitly excludes these from scope.

## Implementation Patterns

### Pattern: Targeted removal in markdown files

Both plugin packages (`claude-plugin-agency-spec-kit` and `agency-plugin-spec-kit`) contain command markdown files with "Post-Command Check" sections. The stale `/autodev:*` command references and "autodev workflow" prose are removed from these sections across both packages.

### Pattern: Two categories of references to remove

1. **Command references**: `/autodev:start` and `/autodev:continue` examples in "Post-Command Check" sections
2. **Prose references**: "autodev workflow" (only in `clarify.md`)

## Key Observations

- `.generacy/config.yaml` doesn't exist as a single file — the directory contains `speckit-bugfix.yaml` and `speckit-feature.yaml` templates instead. The spec's mention of `.generacy/config.yaml` is conceptual rather than literal.
- The two plugin packages (`claude-plugin-agency-spec-kit` and `agency-plugin-spec-kit`) appear to be parallel implementations with identical command content.
