/**
 * Docker error classification
 *
 * Categorizes Docker errors for terse, machine-readable output.
 */

/**
 * Docker error classification categories
 */
export type DockerErrorCategory =
  | 'daemon'     // Docker daemon not running
  | 'permission' // Permission denied (socket, image registry)
  | 'not_found'  // Image, container, or network not found
  | 'network'    // Network failures (pull, push, connect)
  | 'resource'   // Resource constraints (disk, memory)
  | 'config'     // Configuration errors (invalid YAML, bad args)
  | 'unknown';   // Unclassified errors

/**
 * Classified Docker error for terse output
 */
export interface ClassifiedDockerError {
  /** Error category */
  category: DockerErrorCategory;

  /** Summarized error message (first line of stderr or formatted) */
  summary: string;

  /** Original exit code */
  exitCode: number;
}

/**
 * Error patterns for classification
 */
const ERROR_PATTERNS: Array<{
  category: DockerErrorCategory;
  patterns: RegExp[];
}> = [
  {
    category: 'daemon',
    patterns: [
      /cannot connect to the docker daemon/i,
      /is the docker daemon running/i,
      /docker\.sock.*no such file/i,
      /connection refused.*docker/i,
      /error during connect/i,
    ],
  },
  {
    category: 'permission',
    patterns: [
      /permission denied/i,
      /access denied/i,
      /unauthorized/i,
      /authentication required/i,
      /denied.*login/i,
    ],
  },
  {
    category: 'not_found',
    patterns: [
      /no such container/i,
      /no such image/i,
      /no such network/i,
      /no such volume/i,
      /image.*not found/i,
      /container.*not found/i,
      /manifest.*not found/i,
      /unable to find image/i,
    ],
  },
  {
    category: 'network',
    patterns: [
      /network.*unreachable/i,
      /timeout.*pull/i,
      /connection timed out/i,
      /error pulling image/i,
      /failed to resolve/i,
      /dial tcp/i,
      /net\/http/i,
    ],
  },
  {
    category: 'resource',
    patterns: [
      /no space left on device/i,
      /out of memory/i,
      /oom killed/i,
      /disk quota exceeded/i,
      /too many open files/i,
    ],
  },
  {
    category: 'config',
    patterns: [
      /yaml:/i,
      /yaml.*error/i,
      /invalid.*config/i,
      /invalid.*compose/i,
      /parse error/i,
      /syntax error/i,
      /unknown.*flag/i,
      /invalid.*argument/i,
    ],
  },
];

/**
 * Extract the first meaningful line from error output
 */
function extractSummary(stderr: string): string {
  const lines = stderr.split('\n').filter((line) => line.trim());

  // Skip common prefixes
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and common noise
    if (!trimmed || trimmed.startsWith('time=') || trimmed.startsWith('level=')) {
      continue;
    }
    // Remove common prefixes
    const cleaned = trimmed
      .replace(/^error:/i, '')
      .replace(/^Error response from daemon:/i, '')
      .trim();

    if (cleaned) {
      // Limit length
      return cleaned.length > 100 ? cleaned.slice(0, 97) + '...' : cleaned;
    }
  }

  return stderr.slice(0, 100).trim() || 'Unknown error';
}

/**
 * Classify a Docker error based on stderr content
 *
 * @param stderr - Standard error output from Docker command
 * @param exitCode - Process exit code
 * @returns Classified error with category and summary
 */
export function classifyDockerError(
  stderr: string,
  exitCode: number
): ClassifiedDockerError {
  const stderrLower = stderr.toLowerCase();

  // Check each category's patterns
  for (const { category, patterns } of ERROR_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(stderrLower)) {
        return {
          category,
          summary: extractSummary(stderr),
          exitCode,
        };
      }
    }
  }

  // Default to unknown category
  return {
    category: 'unknown',
    summary: extractSummary(stderr),
    exitCode,
  };
}

/**
 * Format a classified error for terse output
 *
 * @param error - Classified Docker error
 * @returns Formatted error string
 */
export function formatDockerError(error: ClassifiedDockerError): string {
  return `[${error.category.toUpperCase()}] ${error.summary}\nExit code: ${error.exitCode}`;
}
