# Research: Plugin: @generacy-ai/agency-plugin-npm

## Technology Decisions

### Package Manager Detection

**Decision**: Detect from lockfiles in priority order: pnpm-lock.yaml > yarn.lock > package-lock.json

**Rationale**:
- Lockfiles are the definitive indicator of which PM is actively used
- Priority order chosen because pnpm and yarn users are explicit in their choice
- Falls back to npm as the default (most common)

**Alternatives Considered**:
- `packageManager` field in package.json (Corepack) - Not universally adopted yet
- User agent string detection - Unreliable, not always available
- Config file detection (.npmrc, .yarnrc, .pnpmrc) - Can exist without being the active PM

### Command Execution

**Decision**: Use Node.js `child_process.spawn` with captured output

**Rationale**:
- Full control over process lifecycle
- Can capture stdout/stderr separately
- Supports streaming output for long-running operations
- Handles exit codes correctly

**Alternatives Considered**:
- `execa` package - Good API but adds dependency
- `child_process.exec` - Buffer limits on output, less control
- Shell commands via template strings - Security concerns, escaping issues

### Workspace Targeting

**Decision**: Map `workspace` parameter to PM-specific flags

**Mapping**:
| PM | Single Workspace | Pattern |
|----|------------------|---------|
| pnpm | `--filter <name>` | `--filter "<pattern>"` |
| yarn | `yarn workspace <name>` | `yarn workspaces foreach` |
| npm | `-w <name>` | `-w <pattern>` |

**Rationale**:
- Each PM has different syntax for workspace targeting
- The `workspace` parameter provides a unified interface
- Falls back to `cwd` for projects not using workspaces

### Script Validation

**Decision**: Validate script exists before execution, fail fast with clear error

**Rationale**:
- Per spec: "Scripts must match configured names exactly"
- Prevents confusing errors from the package manager
- Enables helpful suggestions in error messages

**Alternatives Considered**:
- Auto-detection of common variants (test:unit, unit-test, etc.) - Rejected per spec
- Lazy validation (let PM fail) - Worse error messages

### Output Pattern

**Decision**: Use TerseOutput from core package

**Implementation**:
```typescript
// Success
TerseOutput.success('Dependencies installed.');

// Failure with context
TerseOutput.failure(error, {
  command: 'npm install',
  stdout: result.stdout,
  stderr: result.stderr,
  recovery: 'Check network connection and try again.'
});
```

**Rationale**:
- Consistent with other plugins
- Proper handling of success vs failure verbosity
- Built-in MCP tool result conversion

## Implementation Patterns

### Tool Factory Pattern

Each tool category (build, test) uses a factory to create similar tools:

```typescript
function createScriptTool(options: {
  name: string;
  description: string;
  scriptKey: keyof Scripts;
  additionalParams?: z.ZodObject<any>;
}): AgencyTool {
  const schema = baseParamsSchema.merge(options.additionalParams ?? z.object({}));

  return {
    name: options.name,
    description: options.description,
    namespace: options.name.split('.')[0],
    outputPattern: 'terse',
    inputSchema: zodToJsonSchema(schema),
    async execute(params: unknown): Promise<ToolResult> {
      const validated = schema.parse(params);
      return executeScript(options.scriptKey, validated);
    }
  };
}
```

### Error Recovery Suggestions

Map common error patterns to helpful suggestions:

| Error Pattern | Recovery Suggestion |
|--------------|---------------------|
| ENOENT (lockfile) | "Run `{pm} install` to generate lockfile" |
| EACCES | "Check file permissions in node_modules" |
| Script not found | "Available scripts: ..." |
| Network error | "Check network connection" |
| Exit code 1 (build) | "Fix compilation errors shown above" |
| Exit code 1 (test) | "Fix failing tests shown above" |

### Configuration Access

```typescript
async initialize(core: AgencyCoreAPI): Promise<void> {
  const config = core.getConfig<NpmPluginConfig>('@generacy-ai/agency-plugin-npm') ?? {};
  const mergedConfig = { ...defaultConfig, ...config };

  // Use mergedConfig for all operations
}
```

## Key References

### MCP Tool Result Format

From @modelcontextprotocol/sdk:
```typescript
interface ToolResult {
  content: Array<TextContent | ImageContent | EmbeddedResource>;
  isError?: boolean;
}

interface TextContent {
  type: 'text';
  text: string;
}
```

### Package Manager Commands

**npm 9.x**:
- Install: `npm install [--production] [--package-lock-only]`
- Run: `npm run <script> [-- args]`
- Workspace: `npm run <script> -w <workspace>`

**yarn 3.x (Berry)**:
- Install: `yarn install [--production] [--immutable]`
- Run: `yarn run <script> [args]`
- Workspace: `yarn workspace <name> run <script>`

**pnpm 8.x**:
- Install: `pnpm install [--prod] [--frozen-lockfile]`
- Run: `pnpm run <script> [-- args]`
- Workspace: `pnpm --filter <name> run <script>`

### Lockfile Locations

| PM | Primary Lockfile | Alternative |
|----|------------------|-------------|
| npm | package-lock.json | npm-shrinkwrap.json |
| yarn | yarn.lock | - |
| pnpm | pnpm-lock.yaml | - |

---

*Generated by speckit*
