/**
 * source_control.branch tool
 *
 * Create, list, or delete branches.
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';
import type { BranchParams, BranchInfo, BranchListResult } from '../types.js';
import { execGitOrThrow, execGit } from '../utils/exec-git.js';

export function createBranchTool(config: GitPluginConfig): AgencyTool {
  return {
    name: 'source_control.branch',
    description: 'Create, list, or delete branches',
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
          enum: ['list', 'create', 'delete', 'rename'],
          description: 'Action to perform (required)',
        },
        name: {
          type: 'string',
          description: 'Branch name (required for create/delete/rename)',
        },
        newName: {
          type: 'string',
          description: 'New name (for rename)',
        },
        force: {
          type: 'boolean',
          description: 'Force delete unmerged branch',
        },
        all: {
          type: 'boolean',
          description: 'Include remote branches in list',
        },
      },
      required: ['action'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      const {
        cwd,
        action,
        name,
        newName,
        force = false,
        all = false,
      } = (params as BranchParams) || {};

      if (!action) {
        return terseToMcpToolResult(
          TerseOutput.failure('action parameter is required')
        );
      }

      try {
        switch (action) {
          case 'list':
            return await listBranches(cwd, all, config);

          case 'create':
            if (!name) {
              return terseToMcpToolResult(
                TerseOutput.failure('name parameter is required for create')
              );
            }
            return await createBranch(cwd, name, config);

          case 'delete':
            if (!name) {
              return terseToMcpToolResult(
                TerseOutput.failure('name parameter is required for delete')
              );
            }
            return await deleteBranch(cwd, name, force, config);

          case 'rename':
            if (!name || !newName) {
              return terseToMcpToolResult(
                TerseOutput.failure('name and newName parameters are required for rename')
              );
            }
            return await renameBranch(cwd, name, newName, config);

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

async function listBranches(
  cwd: string | undefined,
  all: boolean,
  config: GitPluginConfig
): Promise<ToolResult> {
  const args = ['branch', '--format=%(refname:short)|%(objectname:short)|%(upstream:short)|%(HEAD)'];

  if (all) {
    args.push('-a');
  }

  const result = await execGitOrThrow(args, { cwd, timeout: config.timeout });

  const branches: BranchInfo[] = [];
  let current = '';

  for (const line of result.stdout.split('\n').filter(Boolean)) {
    const [name, commit, upstream, head] = line.split('|');
    if (!name || !commit) continue;

    const isCurrent = head === '*';
    const isRemote = name.startsWith('remotes/') || name.includes('/');

    if (isCurrent) {
      current = name;
    }

    branches.push({
      name,
      current: isCurrent,
      remote: isRemote,
      upstream: upstream || undefined,
      commit,
    });
  }

  const listResult: BranchListResult = { branches, current };

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        ...listResult,
        summary: `${branches.length} branch(es), current: ${current}`,
      })
    )
  );
}

async function createBranch(
  cwd: string | undefined,
  name: string,
  config: GitPluginConfig
): Promise<ToolResult> {
  await execGitOrThrow(['branch', name], { cwd, timeout: config.timeout });

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        success: true,
        action: 'create',
        name,
        summary: `Created branch '${name}'`,
      })
    )
  );
}

async function deleteBranch(
  cwd: string | undefined,
  name: string,
  force: boolean,
  config: GitPluginConfig
): Promise<ToolResult> {
  const args = ['branch', force ? '-D' : '-d', name];

  await execGitOrThrow(args, { cwd, timeout: config.timeout });

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        success: true,
        action: 'delete',
        name,
        force,
        summary: `Deleted branch '${name}'`,
      })
    )
  );
}

async function renameBranch(
  cwd: string | undefined,
  oldName: string,
  newName: string,
  config: GitPluginConfig
): Promise<ToolResult> {
  await execGitOrThrow(['branch', '-m', oldName, newName], { cwd, timeout: config.timeout });

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        success: true,
        action: 'rename',
        oldName,
        newName,
        summary: `Renamed branch '${oldName}' to '${newName}'`,
      })
    )
  );
}
