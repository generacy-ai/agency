# Backlog Providers

SpecKit supports multiple backlog providers to integrate with your existing project management workflow. This guide covers setup and configuration for each supported provider.

## Provider Comparison

| Feature | GitHub | Jira | Shortcut | Local |
|---------|--------|------|----------|-------|
| External sync | Yes | Yes | Yes | No |
| Issue creation | Yes | Yes | Yes | No |
| Issue updates | Yes | Yes | Yes | No |
| Comments | Yes | Yes | Yes | No |
| Labels | Yes | Yes | Yes | No |
| Offline mode | No | No | No | Yes |
| Authentication | CLI-based | API token | API token | None |
| Setup complexity | Low | Medium | Low | None |

## 1. GitHub Provider (Default)

GitHub is the default provider and integrates seamlessly with GitHub Issues.

### Prerequisites

- GitHub CLI (`gh`) installed
- Repository hosted on GitHub

### Installation

```bash
# macOS
brew install gh

# Ubuntu/Debian
sudo apt install gh

# Windows
winget install GitHub.cli
```

### Authentication

Run the GitHub CLI login command:

```bash
gh auth login
```

Follow the interactive prompts to authenticate via browser or token.

### Configuration

GitHub is the default provider, so minimal configuration is needed:

```yaml
# .speckit/config.yaml
backlog:
  provider: github
```

For cross-repository references:

```yaml
backlog:
  provider: github
  github:
    owner: your-org
    repo: your-repo
```

### Reference Formats

| Format | Example | Description |
|--------|---------|-------------|
| Short | `#123` | Issue in current repository |
| Qualified | `owner/repo#123` | Issue in specific repository |
| URL | `https://github.com/owner/repo/issues/123` | Full GitHub URL |

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GH_TOKEN` | GitHub personal access token (alternative to `gh auth`) | No |
| `GITHUB_TOKEN` | Same as `GH_TOKEN` | No |

### Troubleshooting

**Authentication failed**
```bash
# Check current auth status
gh auth status

# Re-authenticate
gh auth login --web
```

**Permission denied on private repository**
```bash
# Ensure token has repo scope
gh auth refresh -s repo
```

**Rate limiting**
```bash
# Check rate limit status
gh api rate_limit
```

**Wrong repository detected**
```yaml
# Explicitly set repository in config
backlog:
  provider: github
  github:
    owner: correct-owner
    repo: correct-repo
```

---

## 2. Jira Provider

Integrate with Atlassian Jira for enterprise project management.

### Prerequisites

- Jira Cloud or Jira Server account
- API access enabled for your account
- Project key for your target project

### Authentication

1. Navigate to [Atlassian API Tokens](https://id.atlassian.com/manage/api-tokens)
2. Click **Create API token**
3. Enter a label (e.g., "SpecKit Integration")
4. Copy the generated token

Set environment variables:

```bash
# Add to your shell profile (.bashrc, .zshrc, etc.)
export JIRA_EMAIL="your-email@company.com"
export JIRA_API_TOKEN="your-api-token-here"
```

### Configuration

```yaml
# .speckit/config.yaml
backlog:
  provider: jira
  jira:
    baseUrl: https://your-company.atlassian.net
    projectKey: PROJ
```

Full configuration options:

```yaml
backlog:
  provider: jira
  jira:
    baseUrl: https://your-company.atlassian.net
    projectKey: PROJ
    issueType: Story          # Default issue type for new issues
    customFields:             # Map SpecKit fields to Jira custom fields
      epic: customfield_10001
      storyPoints: customfield_10002
```

### Reference Formats

| Format | Example | Description |
|--------|---------|-------------|
| Key | `PROJ-123` | Standard Jira issue key |
| URL | `https://company.atlassian.net/browse/PROJ-123` | Full browse URL |

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `JIRA_EMAIL` | Your Jira account email | Yes |
| `JIRA_API_TOKEN` | API token from Atlassian | Yes |
| `JIRA_BASE_URL` | Alternative to config baseUrl | No |

### Troubleshooting

**401 Unauthorized**
```bash
# Verify credentials are set
echo $JIRA_EMAIL
echo $JIRA_API_TOKEN

# Test API access
curl -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "https://your-company.atlassian.net/rest/api/3/myself"
```

**Project not found**
- Verify the project key is correct (case-sensitive)
- Ensure your account has access to the project
- Check project permissions in Jira settings

**Custom fields not mapping**
```yaml
# Find custom field IDs via API
# GET /rest/api/3/field
jira:
  customFields:
    epic: customfield_10001  # Use the actual field ID
```

**Rate limiting (Jira Cloud)**
- Jira Cloud has rate limits per user
- Consider using a service account for CI/CD
- Implement retry logic in automation scripts

---

## 3. Shortcut Provider

Integrate with Shortcut (formerly Clubhouse) for agile teams.

### Prerequisites

- Shortcut account with workspace access
- API token with appropriate permissions

### Authentication

1. Log in to Shortcut
2. Navigate to **Settings** > **API Tokens**
3. Click **Generate Token**
4. Copy the token and store securely

Set environment variable:

```bash
# Add to your shell profile
export SHORTCUT_API_TOKEN="your-api-token-here"
```

### Configuration

```yaml
# .speckit/config.yaml
backlog:
  provider: shortcut
  shortcut:
    workspaceSlug: your-workspace
```

Full configuration options:

```yaml
backlog:
  provider: shortcut
  shortcut:
    workspaceSlug: your-workspace
    defaultProjectId: 123       # Optional: default project for new stories
    defaultWorkflowStateId: 456 # Optional: initial state for new stories
```

