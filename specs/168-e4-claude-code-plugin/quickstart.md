# Quickstart: E4: Claude Code plugin: specify command

## Installation

The specify command is part of the `@generacy-ai/agency-plugin-spec-kit` package. No separate installation is required if you have the Agency plugin configured.

## Prerequisites

1. Agency MCP server running with spec-kit plugin
2. Claude Code with `claude-plugin-agency-spec-kit` installed
3. Working git repository

## Usage

### Basic Usage

Create a new feature specification by describing what you want to build:

```
/agency-spec-kit:specify Add user authentication with OAuth2 support
```

### What Happens

1. **Branch Created**: `###-user-authentication-oauth2`
2. **Directory Created**: `specs/###-user-authentication-oauth2/`
3. **Files Initialized**:
   - `spec.md` - Pre-populated with your description
   - `checklists/` - Empty directory for checklists
   - `contracts/` - Empty directory for API contracts

### Example Session

```
> /agency-spec-kit:specify Add dark mode toggle to settings

Creating feature from description...
- Generated feature number: 042
- Created branch: 042-dark-mode-toggle
- Initialized spec at: specs/042-dark-mode-toggle/spec.md

Ready for specification!

Next steps:
- Review and enhance spec.md
- Run /speckit:clarify to identify ambiguities
- Run /speckit:plan to generate implementation plan
```

## Available Commands

After running specify, continue your workflow with:

| Command | Description |
|---------|-------------|
| `/speckit:clarify` | Identify underspecified areas in the spec |
| `/speckit:plan` | Generate implementation plan from spec |
| `/speckit:tasks` | Generate task list from plan |
| `/speckit:implement` | Execute tasks with progress tracking |

## Troubleshooting

### "Could not find git repository root"

Make sure you're running the command from within a git repository:

```bash
git init  # If new project
```

### "Feature number already exists"

The auto-generated number conflicts with an existing feature. Provide an explicit number:

```
/agency-spec-kit:specify --number 050 Add new feature
```

### Template not found

Ensure the templates directory exists at the configured path (default: `.specify/templates/`):

```bash
mkdir -p .specify/templates
cp path/to/spec-template.md .specify/templates/
```

## Configuration

The specify command uses these config paths (from `agency.config.json`):

```json
{
  "plugins": {
    "@generacy-ai/agency-plugin-spec-kit": {
      "paths": {
        "specs": "specs",
        "templates": ".specify/templates"
      }
    }
  }
}
```
