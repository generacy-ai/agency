/**
 * update_agent tool implementation for spec-kit
 *
 * Updates AI agent context files with technology information
 * extracted from the current feature's plan.md file.
 */

import { join } from 'node:path';
import type { AgencyTool, ToolResult, AgencyCoreAPI } from '@generacy-ai/agency';
import type { SpecKitConfig } from '../config.js';
import type { AgentType } from '../types/agent.js';
import {
  AGENT_TYPES,
  AGENT_CONFIGS,
  isAgentType,
} from '../types/agent.js';
import {
  exists,
  readFile,
  writeFile,
  findRepoRoot,
  RepoNotFoundError,
} from '../utils/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for the update_agent tool
 */
interface UpdateAgentParams {
  /** Specific agent to update. If not provided, updates all existing agent files */
  agent_type?: AgentType;
  /** Whether to create agent file from template if missing */
  create_if_missing?: boolean;
  /** Feature directory containing plan.md */
  feature_dir?: string;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}

/**
 * Technology information extracted from plan.md
 */
interface PlanData {
  /** Programming language and version */
  language?: string;
  /** Framework and library dependencies */
  dependencies?: string;
  /** Storage/database technologies */
  storage?: string;
  /** Testing frameworks */
  testing?: string;
  /** Type of project */
  projectType?: string;
}

/**
 * Successful update record
 */
interface UpdateResult {
  /** Agent type that was updated */
  agent: AgentType;
  /** Full path to updated file */
  filePath: string;
  /** Whether file was newly created */
  created: boolean;
}

/**
 * Failed update record
 */
interface UpdateError {
  /** Agent type that failed */
  agent: AgentType;
  /** Structured error information */
  error: {
    code: string;
    message: string;
  };
}

/**
 * Complete tool response
 */
interface UpdateAgentResult {
  /** Overall success status */
  success: boolean;
  /** Successfully updated agents */
  updated: UpdateResult[];
  /** Agents skipped (file doesn't exist) */
  skipped?: string[];
  /** Agents that encountered errors */
  errors?: UpdateError[];
  /** Extracted technology data from plan.md */
  plan_data: PlanData;
}

// ============================================================================
// Content Markers
// ============================================================================

const TECHNOLOGIES_START = '<!-- TECHNOLOGIES START -->';
const TECHNOLOGIES_END = '<!-- TECHNOLOGIES END -->';
const CHANGES_START = '<!-- CHANGES START -->';
const CHANGES_END = '<!-- CHANGES END -->';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract technology information from plan.md content.
 *
 * Parses the plan.md file for technology mentions in:
 * - **Language/Version**: line
 * - **Primary Dependencies**: line
 * - **Storage**: line
 * - **Testing**: line
 * - **Project Type**: line
 *
 * @param planContent - Raw content of plan.md
 * @returns Extracted technology data
 */
export function extractTechnologies(planContent: string): PlanData {
  const data: PlanData = {};

  // Extract Language/Version
  const langMatch = planContent.match(/\*\*Language\/Version\*\*:\s*(.+)/i);
  if (langMatch?.[1]) {
    data.language = langMatch[1].trim();
  }

  // Extract Primary Dependencies
  const depsMatch = planContent.match(/\*\*Primary Dependencies\*\*:\s*(.+)/i);
  if (depsMatch?.[1]) {
    data.dependencies = depsMatch[1].trim();
  }

  // Extract Storage
  const storageMatch = planContent.match(/\*\*Storage\*\*:\s*(.+)/i);
  if (storageMatch?.[1]) {
    data.storage = storageMatch[1].trim();
  }

  // Extract Testing
  const testingMatch = planContent.match(/\*\*Testing\*\*:\s*(.+)/i);
  if (testingMatch?.[1]) {
    data.testing = testingMatch[1].trim();
  }

  // Extract Project Type
  const projectMatch = planContent.match(/\*\*Project Type\*\*:\s*(.+)/i);
  if (projectMatch?.[1]) {
    data.projectType = projectMatch[1].trim();
  }

  return data;
}

/**
 * Generate technology section content from extracted data.
 *
 * @param data - Extracted technology data
 * @returns Formatted technology section content
 */