### Reference Formats

| Format | Example | Description |
|--------|---------|-------------|
| Short | `sc-123` | Story ID with prefix |
| Numeric | `123` | Story ID only |
| URL | `https://app.shortcut.com/workspace/story/123` | Full story URL |

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SHORTCUT_API_TOKEN` | API token from Shortcut settings | Yes |

### Troubleshooting

**Invalid API token**
```bash
# Verify token is set
echo $SHORTCUT_API_TOKEN

# Test API access
curl -H "Shortcut-Token: $SHORTCUT_API_TOKEN" \
  "https://api.app.shortcut.com/api/v3/member"
```

**Workspace not found**
- Verify workspace slug matches URL: `app.shortcut.com/{workspace-slug}`
- Ensure your token has access to the workspace
- Check that the workspace hasn't been renamed

**Story not found**
- Confirm the story ID exists and is accessible
- Check that the story hasn't been archived
- Verify you have permission to view the story

**Project/workflow issues**
```bash
# List available projects
curl -H "Shortcut-Token: $SHORTCUT_API_TOKEN" \
  "https://api.app.shortcut.com/api/v3/projects"

# List workflow states
curl -H "Shortcut-Token: $SHORTCUT_API_TOKEN" \
  "https://api.app.shortcut.com/api/v3/workflows"
```

---

## 4. Local Provider

The local provider stores all backlog data in the repository without external sync.

### Prerequisites

None - works entirely offline.

### Authentication

Not required.

### Configuration

```yaml
# .speckit/config.yaml
backlog:
  provider: local
```

Optional configuration:

```yaml
backlog:
  provider: local
  local:
    issuesDir: .speckit/issues  # Custom directory for issue files
    autoIncrement: true         # Auto-generate issue numbers
```

### Use Cases

- **Offline development**: Work without internet access
- **Testing and prototyping**: Test SpecKit workflows before connecting external providers
- **Simple projects**: Small projects that don't need external issue tracking
- **Air-gapped environments**: Secure environments without external network access

### How It Works

Issues are stored as YAML files in the configured directory:

```
.speckit/
  issues/
    1.yaml
    2.yaml
    3.yaml
```

Example issue file:

```yaml
# .speckit/issues/1.yaml
id: 1
title: Implement user authentication
status: open
labels:
  - feature
  - security
created: 2024-01-15T10:30:00Z
updated: 2024-01-16T14:22:00Z
body: |
  As a user, I want to log in securely
  so that my data is protected.
```

### Reference Formats

| Format | Example | Description |
|--------|---------|-------------|
| Numeric | `1` | Issue number |
| Prefixed | `#1` | Issue with hash prefix |

### Limitations

| Feature | Available |
|---------|-----------|
| External sync | No |
| Multi-user collaboration | Limited (via git) |
| Real-time updates | No |
| Web interface | No |
| Notifications | No |
| Advanced queries | Limited |

### Migrating to External Provider

To migrate from local to an external provider:

1. Update configuration to new provider
2. Run migration command:
   ```bash
   speckit migrate --from local --to github
   ```
3. Verify issues were created in external system
4. Optionally remove local issue files

---

## Environment Variable Reference

| Variable | Provider | Description |
|----------|----------|-------------|
| `GH_TOKEN` | GitHub | Personal access token |
| `GITHUB_TOKEN` | GitHub | Alternative to GH_TOKEN |
| `JIRA_EMAIL` | Jira | Account email address |
| `JIRA_API_TOKEN` | Jira | API token from Atlassian |
| `JIRA_BASE_URL` | Jira | Jira instance URL |
| `SHORTCUT_API_TOKEN` | Shortcut | API token from settings |

### Setting Environment Variables

**Linux/macOS (bash/zsh)**
```bash
# Add to ~/.bashrc or ~/.zshrc
export JIRA_EMAIL="user@company.com"
export JIRA_API_TOKEN="token-here"

# Reload shell
source ~/.bashrc
```

**Windows (PowerShell)**
```powershell
# Session only
$env:JIRA_EMAIL = "user@company.com"
$env:JIRA_API_TOKEN = "token-here"

# Permanent (user level)
[Environment]::SetEnvironmentVariable("JIRA_EMAIL", "user@company.com", "User")
```

**CI/CD (GitHub Actions)**
```yaml
env:
  JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
  JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
```

---

## Common Issues and Solutions

### Provider Detection Fails

```yaml
# Explicitly set provider in config
backlog:
  provider: github  # or jira, shortcut, local
```

### Multiple Providers in Monorepo

Use workspace-specific configs:

```yaml
# packages/frontend/.speckit/config.yaml
backlog:
  provider: jira
  jira:
    projectKey: FRONTEND

# packages/backend/.speckit/config.yaml
backlog:
  provider: jira
  jira:
    projectKey: BACKEND
```

### Switching Providers

1. Update `.speckit/config.yaml` with new provider settings
2. Existing spec artifacts remain valid
3. Issue references may need updating to match new format
4. Consider running a migration for existing issues

### Network/Proxy Issues

```bash
# For corporate proxies
export HTTPS_PROXY="http://proxy.company.com:8080"
export HTTP_PROXY="http://proxy.company.com:8080"

# For self-signed certificates (Jira Server)
export NODE_TLS_REJECT_UNAUTHORIZED=0  # Use with caution
```

### Debugging Provider Issues

```bash
# Enable debug logging
export SPECKIT_DEBUG=true

# Run command with verbose output
speckit --verbose <command>
```
