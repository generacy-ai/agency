# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-31 18:35

### Q1: Branch Naming Format
**Context**: The tool needs to generate branch names, but the format isn't clearly defined. The spec shows `feature/XXX_short-name` in tool definition but current branch is `153-b4-implement-create-feature`.
**Question**: What branch naming format should be used?
**Options**:
- A: feature/{number}_{slug} (e.g., feature/153_create-feature)
- B: {number}-{slug} (e.g., 153-create-feature)
- C: Configurable via speckit config with a default pattern

**Answer**: *Pending*

### Q2: Auto-Numbering Strategy
**Context**: The tool should auto-assign feature numbers when not provided explicitly. This affects how we avoid collisions.
**Question**: How should the tool determine the next feature number?
**Options**:
- A: Scan existing branches (local + remote) and find max + 1
- B: Scan spec directories (specs/*) and find max + 1
- C: Both branches and directories, taking the higher max

**Answer**: *Pending*

### Q3: Subdirectory Creation
**Context**: The directory structure shows checklists/ and contracts/ subdirectories. Creating empty directories that may never be used adds clutter.
**Question**: Should checklists/ and contracts/ subdirectories be created immediately or lazily when needed?
**Options**:
- A: Create all subdirectories immediately with directory structure
- B: Only create spec.md, add subdirectories when first needed

**Answer**: *Pending*

### Q4: Template Source Location
**Context**: spec.md needs to be initialized from a template. The template location affects portability and customization.
**Question**: Where should the spec.md template be sourced from?
**Options**:
- A: Bundled with speckit package (default template)
- B: User's project templates/ directory if exists, else bundled default
- C: Configurable path in speckit config with fallback to bundled

**Answer**: *Pending*

### Q5: Epic Child Behavior
**Context**: When parent_epic_branch is provided, the new feature is a child of an epic. This may affect naming and directory organization.
**Question**: Should epic children use a different branch/directory naming scheme to indicate parent relationship?
**Options**:
- A: Same naming as regular features, relationship tracked only in spec.md
- B: Prefix with parent number (e.g., 139-153-child-feature)
- C: Subdirectory under parent (e.g., specs/139-parent/153-child/)

**Answer**: *Pending*

