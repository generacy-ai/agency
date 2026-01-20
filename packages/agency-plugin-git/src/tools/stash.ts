/**
 * source_control.stash tool
 *
 * Stash/unstash changes.
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';
import type { StashParams, StashEntry, StashListResult } from '../types.js';
import { execGitOrThrow } from '../utils/exec-git.js';

export function createStashTool(config: GitPluginConfig): AgencyTool {
  return {
    name: 'source_control.stash',
    description: 'Stash/unstash changes',
    namespace: 'source_control',
    outputPattern: 'terse',
    modes: ['default', 'coding'],
    inputSchema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
        action: {
          type: 'string',
          enum: ['push', 'pop', 'apply', 'drop', 'list', 'show'],
          description: 'Action to perform (required)',
        },
        message: {
          type: 'string',
          description: 'Stash message (for push)',
        },
        index: {
          type: 'number',
          description: 'Stash index (for pop/apply/drop/show, default: 0)',
        },
        includeUntracked: {
          type: 'boolean',
          description: 'Include untracked files (for push)',
        },
      },
      required: ['action'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      const {
        cwd,
        action,
        message,
        index = 0,
        includeUntracked = false,
      } = (params as StashParams) || {};

      if (!action) {
        return terseToMcpToolResult(
          TerseOutput.failure('action parameter is required')
        );
      }

      try {
        switch (action) {
          case 'push':
            return await stashPush(cwd, message, includeUntracked, config);

          case 'pop':
            return await stashPop(cwd, index, config);

          case 'apply':
            return await stashApply(cwd, index, config);

          case 'drop':
            return await stashDrop(cwd, index, config);

          case 'list':
            return await stashList(cwd, config);

          case 'show':
            return await stashShow(cwd, index, config);

          default:
            return terseToMcpToolResult(
              TerseOutput.failure(`Unknown action: ${action}`)
            );
        }
      } catch (error) {
        return terseToMcpToolResult(
          TerseOutput.failure(error instanceof Error ? error : String(error))
        );
      }
    },
  };
}

async function stashPush(
  cwd: string | undefined,
  message: string | undefined,
  includeUntracked: boolean,
  config: GitPluginConfig
): Promise<ToolResult> {
  const args = ['stash', 'push'];

  if (message) {
    args.push('-m', message);
  }

  if (includeUntracked) {
    args.push('-u');
  }

  const result = await execGitOrThrow(args, { cwd, timeout: config.timeout });

  const created = !result.stdout.includes('No local changes to save');

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        success: true,
        action: 'push',
        created,
        message: message ?? '',
        summary: created ? 'Stashed changes' : 'No changes to stash',
      })
    )
  );
}

async function stashPop(
  cwd: string | undefined,
  index: number,
  config: GitPluginConfig
): Promise<ToolResult> {
  await execGitOrThrow(['stash', 'pop', `stash@{${index}}`], { cwd, timeout: config.timeout });

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        success: true,
        action: 'pop',
        index,
        summary: `Popped stash@{${index}}`,
      })
    )
  );
}

async function stashApply(
  cwd: string | undefined,
  index: number,
  config: GitPluginConfig
): Promise<ToolResult> {
  await execGitOrThrow(['stash', 'apply', `stash@{${index}}`], { cwd, timeout: config.timeout });

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        success: true,
        action: 'apply',
        index,
        summary: `Applied stash@{${index}}`,
      })
    )
  );
}

async function stashDrop(
  cwd: string | undefined,
  index: number,
  config: GitPluginConfig
): Promise<ToolResult> {
  await execGitOrThrow(['stash', 'drop', `stash@{${index}}`], { cwd, timeout: config.timeout });

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        success: true,
        action: 'drop',
        index,
        summary: `Dropped stash@{${index}}`,
      })
    )
  );
}

async function stashList(
  cwd: string | undefined,
  config: GitPluginConfig
): Promise<ToolResult> {
  const result = await execGitOrThrow(
    ['stash', 'list', '--format=%gd|%gs'],
    { cwd, timeout: config.timeout }
  );

  const entries: StashEntry[] = [];

  for (const line of result.stdout.split('\n').filter(Boolean)) {
    const [ref, message] = line.split('|');
    if (!ref) continue;

    // Parse stash@{N}
    const match = ref.match(/stash@\{(\d+)\}/);
    const index = match ? parseInt(match[1] ?? '0', 10) : entries.length;

    // Extract branch from message like "WIP on main: abc123 commit message"
    const branchMatch = message?.match(/^(?:WIP )?on ([^:]+):/);
    const branch = branchMatch?.[1] ?? '';

    entries.push({
      index,
      message: message ?? '',
      branch,
    });
  }

  const listResult: StashListResult = { entries };

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        ...listResult,
        summary: entries.length > 0 ? `${entries.length} stash(es)` : 'No stashes',
      })
    )
  );
}

async function stashShow(
  cwd: string | undefined,
  index: number,
  config: GitPluginConfig
): Promise<ToolResult> {
  const result = await execGitOrThrow(
    ['stash', 'show', '--stat', `stash@{${index}}`],
    { cwd, timeout: config.timeout }
  );

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        success: true,
        action: 'show',
        index,
        stat: result.stdout,
        summary: `stash@{${index}}: ${result.stdout.split('\n')[0] ?? ''}`,
      })
    )
  );
}
