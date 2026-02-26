/**
 * Slug generation utilities for spec-kit
 *
 * Provides functions to generate URL-friendly slugs from feature descriptions.
 */

/**
 * Stop words to remove from slugs
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'for',
  'of',
  'in',
  'on',
  'at',
  'by',
  'with',
  'and',
  'or',
  'as',
  'is',
  'it',
  'be',
  'are',
  'was',
  'were',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'this',
  'that',
  'these',
  'those',
  'i',
  'we',
  'you',
]);

/**
 * Options for slug generation
 */
export interface SlugOptions {
  /** Maximum number of words in the slug (default: 4) */
  maxWords?: number;
  /** Maximum length of the slug (default: 30) */
  maxLength?: number;
  /** Separator character (default: '-') */
  separator?: string;
  /** Whether to remove stop words (default: true) */
  removeStopWords?: boolean;
}

/**
 * Default slug generation options
 */
const DEFAULT_OPTIONS: Required<SlugOptions> = {
  maxWords: 4,
  maxLength: 30,
  separator: '-',
  removeStopWords: true,
};

/**
 * Generate a URL-friendly slug from a description.
 *
 * @param description - The text to convert to a slug
 * @param options - Optional configuration for slug generation
 * @returns A lowercase, hyphenated slug
 *
 * @example
 * ```typescript
 * generateSlug('Implement the User Authentication System');
 * // Returns: 'implement-user-authentication-system'
 *
 * generateSlug('Add a new feature for handling errors');
 * // Returns: 'add-new-feature-handling' (stop words removed, max 4 words)
 *
 * generateSlug('Short');
 * // Returns: 'short'
 *
 * generateSlug('');
 * // Returns: 'feature'
 * ```
 */
export function generateSlug(
  description: string,
  options: SlugOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Normalize: lowercase and replace non-alphanumeric with spaces
  const normalized = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  // Split into words
  let words = normalized.split(/\s+/).filter((word) => word.length > 0);

  // Remove stop words if configured
  if (opts.removeStopWords) {
    words = words.filter((word) => !STOP_WORDS.has(word));
  }

  // Handle edge case: all words were stop words
  if (words.length === 0) {
    return 'feature';
  }

  // Limit to maxWords
  if (opts.maxWords > 0 && words.length > opts.maxWords) {
    words = words.slice(0, opts.maxWords);
  }

  // Join with separator
  let slug = words.join(opts.separator);

  // Handle empty result or too short
  if (!slug || slug.length < 2) {
    return 'feature';
  }

  // Truncate to maxLength, respecting word boundaries
  if (slug.length > opts.maxLength) {
    const truncated = slug.substring(0, opts.maxLength);
    const lastSeparatorIndex = truncated.lastIndexOf(opts.separator);
    if (lastSeparatorIndex > 0) {
      slug = truncated.substring(0, lastSeparatorIndex);
    } else {
      slug = truncated;
    }
  }

  // Remove trailing separator
  if (slug.endsWith(opts.separator)) {
    slug = slug.slice(0, -opts.separator.length);
  }

  return slug;
}

/**
 * Export STOP_WORDS for testing purposes
 */
export { STOP_WORDS };
