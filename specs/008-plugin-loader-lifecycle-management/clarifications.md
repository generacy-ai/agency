# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-17 23:22

### Q1: Plugin Failure Isolation
**Context**: The spec defines error handling for plugin failures but doesn't specify isolation boundaries. This affects whether a failing plugin can crash the entire Agency system or only itself.
**Question**: Should plugin failures be isolated (plugin disabled, system continues) or should they propagate (system stops)?
**Options**:
- A: Isolated - failing plugin is disabled, system continues running
- B: Propagate - critical plugin failure stops the system
- C: Configurable per-plugin - plugins marked 'critical' propagate, others isolated

**Answer**: **C** - Configurable per-plugin. Default to isolated (failing plugin disabled, system continues). Plugins can declare `critical: true` in their manifest to propagate failures - necessary for plugins like `humancy` where escalation capability is essential.

### Q2: Hot Reload Support
**Context**: The spec includes unloadPlugin() but doesn't clarify if plugins can be updated while the system runs. This significantly impacts the complexity of state management.
**Question**: Should the plugin loader support hot-reloading (loading new plugin version without full restart)?
**Options**:
- A: No hot-reload - unload/load requires system restart
- B: Basic hot-reload - plugin reloads but loses state
- C: Stateful hot-reload - plugin state preserved across reload

**Answer**: **A** - No hot-reload for initial implementation. Keep it simple - agents operate in dev containers that restart quickly. Stateful hot-reload adds significant complexity around channels, message routing, and plugin state that isn't needed yet. Can be added as a future enhancement.

### Q3: Mode System Definition
**Context**: getCurrentMode() and onModeChange hook reference modes but the spec doesn't define what modes are or their valid values. This is needed to implement the API correctly.
**Question**: What are the valid modes for the mode system? Are these predefined or plugin-extensible?
**Options**:
- A: Predefined modes only (e.g., 'normal', 'debug', 'safe')
- B: Plugin-extensible - plugins can register custom modes
- C: Mode system is out of scope for this issue - use placeholder

**Answer**: **B** - Plugin-extensible. Core modes like "research, coding, review, debug" are predefined, but plugins can register additional modes via their manifest. Third-party plugins defining their own modes is part of the design (e.g., `mode: "speckit"`).

### Q4: Channel Access Control
**Context**: Plugins can register channels and send messages to any channel. Without restrictions, plugins could intercept or inject messages into other plugins' channels.
**Question**: Should channel communication have access controls, or can any plugin access any channel?
**Options**:
- A: Open access - any plugin can use any channel
- B: Ownership - plugins can only send on channels they registered
- C: Permission-based - channels define which plugins can send/receive

**Answer**: **A** - Open access for MVP. The channel system is designed for plugin cooperation, not isolation. Malicious plugins aren't the threat model. Channel ownership is tracked via the `owner` field, so permission-based access can be added later if needed.

### Q5: PluginManifest Source
**Context**: The spec references PluginManifest from generacy-ai/contracts#7 as a dependency. Need to confirm if we import from contracts or define locally.
**Question**: Should PluginManifest be imported from @generacy-ai/contracts or defined locally in agency?
**Options**:
- A: Import from @generacy-ai/contracts (shared schema)
- B: Define locally - contracts dependency not ready yet
- C: Define locally but align with contracts schema for future migration

**Answer**: **C** - Define locally, align with contracts schema. No external dependency blocking this work, future compatibility when contracts is ready, and clear migration path.

