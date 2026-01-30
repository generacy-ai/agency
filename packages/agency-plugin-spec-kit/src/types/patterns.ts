/**
 * Validation constants and patterns for spec-kit
 *
 * Provides regex patterns and constants for validating feature names,
 * task IDs, user stories, and other spec-kit constructs.
 */

/**
 * Pattern for feature branch/directory names.
 *
 * Format: `###-short-name` where:
 * - `###` is a 3-digit number (000-999)
 * - `short-name` is lowercase alphanumeric with hyphens
 *
 * @example
 * ```typescript
 * FEATURE_NAME_PATTERN.test('001-user-auth');     // true
 * FEATURE_NAME_PATTERN.test('042-api-v2');        // true
 * FEATURE_NAME_PATTERN.test('1-invalid');         // false (not 3 digits)
 * FEATURE_NAME_PATTERN.test('001-Invalid');       // false (uppercase)
 * ```
 */
export const FEATURE_NAME_PATTERN = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Maximum length for git branch names.
 *
 * Git allows up to 255 characters for refs, but some characters are
 * reserved. We use 244 as a safe maximum.
 */
export const MAX_BRANCH_LENGTH = 244;

/**
 * Pattern for task IDs (default format).
 *
 * Format: `T###` where `###` is a 3-digit number (001-999).
 *
 * @example
 * ```typescript
 * TASK_ID_PATTERN.test('T001');   // true
 * TASK_ID_PATTERN.test('T999');   // true
 * TASK_ID_PATTERN.test('T1');     // false (not 3 digits)
 * TASK_ID_PATTERN.test('TASK1');  // false (wrong prefix)
 * ```
 */
export const TASK_ID_PATTERN = /^T\d{3}$/;

/**
 * Pattern for user story references in task descriptions.
 *
 * Format: `[US#]` where `#` is one or more digits.
 *
 * @example
 * ```typescript
 * USER_STORY_PATTERN.test('[US1]');    // true
 * USER_STORY_PATTERN.test('[US12]');   // true
 * USER_STORY_PATTERN.test('US1');      // false (no brackets)
 * USER_STORY_PATTERN.test('[US]');     // false (no number)
 * ```
 */
export const USER_STORY_PATTERN = /^\[US\d+\]$/;

/**
 * Pattern for extracting user story number from reference.
 *
 * Captures the numeric part of a user story reference.
 *
 * @example
 * ```typescript
 * const match = '[US42]'.match(USER_STORY_EXTRACT_PATTERN);
 * if (match) console.log(match[1]); // "42"
 * ```
 */
export const USER_STORY_EXTRACT_PATTERN = /\[US(\d+)\]/;

/**
 * Pattern for existing issue references in task descriptions.
 *
 * Format: `[#123]` where `123` is the issue number.
 *
 * @example
 * ```typescript
 * EXISTING_ISSUE_PATTERN.test('[#123]');  // true
 * EXISTING_ISSUE_PATTERN.test('[#1]');    // true
 * EXISTING_ISSUE_PATTERN.test('#123');    // false (no brackets)
 * EXISTING_ISSUE_PATTERN.test('[#]');     // false (no number)
 * ```
 */
