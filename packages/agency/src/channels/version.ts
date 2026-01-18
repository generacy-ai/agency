/**
 * Version compatibility utilities for channels
 *
 * Implements semver-compatible version checking for channel compatibility.
 */

import semver from 'semver';

/**
 * Check if an available channel version is compatible with a required version
 *
 * Compatibility rules:
 * - Same major version
 * - Available version >= required version
 *
 * @param available The available channel version
 * @param required The minimum required version
 * @returns true if compatible, false otherwise
 */
export function isVersionCompatible(
  available: string,
  required: string
): boolean {
  const availableParsed = semver.parse(available);
  const requiredParsed = semver.parse(required);

  if (!availableParsed || !requiredParsed) {
    return false;
  }

  // Same major version and available >= required
  return (
    availableParsed.major === requiredParsed.major &&
    semver.gte(available, required)
  );
}
