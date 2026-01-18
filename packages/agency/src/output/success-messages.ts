/**
 * Standard success messages for common operations.
 *
 * These short, consistent messages follow the terse output pattern.
 */

/**
 * Standard success messages for common operations.
 * Keys use snake_case following the pattern: category_action
 */
export const SUCCESS_MESSAGES = {
  // Git operations
  git_commit: 'Committed successfully.',
  git_push: 'Pushed to remote.',
  git_pull: 'Pulled from remote.',
  git_checkout: 'Switched branch.',
  git_merge: 'Merged successfully.',
  git_rebase: 'Rebased successfully.',
  git_stash: 'Changes stashed.',
  git_clone: 'Repository cloned.',

  // Build operations
  build_install: 'Dependencies installed.',
  build_compile: 'Build completed.',
  build_clean: 'Build artifacts cleaned.',
  build_bundle: 'Bundle created.',

  // Test operations
  test_unit: 'All tests passed.',
  test_lint: 'Linting passed.',
  test_typecheck: 'Type checking passed.',
  test_e2e: 'E2E tests passed.',

  // File operations
  file_write: 'File written.',
  file_delete: 'File deleted.',
  file_copy: 'File copied.',
  file_move: 'File moved.',
  file_create: 'File created.',

  // Generic
  completed: 'Completed successfully.',
} as const;

/**
 * Type for valid success message keys.
 */
export type SuccessMessageKey = keyof typeof SUCCESS_MESSAGES;

/**
 * Get a success message by key, with fallback to generic message.
 *
 * @param key - The success message key
 * @returns The success message string
 */
export function getSuccessMessage(key: SuccessMessageKey): string {
  return SUCCESS_MESSAGES[key] ?? SUCCESS_MESSAGES.completed;
}
