# Publishing Guide

This document describes how to publish the Agency VS Code Extension to the marketplace.

## Prerequisites

### 1. Visual Studio Marketplace Publisher Account

1. Go to [Visual Studio Marketplace Publisher Management](https://marketplace.visualstudio.com/manage)
2. Sign in with your Microsoft/GitHub account
3. Create a publisher with ID `generacy-ai` (if not exists)
4. Generate a Personal Access Token (PAT):
   - Go to Azure DevOps: https://dev.azure.com/
   - Click on your profile → Security → Personal Access Tokens
   - Create new token with:
     - Name: `VS Code Extension Publishing`
     - Organization: All accessible organizations
     - Scopes: **Marketplace** → **Manage**
   - Copy the PAT (you won't see it again!)

### 2. GitHub Repository Secrets

Add the PAT as a repository secret:
1. Go to repository Settings → Secrets and variables → Actions
2. Create new secret:
   - Name: `VSCE_PAT`
   - Value: Your PAT from step 1

### 3. Extension Icon

Before publishing, convert the SVG icon to PNG:
```bash
cd packages/agency-extension/media
# Convert icon.png.svg to icon.png (128x128)
# You can use tools like:
# - Inkscape: inkscape icon.png.svg --export-filename=icon.png -w 128 -h 128
# - ImageMagick: convert -background none icon.png.svg -resize 128x128 icon.png
# - Online tool: https://cloudconvert.com/svg-to-png
```

## Publishing Methods

### Method 1: Automated via GitHub Actions (Recommended)

#### Create a Release Tag

```bash
# Ensure you're on the main/develop branch
git checkout develop

# Create and push a version tag
git tag extension-v0.1.0
git push origin extension-v0.1.0
```

The GitHub Action will automatically:
1. Build the extension
2. Run tests
3. Validate the package
4. Publish to VS Code Marketplace
5. Create a GitHub Release with the VSIX file

#### Manual Trigger

You can also manually trigger the workflow:
1. Go to Actions → Publish Extension
2. Click "Run workflow"
3. Enter the version number
4. Click "Run workflow"

### Method 2: Manual Publishing

#### 1. Prepare the Extension

```bash
cd packages/agency-extension

# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Validate
pnpm exec vsce ls
```

#### 2. Package the Extension

```bash
# Create VSIX package
pnpm exec vsce package --no-dependencies

# This creates: generacy-ai-agency-extension-0.1.0.vsix
```

#### 3. Publish to Marketplace

```bash
# Publish with your PAT
pnpm exec vsce publish --no-dependencies -p <YOUR_PAT>

# Or use environment variable
export VSCE_PAT=<YOUR_PAT>
pnpm exec vsce publish --no-dependencies
```

## Versioning

Follow [Semantic Versioning](https://semver.org/):
- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features, backwards compatible
- **PATCH** (0.0.1): Bug fixes

### Updating Version

1. Update `version` in `package.json`
2. Update `CHANGELOG.md` with release notes
3. Commit changes
4. Create and push tag (automated publishing)

Example:
```bash
# Update package.json version
# Update CHANGELOG.md

git add packages/agency-extension/package.json packages/agency-extension/CHANGELOG.md
git commit -m "chore: Bump extension version to 0.2.0"
git push

# Tag and push
git tag extension-v0.2.0
git push origin extension-v0.2.0
```

## Verification

After publishing, verify:

1. **Marketplace Listing**:
   - Visit: https://marketplace.visualstudio.com/items?itemName=generacy-ai.agency-extension
   - Check description, screenshots, categories
   - Verify version number

2. **Installation Test**:
   ```bash
   # Install in VS Code
   code --install-extension generacy-ai.agency-extension

   # Or search in VS Code Extensions (Ctrl+Shift+X)
   ```

3. **Functionality Test**:
   - Open a project with `.agency/agency.config.json`
   - Verify extension activates
   - Check all views load (Plugins, Tools, Activity, Containers, Modes)
   - Test key commands

## Troubleshooting

### "Publisher not found" Error
- Ensure `publisher` in package.json matches your marketplace publisher ID
- Verify PAT has correct scopes (Marketplace → Manage)

### "Icon not found" Error
- Ensure `media/icon.png` exists (convert from SVG)
- File must be exactly 128x128 PNG
- Check path in package.json `"icon": "media/icon.png"`

### "Package validation failed" Error
```bash
# Run validation locally
cd packages/agency-extension
pnpm exec vsce ls

# Check for issues in output
```

### "Build failed" Error
- Ensure all dependencies are installed: `pnpm install`
- Check TypeScript compilation: `pnpm typecheck`
- Run tests: `pnpm test`

## Unpublishing (Use with Caution)

To unpublish a specific version:
```bash
cd packages/agency-extension
pnpm exec vsce unpublish generacy-ai.agency-extension@0.1.0
```

To unpublish entire extension:
```bash
cd packages/agency-extension
pnpm exec vsce unpublish generacy-ai.agency-extension
```

**Note**: Unpublishing should be avoided when possible. Users who installed the extension will experience broken installations.

## Resources

- [VS Code Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce CLI Documentation](https://github.com/microsoft/vscode-vsce)
- [Marketplace Publisher Management](https://marketplace.visualstudio.com/manage)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