export const EXISTING_ISSUE_PATTERN = /^\[#(\d+)\]$/;

/**
 * Pattern for extracting issue number from reference.
 *
 * Captures the numeric part of an issue reference.
 *
 * @example
 * ```typescript
 * const match = '[#123]'.match(EXISTING_ISSUE_EXTRACT_PATTERN);
 * if (match) console.log(match[1]); // "123"
 * ```
 */
export const EXISTING_ISSUE_EXTRACT_PATTERN = /\[#(\d+)\]/;

/**
 * Pattern for task group IDs (default format).
 *
 * Format: `TG-###` where `###` is a 3-digit number.
 *
 * @example
 * ```typescript
 * TASK_GROUP_ID_PATTERN.test('TG-001');   // true
 * TASK_GROUP_ID_PATTERN.test('TG-999');   // true
 * TASK_GROUP_ID_PATTERN.test('TG001');    // false (no separator)
 * ```
 */
export const TASK_GROUP_ID_PATTERN = /^TG-\d{3}$/;

/**
 * Pattern for task group headers in tasks.md.
 *
 * Format: `### TG-### [US#]? Task Group: Title` or `### TG-### [US#]? Title`
 *
 * Captures:
 * 1. Group ID (e.g., "TG-001")
 * 2. User story number (optional)
 * 3. Title
 *
 * @example
 * ```typescript
 * const header = '### TG-001 [US1] Task Group: Setup Module';
 * const match = header.match(TASK_GROUP_HEADER_PATTERN);
 * if (match) {
 *   console.log(match[1]); // "TG-001"
 *   console.log(match[2]); // "1"
 *   console.log(match[3]); // "Setup Module"
 * }
 * ```
 */
export const TASK_GROUP_HEADER_PATTERN =
  /^###\s+(TG-\d{3})\s*(?:\[US(\d+)\])?\s*(?:Task Group:\s*)?(.+)$/;

/**
 * Pattern for parallel marker in task descriptions.
 *
 * Matches `[P]` at the start of a task description.
 *
 * @example
 * ```typescript
 * PARALLEL_MARKER_PATTERN.test('[P]');           // true
 * PARALLEL_MARKER_PATTERN.test('[P] Do thing');  // true (with content after)
 * ```
 */
export const PARALLEL_MARKER_PATTERN = /^\[P\]/;

/**
 * Pattern for phase headers in tasks.md.
 *
 * Matches `## Phase N: Name` format.
 *
 * Captures:
 * 1. Phase number
 * 2. Phase name
 *
 * @example
 * ```typescript
 * const header = '## Phase 2: Core Implementation';
 * const match = header.match(PHASE_HEADER_PATTERN);
 * if (match) {
 *   console.log(match[1]); // "2"
 *   console.log(match[2]); // "Core Implementation"
 * }
 * ```
 */
export const PHASE_HEADER_PATTERN = /^##\s+Phase\s+(\d+):\s*(.+)$/;

/**
 * Pattern for checkbox items in markdown.
 *
 * Matches `- [ ] text` or `- [x] text` or `- [X] text`.
 *
 * Captures:
 * 1. Check mark (space, x, or X)
 * 2. Text content
 *
 * @example
 * ```typescript
 * const line = '- [x] Complete this task';
 * const match = line.match(CHECKBOX_PATTERN);
 * if (match) {
 *   console.log(match[1] !== ' '); // true (completed)
 *   console.log(match[2]); // "Complete this task"
 * }
 * ```
 */
export const CHECKBOX_PATTERN = /^-\s+\[([ xX])\]\s+(.+)$/;

/**
 * Pattern for scope estimates in task descriptions.
 *
 * Matches `[XS]`, `[S]`, `[M]`, `[L]`, or `[XL]`.
 *
 * @example
 * ```typescript
 * SCOPE_PATTERN.test('[S]');   // true
 * SCOPE_PATTERN.test('[XL]');  // true
 * SCOPE_PATTERN.test('[XXL]'); // false
 * ```
 */
export const SCOPE_PATTERN = /^\[(XS|S|M|L|XL)\]$/;

/**
 * Pattern for extracting scope from task description.
 *
 * Captures the scope estimate from within a task line.
 *
 * @example
 * ```typescript
 * const desc = '[S] Implement feature';
 * const match = desc.match(SCOPE_EXTRACT_PATTERN);
 * if (match) console.log(match[1]); // "S"
 * ```
 */
export const SCOPE_EXTRACT_PATTERN = /\[(XS|S|M|L|XL)\]/;

/**
 * Pattern for dependency references in task descriptions.
 *
 * Matches `depends on T###` or `after T###` formats.
 *
 * @example
 * ```typescript
 * const desc = 'depends on T001, T002';
 * const matches = desc.match(DEPENDENCY_PATTERN);
 * // Finds task IDs mentioned after "depends on" or "after"
 * ```
 */
export const DEPENDENCY_PATTERN = /(?:depends?\s+on|after)\s+(T\d{3}(?:\s*,\s*T\d{3})*)/i;

/**
 * Valid scope estimate values.
 */
export const VALID_SCOPES = ['XS', 'S', 'M', 'L', 'XL'] as const;

/**
 * Type for valid scope estimates.
 */
export type ScopeEstimate = (typeof VALID_SCOPES)[number];
