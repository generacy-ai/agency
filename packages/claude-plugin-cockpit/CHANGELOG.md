# @generacy-ai/claude-plugin-cockpit

## 0.1.0

### Minor Changes

- c0548f6: New package: publish the cockpit Claude Code plugin to npm so cluster setup can
  deliver the `/cockpit:*` commands without the manual marketplace step (#374).
  Ships the six command playbooks, `.claude-plugin/plugin.json`, and README as
  static files — no build step, no runtime code. First release is 0.1.0.
