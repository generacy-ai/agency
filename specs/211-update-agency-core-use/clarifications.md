# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-02-04 20:17

### Q1: Latency Package Availability
**Context**: The spec depends on @generacy-ai/latency, but it doesn't exist in the Agency monorepo yet. The issue states it's 'blocked by latency#28 (publish packages)'. Implementation cannot proceed without this package.
**Question**: Is @generacy-ai/latency published and available to install, or should this issue be deferred until latency#28 is complete? If available, what version should be used?
**Options**:
- A: Package is published — provide version/registry info
- B: Not yet published — defer this issue until latency#28 completes
- C: Use a local/workspace link to the latency repo for development

**Answer**: *Pending*

### Q2: Facets vs Existing Plugin System
**Context**: Agency already has a mature plugin system with PluginManifest (id, dependencies[], tools[], modes[], channels[]), AgencyCoreAPI, DependencyResolver (topological sort), and channel-based inter-plugin communication. The spec proposes adding facet-based provides/requires but doesn't explain how facets relate to the existing dependency and channel systems.
**Question**: Should facets replace the existing dependencies[] array and channel system, extend them as an additional mechanism, or wrap them with a new API layer?
**Options**:
- A: Replace — facets supersede dependencies[] and channels for all inter-plugin contracts
- B: Extend — facets are added alongside existing dependencies[] for capability-based resolution
- C: Wrap — facets are a higher-level API on top of the existing channel/dependency system

**Answer**: *Pending*

### Q3: Scope of Plugin Changes
**Context**: Six plugins exist: npm, git, docker, firebase, humancy, and spec-kit. The spec says 'update existing plugins to declare facet manifests' but doesn't specify which plugins provide or require which facets. Some plugins (npm, git, docker) are self-contained tool providers, while others (humancy) integrate with external services.
**Question**: Should all six existing plugins be updated with facet manifests, or only plugins that have cross-plugin dependencies? Which specific facets should each plugin declare?

**Answer**: *Pending*

### Q4: AgencyPluginContext Design
**Context**: The spec shows an AgencyPluginContext with provide() and registerTool() methods. Agency already has AgencyCoreAPI with registerTool(), registerChannel(), getConfig(), etc. The relationship between AgencyPluginContext and the existing AgencyCoreAPI is undefined.
**Question**: Should AgencyPluginContext be a new interface replacing AgencyCoreAPI, an extension of AgencyCoreAPI with added facet methods, or a wrapper that delegates to AgencyCoreAPI?
**Options**:
- A: Replace AgencyCoreAPI with AgencyPluginContext entirely
- B: Extend AgencyCoreAPI — add provide()/require() methods to the existing interface
- C: Separate concern — AgencyPluginContext wraps AgencyCoreAPI, adding only facet-specific methods

**Answer**: *Pending*

### Q5: Backward Compatibility Strategy
**Context**: The spec requires 'existing functionality preserved (no regressions)' but proposes changing the fundamental plugin registration model. Plugins currently use AgencyPlugin interface with initialize(core: AgencyCoreAPI). The before/after example shows a significant API change.
**Question**: Should the migration be incremental (support both old and new plugin APIs simultaneously) or a one-time breaking change within the monorepo? Are there external consumers of the plugin API that need backward compatibility?
**Options**:
- A: Incremental — support both APIs with deprecation warnings on old patterns
- B: Breaking change — update all plugins at once since they're all in-repo
- C: Adapter pattern — old plugins work via an adapter, new plugins use facets natively

**Answer**: *Pending*

