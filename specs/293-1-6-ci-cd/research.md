# Research: CI/CD for Agency VS Code Extension

## Marketplace Version Check Approaches

### Option A: `vsce show` + JSON parsing

```bash
npx @vscode/vsce show generacy-ai.agency --json 2>/dev/null | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  const versions = data.versions?.map(v => v.version) || [];
  process.exit(versions.includes('$CURRENT_VERSION') ? 0 : 1);
"
```

**Pros**: Uses official `vsce` tooling; JSON output is structured
**Cons**: Requires `vsce` to be installed (it is, as a devDep); `--json` flag may not be available in all `vsce` versions; slow (spawns Node process)

### Option B: Marketplace REST API

```bash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/generacy-ai/vsextensions/agency/$CURRENT_VERSION/vspackage")
if [ "$STATUS" = "200" ]; then
  echo "Version exists"
else
  echo "Version not found"
fi
```

**Pros**: No tooling dependency; fast; simple status code check
**Cons**: Relies on undocumented API endpoint behavior; may redirect or return unexpected codes

### Option C: Gallery Query API (POST)

```bash
curl -s -X POST \
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json;api-version=3.0-preview.1' \
  -d '{
    "filters": [{
      "criteria": [
        {"filterType": 7, "value": "generacy-ai.agency"}
      ]
    }],
    "flags": 0x1
  }' | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    const ext = data.results?.[0]?.extensions?.[0];
    const versions = ext?.versions?.map(v => v.version) || [];
    console.log(JSON.stringify(versions));
    process.exit(versions.includes('$CURRENT_VERSION') ? 0 : 1);
  "
```

**Pros**: Official public API; well-documented
**Cons**: More verbose; POST request with JSON body is harder to maintain in YAML

### Recommendation

Start with Option A (`vsce show`). If it proves unreliable in CI (e.g., `--json` not supported in the installed version), fall back to Option B. Option C is over-engineered for this use case.

**Fallback behavior**: If the version check fails for any reason (network, API change, parsing error), default to attempting the publish. The worst case is a "version already exists" error from `vsce publish`, which is non-blocking.

---

## Changesets + `private: true` Behavior

### How changesets handles `private: true`

From the changesets source code and documentation:

1. **Version bumping**: Changesets reads all workspace packages. If a changeset mentions a private package, the version in its `package.json` is still bumped. The `private` field does not affect version calculation.

2. **Publishing**: During `changeset publish`, packages with `"private": true` are skipped. The publish command checks `pkg.packageJson.private` and logs a skip message.

3. **Internal dependency updates**: If other packages depend on the private package (via `workspace:*`), changesets still updates those dependency ranges according to `updateInternalDependencies` config.

### Verification

After removing from ignore and adding `private: true`:

```bash
# Create a changeset that includes the extension
pnpm changeset
# Select @generacy-ai/agency-extension, choose patch bump

# Version packages (dry run)
pnpm changeset version
# Should bump packages/agency-extension/package.json version

# Publish (dry run)
pnpm changeset publish --dry-run
# Should skip @generacy-ai/agency-extension with "private package" message
```

---

## `vsce publish --pre-release` vs `--pre-release` Flag

### What `--pre-release` does

- Publishes the extension to the **pre-release channel** on the VS Code Marketplace
- Users who opt into pre-release updates receive this version
- The version number is standard semver (e.g., `0.1.0`), not a pre-release semver tag
- VS Code shows a "Switch to Pre-Release Version" button on the extension page
- Pre-release and stable versions can coexist at the same version number

### What `"preview": true` does

- Adds a "Preview" badge to the extension's Marketplace listing page
- Purely informational — does not affect update channels
- Independent of `--pre-release` flag

### Combined behavior

With both `"preview": true` and `--pre-release`:
- Extension shows "Preview" badge on Marketplace
- Users on the pre-release channel get updates from `develop`
- Users on the stable channel get updates from `main`
- Both channels see the "Preview" badge (acceptable while extension is early-stage)

---

## `vsce publish --no-dependencies` Flag

### Why it's used

The extension's `package.json` has npm dependencies (`@modelcontextprotocol/sdk`, `execa`, `zod`). Without `--no-dependencies`, `vsce` would try to resolve these from the npm registry and include them in the VSIX.

However, the extension uses esbuild to bundle all dependencies into a single `dist/extension.js` file. The VSIX doesn't need `node_modules/` — everything is in the bundle. The `.vscodeignore` already excludes `node_modules/**`.

`--no-dependencies` tells `vsce` to skip npm dependency resolution, which:
1. Avoids errors when dependencies aren't available on the public npm registry
2. Keeps the VSIX size small (only the bundle)
3. Matches the esbuild bundling strategy

---

## GitHub Actions `changesets/action@v1` Outputs

### `published` output

- Type: string (`'true'` or `'false'`)
- Set to `'true'` when the action runs the publish command AND packages were actually published
- Set to `'false'` (or not set) when the action creates/updates a version PR
- This is the primary mechanism for distinguishing "version PR created" from "packages published"

### `publishedPackages` output

- Type: JSON string (array of `{ name, version }` objects)
- Lists all packages that were published
- Empty array when no packages were published
- Could be used to conditionally publish the extension only if it was included in the changeset, but since the extension is `private: true`, it won't appear here. The extension publish should trigger on ANY publish (since the extension version was bumped in the same version PR).

### Usage pattern

```yaml
- name: Create Release PR or Publish
  id: changesets
  uses: changesets/action@v1
  with:
    publish: pnpm changeset publish --provenance

- name: Publish extension
  if: steps.changesets.outputs.published == 'true'
  run: vsce publish --no-dependencies
```
