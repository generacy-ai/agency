# Quickstart: @generacy-ai/agency-plugin-firebase

## Prerequisites

- Node.js 20+
- Firebase CLI installed (`npm install -g firebase-tools`)
- Firebase project initialized in workspace (`firebase init`)
- Agency server running

## Installation

```bash
pnpm add @generacy-ai/agency-plugin-firebase
```

## Configuration

Add to `agency.config.json`:

```json
{
  "plugins": {
    "firebase": {
      "project": "my-project-id",
      "cleanup": "session",
      "emulators": {
        "only": ["firestore", "auth", "functions"]
      },
      "deploy": {
        "targets": ["functions"]
      }
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `project` | string | - | Firebase project ID |
| `cleanup` | `session` \| `persist` \| `explicit` | `session` | Emulator cleanup mode |
| `emulators.only` | string[] | all | Emulators to start by default |
| `deploy.targets` | string[] | `["functions"]` | Default deploy targets |

## Available Tools

### run.firebase_emulators_start

Start Firebase emulators.

```json
{
  "only": ["firestore", "auth"],
  "import": "./emulator-data",
  "export": "./emulator-data"
}
```

**Returns**: "Emulators started." or error message

### run.firebase_emulators_stop

Stop running emulators.

```json
{
  "force": false
}
```

**Returns**: "Emulators stopped." or error message

### run.firebase_emulators_status

Check emulator status.

```json
{}
```

**Returns**:
```json
{
  "running": true,
  "emulators": {
    "firestore": { "port": 8080, "url": "http://localhost:8080" },
    "auth": { "port": 9099, "url": "http://localhost:9099" }
  }
}
```

### run.firebase_deploy

Deploy to Firebase.

```json
{
  "only": ["functions"],
  "project": "my-project",
  "message": "Deploy v1.2.0"
}
```

**Returns**: "Deploy complete." or error message

### run.firebase_functions_log

View function logs.

```json
{
  "only": ["myFunction"],
  "lines": 50
}
```

**Returns**: Log output or error message

## Usage Examples

### Development Workflow

1. Start emulators with data import:
   ```
   run.firebase_emulators_start { "import": "./data" }
   ```

2. Check status:
   ```
   run.firebase_emulators_status
   ```

3. Stop with data export:
   ```
   run.firebase_emulators_stop
   ```

### Deployment Workflow

1. Deploy functions only:
   ```
   run.firebase_deploy { "only": ["functions"] }
   ```

2. View logs after deploy:
   ```
   run.firebase_functions_log { "lines": 100 }
   ```

## Mode Affiliations

| Mode | Available Tools |
|------|-----------------|
| `debug` | All 5 tools |
| `coding` | `emulators_start`, `emulators_stop` |

## Troubleshooting

### "Firebase CLI not found"

Install Firebase CLI globally:
```bash
npm install -g firebase-tools
```

### "Project not found"

Initialize Firebase in your project:
```bash
firebase init
```

Or specify project in config/parameters.

### "Port in use"

Another process is using the emulator port. Either:
1. Stop the other process
2. Configure different ports in `firebase.json`

### "Not authenticated"

Login to Firebase:
```bash
firebase login
```

## Cleanup Modes

| Mode | Behavior |
|------|----------|
| `session` | Emulators stop when agent session ends |
| `persist` | Emulators keep running across sessions |
| `explicit` | Emulators only stop on `emulators_stop` call |

Default is `session` for safety in ephemeral dev containers.