function formatTechnologiesSection(data: PlanData): string {
  const lines: string[] = [];

  if (data.language) {
    lines.push(`- **Language**: ${data.language}`);
  }
  if (data.dependencies) {
    lines.push(`- **Dependencies**: ${data.dependencies}`);
  }
  if (data.storage) {
    lines.push(`- **Storage**: ${data.storage}`);
  }
  if (data.testing) {
    lines.push(`- **Testing**: ${data.testing}`);
  }
  if (data.projectType) {
    lines.push(`- **Project Type**: ${data.projectType}`);
  }

  return lines.length > 0 ? lines.join('\n') : '_No technology information available_';
}

/**
 * Generate changes section content with timestamp.
 *
 * @param featureDir - Feature directory name
 * @returns Formatted changes section content
 */
function formatChangesSection(featureDir: string): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const featureName = featureDir.split('/').pop() || featureDir;
  return `- **${timestamp}**: Updated from ${featureName}`;
}

/**
 * Update agent file content with new technology information.
 *
 * Uses HTML comment markers for auto-generated sections:
 * - <!-- TECHNOLOGIES START --> ... <!-- TECHNOLOGIES END -->
 * - <!-- CHANGES START --> ... <!-- CHANGES END -->
 *
 * When markers aren't present, falls back to inserting after section headers:
 * - ## Active Technologies
 * - ## Recent Changes
 *
 * @param content - Current agent file content
 * @param data - Extracted technology data
 * @param featureDir - Feature directory name
 * @returns Updated content
 */
export function updateAgentContent(
  content: string,
  data: PlanData,
  featureDir: string
): string {
  let updatedContent = content;
  const technologiesContent = formatTechnologiesSection(data);
  const changesContent = formatChangesSection(featureDir);

  // Update technologies section
  if (updatedContent.includes(TECHNOLOGIES_START) && updatedContent.includes(TECHNOLOGIES_END)) {
    // Use markers if present
    const techRegex = new RegExp(
      `${escapeRegex(TECHNOLOGIES_START)}[\\s\\S]*?${escapeRegex(TECHNOLOGIES_END)}`,
      'g'
    );
    updatedContent = updatedContent.replace(
      techRegex,
      `${TECHNOLOGIES_START}\n${technologiesContent}\n${TECHNOLOGIES_END}`
    );
  } else if (updatedContent.includes('## Active Technologies')) {
    // Fall back to header-based insertion
    updatedContent = insertAfterHeader(
      updatedContent,
      '## Active Technologies',
      `\n${TECHNOLOGIES_START}\n${technologiesContent}\n${TECHNOLOGIES_END}\n`
    );
  }

  // Update changes section
  if (updatedContent.includes(CHANGES_START) && updatedContent.includes(CHANGES_END)) {
    // Use markers if present - prepend new entry
    const changesRegex = new RegExp(
      `${escapeRegex(CHANGES_START)}([\\s\\S]*?)${escapeRegex(CHANGES_END)}`,
      'g'
    );
    updatedContent = updatedContent.replace(changesRegex, (match, existingChanges) => {
      const trimmedChanges = existingChanges.trim();
      const existingLines = trimmedChanges ? trimmedChanges.split('\n') : [];
      // Keep only last 2 entries (plus new one = 3 total)
      const recentLines = existingLines.slice(0, 2);
      const allChanges = [changesContent, ...recentLines].join('\n');
      return `${CHANGES_START}\n${allChanges}\n${CHANGES_END}`;
    });
  } else if (updatedContent.includes('## Recent Changes')) {
    // Fall back to header-based insertion
    updatedContent = insertAfterHeader(
      updatedContent,
      '## Recent Changes',
      `\n${CHANGES_START}\n${changesContent}\n${CHANGES_END}\n`
    );
  }

  return updatedContent;
}

/**
 * Insert content after a markdown header.
 *
 * @param content - Full file content
 * @param header - Header to find (e.g., "## Active Technologies")
 * @param insertion - Content to insert after the header
 * @returns Updated content
 */
