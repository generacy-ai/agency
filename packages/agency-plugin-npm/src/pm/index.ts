/**
 * Package manager detection and command building
 */

export type {
  PackageManager,
  DetectionResult,
  DetectionError,
  DetectionOutcome,
  CommandType,
  CommandOptions,
  BuiltCommand,
} from './types.js';

export { detectPackageManager, isDetectionSuccess } from './detect.js';
export { buildCommand, getWorkspaceFlag } from './commands.js';
