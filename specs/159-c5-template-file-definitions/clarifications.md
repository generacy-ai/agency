# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-31 19:26

### Q1: Template Variable Substitution
**Context**: The spec defines template variables ({{feature_name}}, {{date}}) but doesn't specify when/how substitution occurs. This affects whether copy_template or resolveTemplate handles substitution.
**Question**: Should template variable substitution happen during template copy, during template resolution, or as a separate explicit step?
**Options**:
- A: During copy_template - substitute when copying template to feature directory
- B: During resolveTemplate - substitute when template content is loaded
- C: Separate step - provide a substituteVariables function, caller decides when

**Answer**: *Pending*

### Q2: Template Content Source
**Context**: The existing copy-template.ts reads templates from filesystem files (spec-template.md, etc.). The spec proposes TEMPLATES object with inline defaultContent strings. These are incompatible approaches.
**Question**: Should templates use filesystem files (current approach) or embedded defaultContent strings (spec proposal)?
**Options**:
- A: Filesystem files - keep current approach, this feature defines default content for missing files
- B: Embedded strings - change to inline content, remove dependency on template files
- C: Hybrid - try filesystem first, fall back to embedded defaults (like spec's resolveTemplate)

**Answer**: *Pending*

### Q3: Integration with copy-template.ts
**Context**: copy-template.ts already has TEMPLATE_MAPPINGS with similar structure (sourceFile, getDestination). The spec proposes TEMPLATES with overlapping but different structure.
**Question**: Should this feature refactor copy-template.ts to use the new templates/index.ts, or should they be separate concerns?
**Options**:
- A: Refactor copy-template - make it import from templates/index.ts and reuse definitions
- B: Separate concerns - templates/index.ts for defaults only, copy-template keeps its mappings
- C: Full consolidation - move all template logic into src/templates/, deprecate old approach

**Answer**: *Pending*

### Q4: Default Content for All Templates
**Context**: The spec shows complete default content only for 'spec' template. Plan, tasks, checklist, and agent-file show '/* ... */'. Implementation needs actual content.
**Question**: Should I derive default content from existing template files in the repo, or do you want to provide specific default content?
**Options**:
- A: Derive from existing - use content from .specify/templates/* as defaults
- B: Provide content - I will provide specific content in an updated spec
- C: Minimal placeholders - use minimal generic content, expect customization

**Answer**: *Pending*

