/**
 * Agent type definitions for spec-kit
 *
 * Defines supported AI agent types and their configuration
 * for updating agent context files with technology information.
 */

/**
 * Supported AI agent identifiers.
 */
export type AgentType =
  | 'claude'
  | 'gemini'
  | 'copilot'
  | 'cursor-agent'
  | 'qwen'
  | 'opencode'
  | 'codex'
  | 'windsurf'
  | 'kilocode'
  | 'auggie'
  | 'roo'
  | 'codebuddy'
  | 'qoder'
  | 'amp'
  | 'shai'
  | 'q'
  | 'bob';

/**
 * List of all supported agent types
 */
export const AGENT_TYPES: AgentType[] = [
  'claude',
  'gemini',
  'copilot',
  'cursor-agent',
  'qwen',
  'opencode',
  'codex',
  'windsurf',
  'kilocode',
  'auggie',
  'roo',
  'codebuddy',
  'qoder',
  'amp',
  'shai',
  'q',
  'bob',
];

/**
 * Configuration for each agent type.
 */
export interface AgentConfig {
  /** Agent type identifier */
  type: AgentType;
  /** File path relative to repository root */
  filePath: string;
  /** Human-readable display name */
  displayName: string;
}

/**
 * Static mapping of agent types to their configurations.
 */
export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  claude: {
    type: 'claude',
    filePath: 'CLAUDE.md',
    displayName: 'Claude Code',
  },
  gemini: {
    type: 'gemini',
    filePath: 'GEMINI.md',
    displayName: 'Gemini CLI',
  },
  copilot: {
    type: 'copilot',
    filePath: '.github/copilot-instructions.md',
    displayName: 'GitHub Copilot',
  },
  'cursor-agent': {
    type: 'cursor-agent',
    filePath: '.cursor/rules/agent.mdc',
    displayName: 'Cursor Agent',
  },
  qwen: {
    type: 'qwen',
    filePath: '.qwen/QWEN.md',
    displayName: 'Qwen',
  },
  opencode: {
    type: 'opencode',
    filePath: 'AGENTS.md',
    displayName: 'OpenCode',
  },
  codex: {
    type: 'codex',
    filePath: 'AGENTS.md',
    displayName: 'Codex CLI',
  },
  windsurf: {
    type: 'windsurf',
    filePath: '.windsurfrules',
    displayName: 'Windsurf',
  },
  kilocode: {
    type: 'kilocode',
    filePath: '.kilocode/rules.md',
    displayName: 'Kilocode',
  },
  auggie: {
    type: 'auggie',
    filePath: '.auggie/AUGGIE.md',
    displayName: 'Auggie',
  },
  roo: {
    type: 'roo',
    filePath: '.roo/rules.md',
    displayName: 'Roo',
  },
  codebuddy: {
    type: 'codebuddy',
    filePath: '.codebuddy/CODEBUDDY.md',
    displayName: 'CodeBuddy',
  },
  qoder: {
    type: 'qoder',
    filePath: '.qoder/QODER.md',
    displayName: 'Qoder',
  },
  amp: {
    type: 'amp',
    filePath: 'AGENT.md',
    displayName: 'Amp',
  },
  shai: {
    type: 'shai',
    filePath: '.shai/SHAI.md',
    displayName: 'Shai',
  },
  q: {
    type: 'q',
    filePath: '.q/Q.md',
    displayName: 'Q Developer',
  },
  bob: {
    type: 'bob',
    filePath: '.bob/BOB.md',
    displayName: 'Bob',
  },
};

/**
 * Type guard to check if a string is a valid AgentType
 */
export function isAgentType(value: string): value is AgentType {
  return AGENT_TYPES.includes(value as AgentType);
}
