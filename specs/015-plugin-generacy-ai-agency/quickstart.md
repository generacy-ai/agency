# Quickstart: @generacy-ai/agency-plugin-docker

## Installation

```bash
# Install the plugin
pnpm add @generacy-ai/agency-plugin-docker

# Or in monorepo workspace
pnpm add @generacy-ai/agency-plugin-docker --filter @your-project/server
```

## Prerequisites

- Docker Engine installed and running
- Docker Compose v2 (bundled with Docker Desktop)

## Configuration

Add to your `agency.config.json`:

```json
{
  "plugins": {
    "docker": {
      "composeFile": "docker-compose.yml",
      "projectName": null,
      "defaultTimeout": 10
    }
  }
}
```

## Available Tools

### Docker Compose

| Tool | Description |
|------|-------------|
| `run.docker_compose_up` | Start services defined in compose file |
| `run.docker_compose_down` | Stop and remove services |
| `run.docker_compose_logs` | View service logs (tail snapshot) |
| `run.docker_compose_ps` | List running services |

### Container Operations

| Tool | Description |
|------|-------------|
| `run.docker_build` | Build a Docker image |
| `run.docker_run` | Run a container |
| `run.docker_stop` | Stop a running container |
| `run.docker_exec` | Execute command in container |

## Usage Examples

### Start Services

```json
{
  "tool": "run.docker_compose_up",
  "params": {
    "services": ["api", "db"],
    "build": true
  }
}
```
Output: `Services started.`

### View Logs

```json
{
  "tool": "run.docker_compose_logs",
  "params": {
    "services": ["api"],
    "tail": 50,
    "timestamps": true
  }
}
```
Output: Last 50 lines of logs with timestamps

### Build Image

```json
{
  "tool": "run.docker_build",
  "params": {
    "context": "./app",
    "tag": "myapp:latest",
    "buildArgs": {
      "NODE_ENV": "production"
    }
  }
}
```
Output: `Image built: myapp:latest`

### Run Container

```json
{
  "tool": "run.docker_run",
  "params": {
    "image": "nginx:alpine",
    "name": "web",
    "ports": ["8080:80"],
    "detach": true
  }
}
```
Output: `Container started: abc123...`

### Execute Command

```json
{
  "tool": "run.docker_exec",
  "params": {
    "container": "web",
    "cmd": ["ls", "-la", "/etc/nginx"]
  }
}
```
Output: Command output

## Mode Availability

| Mode | Available Tools |
|------|-----------------|
| `debug` | All 8 tools |
| `coding` | compose_up, compose_down, compose_logs |

## Error Output

Errors follow the terse output pattern with categorization:

```
[DAEMON] Cannot connect to the Docker daemon
Exit code: 1
```

Categories: `DAEMON`, `PERMISSION`, `NOT_FOUND`, `NETWORK`, `RESOURCE`, `CONFIG`, `UNKNOWN`

## Troubleshooting

### Docker daemon not running

```
[DAEMON] Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

**Solution**: Start Docker Desktop or the Docker service.

### Permission denied

```
[PERMISSION] permission denied while trying to connect to the Docker daemon socket
```

**Solution**: Add user to docker group or use sudo.

### Image not found

```
[NOT_FOUND] Unable to find image 'myapp:latest' locally
```

**Solution**: Build the image first or pull from registry.
