/**
 * Command execution module
 */

export type { ExecResult, ExecOptions } from './runner.js';
export { exec, formatCommand, DEFAULT_EXEC_TIMEOUT_MS } from './runner.js';
export {
  combineStreams,
  clampTail,
  formatFailureOutput,
  MAX_FAILURE_LINES,
  MAX_FAILURE_CHARS,
} from './output.js';
