/**
 * Tests for parse-status utility
 */

import { describe, it, expect } from 'vitest';
import { parseStatus } from '../src/utils/parse-status.js';

describe('parseStatus', () => {
  it('should parse branch header', () => {
    const output = `# branch.oid abc123
# branch.head main
`;
    const result = parseStatus(output);
    expect(result.branch).toBe('main');
  });

  it('should parse upstream tracking', () => {
    const output = `# branch.oid abc123
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -1
`;
    const result = parseStatus(output);
    expect(result.branch).toBe('main');
    expect(result.upstream).toBe('origin/main');
    expect(result.ahead).toBe(2);
    expect(result.behind).toBe(1);
  });

  it('should parse staged files', () => {
    const output = `# branch.head main
1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 abc1234567890123456789012345678901234567890 new-file.ts
`;
    const result = parseStatus(output);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toEqual({
      path: 'new-file.ts',
      status: 'added',
    });
  });

  it('should parse modified but unstaged files', () => {
    const output = `# branch.head main
1 .M N... 100644 100644 100644 abc1234567890123456789012345678901234567890 abc1234567890123456789012345678901234567890 modified-file.ts
`;
    const result = parseStatus(output);
    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]).toEqual({
      path: 'modified-file.ts',
      status: 'modified',
    });
  });

  it('should parse untracked files', () => {
    const output = `# branch.head main
? untracked-file.txt
? another-untracked.js
`;
    const result = parseStatus(output);
    expect(result.untracked).toEqual(['untracked-file.txt', 'another-untracked.js']);
  });

  it('should parse renamed files', () => {
    const output = `# branch.head main
2 R. N... 100644 100644 100644 abc1234567890123456789012345678901234567890 abc1234567890123456789012345678901234567890 R100 new-name.ts	old-name.ts
`;
    const result = parseStatus(output);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]?.status).toBe('renamed');
  });

  it('should parse conflicted files', () => {
    const output = `# branch.head main
u UU N... 100644 100644 100644 100644 abc123 def456 789abc conflict-file.ts
`;
    const result = parseStatus(output);
    expect(result.conflicts).toContain('conflict-file.ts');
  });

  it('should handle empty output', () => {
    const result = parseStatus('');
    expect(result.branch).toBe('');
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual([]);
    expect(result.untracked).toEqual([]);
  });

  it('should parse complex status with multiple entries', () => {
    const output = `# branch.oid abc123def456
# branch.head feature-branch
# branch.upstream origin/feature-branch
# branch.ab +3 -0
1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 abc1234567890123456789012345678901234567890 new-file.ts
1 MM N... 100644 100644 100644 abc1234567890123456789012345678901234567890 def4567890123456789012345678901234567890ab modified-staged.ts
1 .M N... 100644 100644 100644 abc1234567890123456789012345678901234567890 abc1234567890123456789012345678901234567890 modified-only.ts
? untracked.txt
`;
    const result = parseStatus(output);

    expect(result.branch).toBe('feature-branch');
    expect(result.upstream).toBe('origin/feature-branch');
    expect(result.ahead).toBe(3);
    expect(result.behind).toBe(0);
    expect(result.staged).toHaveLength(2);
    expect(result.unstaged).toHaveLength(2); // MM file appears in both
    expect(result.untracked).toEqual(['untracked.txt']);
  });
});