function insertAfterHeader(content: string, header: string, insertion: string): string {
  const headerIndex = content.indexOf(header);
  if (headerIndex === -1) {
    return content;
  }

  // Find the end of the header line
  const lineEnd = content.indexOf('\n', headerIndex);
  if (lineEnd === -1) {
    return content + insertion;
  }

  return content.slice(0, lineEnd + 1) + insertion + content.slice(lineEnd + 1);
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate minimal agent file content when creating from scratch.
 *
 * @param agentType - The agent type
 * @param data - Extracted technology data
 * @param featureDir - Feature directory name
 * @returns Minimal agent file content
 */
function generateMinimalContent(
  agentType: AgentType,
  data: PlanData,
  featureDir: string
): string {
  const config = AGENT_CONFIGS[agentType];
  const timestamp = new Date().toISOString().split('T')[0];
  const technologiesContent = formatTechnologiesSection(data);
  const changesContent = formatChangesSection(featureDir);

  return `# ${config.displayName} Development Guidelines

Auto-generated from feature plan. Last updated: ${timestamp}

## Active Technologies

${TECHNOLOGIES_START}
${technologiesContent}
${TECHNOLOGIES_END}

## Recent Changes

${CHANGES_START}
${changesContent}
${CHANGES_END}

<!-- MANUAL ADDITIONS START -->
<!-- Add any custom guidelines below this line -->
<!-- MANUAL ADDITIONS END -->
`;
}

/**
 * Get list of agent types that have existing files in the repo.
 *
 * @param repoRoot - Repository root path
 * @returns List of agent types with existing files
 */
async function findExistingAgentFiles(repoRoot: string): Promise<AgentType[]> {
  const existingAgents: AgentType[] = [];

  for (const agentType of AGENT_TYPES) {
    const config = AGENT_CONFIGS[agentType];
    const agentPath = join(repoRoot, config.filePath);
    if (await exists(agentPath)) {
      existingAgents.push(agentType);
    }
  }

  return existingAgents;
}

/**
 * Update a single agent file.
 *
 * @param repoRoot - Repository root path
 * @param agentType - Agent type to update
 * @param data - Extracted technology data
 * @param featureDir - Feature directory name
 * @param createIfMissing - Whether to create file if it doesn't exist
 * @param templatesDir - Path to templates directory
 * @returns Update result or error
 */
async function updateSingleAgent(
  repoRoot: string,
  agentType: AgentType,
  data: PlanData,
  featureDir: string,
  createIfMissing: boolean,
  templatesDir: string
): Promise<{ result?: UpdateResult; error?: UpdateError; skipped?: boolean }> {
  const config = AGENT_CONFIGS[agentType];
  const agentPath = join(repoRoot, config.filePath);
  const fileExists = await exists(agentPath);

  if (!fileExists && !createIfMissing) {
    return { skipped: true };
  }

  try {
    let content: string;
    let created = false;

    if (fileExists) {
      // Read existing file
      content = await readFile(agentPath);
    } else {
      // Create from template or generate minimal content
      const templatePath = join(templatesDir, 'agent-file-template.md');
      if (await exists(templatePath)) {
        content = await readFile(templatePath);
      } else {
        content = generateMinimalContent(agentType, data, featureDir);
      }
      created = true;
    }

    // Update content with new technology info
    const updatedContent = updateAgentContent(content, data, featureDir);

    // Write back to file
    await writeFile(agentPath, updatedContent);

    return {
      result: {
        agent: agentType,
        filePath: agentPath,
        created,
      },
    };
  } catch (error) {
    return {
      error: {
        agent: agentType,
        error: {
          code: 'FILE_WRITE_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      },
    };
  }
}

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create the spec_kit.update_agent tool.
 *
 * This tool extracts technology information from a feature's plan.md file
 * and updates AI agent context files with that information.
 *
 * @param config - Plugin configuration
 * @param _core - Agency core API (unused)
 * @returns AgencyTool instance
 */
export function createUpdateAgentTool(
  config: SpecKitConfig,
  _core: AgencyCoreAPI
): AgencyTool {
  return {
    name: 'spec_kit.update_agent',
    description:
      'Update AI agent context files with technology information from the current feature plan.md',
    namespace: 'spec_kit',
    outputPattern: 'terse',
    modes: ['coding', 'speckit'],
    inputSchema: {
      type: 'object',
      properties: {
        agent_type: {
          type: 'string',
          enum: AGENT_TYPES,
          description:
            'Specific agent to update. If not provided, updates all existing agent files.',
        },
        create_if_missing: {
          type: 'boolean',
          default: false,
          description:
            'Whether to create agent file from template if it does not exist',
        },
        feature_dir: {
          type: 'string',
          description: 'Feature directory containing plan.md',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (defaults to process.cwd())',
        },
      },
    },
    async execute(params: unknown): Promise<ToolResult> {
      const {
        agent_type,
        create_if_missing = false,
        feature_dir,
        cwd,
      } = (params || {}) as UpdateAgentParams;
      const workDir = cwd || process.cwd();

      // Find repo root
      let repoRoot: string;
      try {
        repoRoot = await findRepoRoot(workDir);
      } catch (error) {
        if (error instanceof RepoNotFoundError) {
          const result: UpdateAgentResult = {
            success: false,
            updated: [],
            errors: [
              {
                agent: agent_type || ('unknown' as AgentType),
                error: {
                  code: 'FEATURE_DIR_NOT_FOUND',
                  message: 'Could not find repository root',
                },
              },
            ],
            plan_data: {},
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          };
        }
        throw error;
      }

      // Validate feature_dir is provided
      if (!feature_dir) {
        const result: UpdateAgentResult = {
          success: false,
          updated: [],
          errors: [
            {
              agent: agent_type || ('unknown' as AgentType),
              error: {
                code: 'FEATURE_DIR_NOT_FOUND',
                message: 'feature_dir parameter is required',
              },
            },
          ],
          plan_data: {},
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      // Check plan.md exists
      const planPath = join(feature_dir, 'plan.md');
      if (!(await exists(planPath))) {
        const result: UpdateAgentResult = {
          success: false,
          updated: [],
          errors: [
            {
              agent: agent_type || ('unknown' as AgentType),
              error: {
                code: 'PLAN_NOT_FOUND',
                message: `plan.md not found at ${planPath}`,
              },
            },
          ],
          plan_data: {},
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      // Read and parse plan.md
      const planContent = await readFile(planPath);
      const planData = extractTechnologies(planContent);

      // Determine templates directory
      const templatesDir = join(repoRoot, config.paths.templates);

      // Determine which agents to update
      let agentsToUpdate: AgentType[];
      if (agent_type) {
        // Validate agent_type
        if (!isAgentType(agent_type)) {
          const result: UpdateAgentResult = {
            success: false,
            updated: [],
            errors: [
              {
                agent: agent_type as AgentType,
                error: {
                  code: 'INVALID_CONFIG',
                  message: `Invalid agent_type: ${agent_type}. Valid types: ${AGENT_TYPES.join(', ')}`,
                },
              },
            ],
            plan_data: planData,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          };
        }
        agentsToUpdate = [agent_type];
      } else {
        // Update all existing agent files
        agentsToUpdate = await findExistingAgentFiles(repoRoot);
      }

      // Process each agent
      const updated: UpdateResult[] = [];
      const skipped: string[] = [];
      const errors: UpdateError[] = [];

      for (const agentType of agentsToUpdate) {
        const outcome = await updateSingleAgent(
          repoRoot,
          agentType,
          planData,
          feature_dir,
          create_if_missing,
          templatesDir
        );

        if (outcome.result) {
          updated.push(outcome.result);
        } else if (outcome.error) {
          errors.push(outcome.error);
        } else if (outcome.skipped) {
          skipped.push(agentType);
        }
      }

      // If specific agent requested but doesn't exist and create_if_missing is false
      if (agent_type && skipped.includes(agent_type)) {
        const result: UpdateAgentResult = {
          success: false,
          updated,
          skipped,
          errors: [
            {
              agent: agent_type,
              error: {
                code: 'AGENT_FILE_NOT_FOUND',
                message: `Agent file for ${agent_type} not found at ${AGENT_CONFIGS[agent_type].filePath}. Use create_if_missing: true to create it.`,
              },
            },
          ],
          plan_data: planData,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      const result: UpdateAgentResult = {
        success: errors.length === 0,
        updated,
        ...(skipped.length > 0 ? { skipped } : {}),
        ...(errors.length > 0 ? { errors } : {}),
        plan_data: planData,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    },
  };
}
