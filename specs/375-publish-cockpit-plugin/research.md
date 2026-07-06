# Research: Publish claude-plugin-cockpit

## Decisions

### D1: Use pnpm's `files` whitelist to control tarball contents

**Decision**: `"files": ["commands", ".claude-plugin", "README.md"]` in `package.json`.

**Rationale**:
- FR-002 mandates this exact whitelist.
- Explicit whitelist beats `.npmignore`: reviewers can see the full published surface in one place.
- `package.json` is always included by npm regardless of the `files` field, so it is implicitly published.
- `README.md` is *not* auto-included when `files` is set (npm only auto-includes `package.json`, `README*`, `LICENSE*`, `LICENCE*` in some tooling but pnpm follows npm's stricter behavior when `files` is explicit); listing it explicitly is the safe choice.

**Alternatives considered**:
- `.npmignore` with everything excluded except the three paths — more surface area for mistakes, harder to review.
- No `files` field (publish everything under the package dir) — leaks `.turbo/`, `node_modules/`, tsconfig-style files, and any local scratch directories; unacceptable.

### D2: No build step; ship static files as-is

**Decision**: Do not add a `build` script. Do not add `type`, `main`, `module`, `types`, `exports`, or `bin`.

**Rationale**:
- FR-003 explicitly requires no build step.
- The package has no JS/TS entry point — consumers install it to get the `commands/` markdown and `.claude-plugin/plugin.json` on disk. Nothing is `require`/`import`-ed from `@generacy-ai/claude-plugin-cockpit`.
- Sibling `agency-plugin-spec-kit` has all those fields because it ships compiled TypeScript. Cockpit does not.

**Alternatives considered**:
- Adding a stub `build` script (`"build": "true"`) to keep parity with sibling. Rejected as noise. If root `pnpm build` needs it, add during `/tasks` — see the risk table in `plan.md`.
- Mirroring sibling's shape with placeholder fields (option C in Q3). Rejected: creates confusion about whether the package has runtime code.

### D3: Set `publishConfig.access: "public"` explicitly

**Decision**: Include `"publishConfig": { "access": "public" }` in `package.json`.

**Rationale**:
- FR-004 requires it.
- Scoped npm packages default to *private* on `npm publish` unless overridden. The Changesets config already sets `access: "public"`, but redundancy here is cheap insurance against a hand-run `npm publish`.

### D4: Version `0.0.0` + minor changeset for first preview at `0.1.0`

**Decision** (default pending Q1): Start with `"version": "0.0.0"` and add a **minor** changeset.

**Rationale**:
- Convention across many Changesets-managed repos: `0.0.0` marks "never published"; the first bump determines the initial semver.
- Minor bump → `0.1.0`, which the spec's Assumption already accepts.
- Avoids the confusing outcome where `version: "0.1.0"` + a patch bump publishes `0.1.1` as the *first* release.

**Alternatives considered**:
- Version `0.1.0` + patch → first publish `0.1.1`. Rejected: first published version should not be a patch of a phantom `0.1.0`.
- Version `1.0.0` + minor mirror sibling → first publish `1.1.0`. Rejected: signals API stability the plugin does not yet claim.

### D5: Omit the `agency` metadata block

**Decision** (default pending Q2): Do not add an `agency` block.

**Rationale**:
- Cockpit is a Claude Code plugin (surface: `commands/*.md` and `.claude-plugin/plugin.json`). Identity for Claude Code is carried by `.claude-plugin/plugin.json`.
- Sibling `agency-plugin-spec-kit` needs the block because the Agency runtime loads it via package.json discovery. Cockpit does not integrate with the Agency runtime.
- Adding it would falsely advertise cockpit as an Agency plugin and could cause a runtime discovery pass to try to load it.

### D6: Update README as part of this feature

**Decision** (default pending Q4): Replace the manual `extraKnownMarketplaces` install step with an npm install path.

**Rationale**:
- SC-003 measures success by "Documented in README + confirmed by cluster setup dry-run". Shipping a preview with stale install instructions defeats SC-003.
- README edit is small, isolated, and inside the allowed edit window (FR-006 permits any file under `packages/claude-plugin-cockpit/` and only forbids `commands/*.md`).

### D7: Verify acceptance against the packed tarball, not the source tree

**Decision**: SC-001 / FR-007 is checked by running `pnpm pack` and inspecting the tarball (via `tar tzf` on the output or `pnpm pack --dry-run`).

**Rationale**:
- pnpm rewrites paths at pack time (workspace deps, some hoisting). Trusting the source layout can mask bugs where a listed file is silently excluded.
- The published npm tarball is the artifact users install — that is what acceptance must reflect.

## Implementation Patterns

### Pattern: Changeset entry for a new package

Frontmatter names the package and bump type; body is a one-line release note. Filename is a stable slug (typos here are cosmetic; the file will be consumed and deleted by Changesets on release).

```markdown
---
"@generacy-ai/claude-plugin-cockpit": minor
---

Initial preview release of the cockpit Claude Code plugin, delivering the /cockpit:* commands (clarify, merge, queue, review, status, watch) via npm.
```

### Pattern: Verifying tarball contents locally

```bash
cd packages/claude-plugin-cockpit
pnpm pack --dry-run   # lists files without producing a tarball
# OR
pnpm pack             # writes generacy-ai-claude-plugin-cockpit-<version>.tgz
tar tzf generacy-ai-claude-plugin-cockpit-*.tgz | sort
```

Expected output (order may vary):

```
package/.claude-plugin/plugin.json
package/README.md
package/commands/clarify.md
package/commands/merge.md
package/commands/queue.md
package/commands/review.md
package/commands/status.md
package/commands/watch.md
package/package.json
```

## Key References

- Sibling `packages/agency-plugin-spec-kit/package.json` — shape for `repository`, `publishConfig`, `author`, `license`.
- `.github/workflows/publish-preview.yml` — the workflow that consumes non-private workspace packages and the changeset.
- `.changeset/config.json` — baseBranch, access, ignore list.
- npm docs on `files` and `publishConfig` — semantics of the whitelist and scoped-publish access default.
- Changesets docs on `--snapshot preview` / `--tag preview` — semantics of the preview dist-tag used by the workflow.
