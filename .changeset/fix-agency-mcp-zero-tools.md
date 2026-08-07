---
"@generacy-ai/agency": patch
---

fix(plugins): stop the Agency MCP server from coming up healthy with zero tools.

Three independent defects combined so that `claude mcp list` reported `agency: ✔ Connected` while `tools/list` returned `[]` — leaving speckit slash commands with no `spec_kit.*` tools, so they silently fell back to raw bash.

- **Manifest semver rejected the preview channel.** `SEMVER_PATTERN` used `[\w.]` for the prerelease and build identifiers, but `\w` excludes `-`. The published preview/latest dist-tags are `0.0.0-preview-<timestamp>` — valid semver (§9-10), rejected here — so *every* preview-channel plugin failed validation. Both character classes now allow `-`.
- **Invalid manifests were dropped silently.** `loadFromPath` swallowed validation failures in a bare `catch`, which is what let the semver bug hide behind a healthy connection. Packages matching the plugin name pattern that fail validation now log the reason to stderr.
- **Discovery was entirely cwd-relative.** Search paths were `<cwd>/node_modules` plus configured `pluginPaths`. In a cluster the server runs inside a checkout of the *target* repo, which does not depend on the plugins, so nothing was ever found. Discovery now also scans the directory holding agency's own sibling packages — `…/node_modules/@generacy-ai` for npm installs, `…/packages` for source builds — which resolves correctly in both flavours without per-repo configuration. Results are deduplicated by plugin id, and the fallback is scanned last so configured paths still win.

Also fixes the mode default that hid tools even once discovery worked: the default config exposed a single `default` mode, but mode-scoped plugins declare named modes (`spec-kit` → `["research","coding"]`, `npm` → `["coding","review"]`), so none of their tools matched. Defaults now cover the built-in mode names and start in `coding`, the only built-in mode named by every mode-scoped first-party plugin.

Verified against the real preview packages and a source build: from an unrelated working directory with no `.agency/config.json`, an npm-installed tree now exposes 11 `spec_kit.*` tools (was 0) and a source build exposes all 49 (was 0).
