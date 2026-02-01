/**
 * Tests for default template content
 *
 * Verifies that all default template exports contain valid, well-structured content.
 */

import { describe, it, expect } from 'vitest';
import { SPEC_TEMPLATE_CONTENT } from '../../src/templates/defaults/spec.js';
import { PLAN_TEMPLATE_CONTENT } from '../../src/templates/defaults/plan.js';
import { TASKS_TEMPLATE_CONTENT } from '../../src/templates/defaults/tasks.js';
import { CHECKLIST_TEMPLATE_CONTENT } from '../../src/templates/defaults/checklist.js';
import { AGENT_FILE_TEMPLATE_CONTENT } from '../../src/templates/defaults/agent-file.js';

describe('default template content', () => {
  describe('SPEC_TEMPLATE_CONTENT', () => {
    it('should be a non-empty string', () => {
      expect(typeof SPEC_TEMPLATE_CONTENT).toBe('string');
      expect(SPEC_TEMPLATE_CONTENT.length).toBeGreaterThan(0);
    });

    it('should contain a top-level markdown header', () => {
      expect(SPEC_TEMPLATE_CONTENT).toMatch(/^# /m);
    });

    it('should contain Feature Specification header', () => {
      expect(SPEC_TEMPLATE_CONTENT).toContain('# Feature Specification:');
    });

    it('should contain user stories section', () => {
      expect(SPEC_TEMPLATE_CONTENT).toContain('## User Scenarios & Testing');
      expect(SPEC_TEMPLATE_CONTENT).toContain('### User Story 1');
      expect(SPEC_TEMPLATE_CONTENT).toContain('### User Story 2');
      expect(SPEC_TEMPLATE_CONTENT).toContain('### User Story 3');
    });

    it('should contain acceptance scenarios format', () => {
      expect(SPEC_TEMPLATE_CONTENT).toContain('**Acceptance Scenarios**');
      expect(SPEC_TEMPLATE_CONTENT).toContain('**Given**');
      expect(SPEC_TEMPLATE_CONTENT).toContain('**When**');
      expect(SPEC_TEMPLATE_CONTENT).toContain('**Then**');
    });

    it('should contain requirements section', () => {
      expect(SPEC_TEMPLATE_CONTENT).toContain('## Requirements');
      expect(SPEC_TEMPLATE_CONTENT).toContain('### Functional Requirements');
    });

    it('should contain success criteria section', () => {
      expect(SPEC_TEMPLATE_CONTENT).toContain('## Success Criteria');
      expect(SPEC_TEMPLATE_CONTENT).toContain('### Measurable Outcomes');
    });

    it('should contain priority markers', () => {
      expect(SPEC_TEMPLATE_CONTENT).toContain('(Priority: P1)');
      expect(SPEC_TEMPLATE_CONTENT).toContain('(Priority: P2)');
      expect(SPEC_TEMPLATE_CONTENT).toContain('(Priority: P3)');
    });

    it('should contain edge cases section', () => {
      expect(SPEC_TEMPLATE_CONTENT).toContain('### Edge Cases');
    });
  });

  describe('PLAN_TEMPLATE_CONTENT', () => {
    it('should be a non-empty string', () => {
      expect(typeof PLAN_TEMPLATE_CONTENT).toBe('string');
      expect(PLAN_TEMPLATE_CONTENT.length).toBeGreaterThan(0);
    });

    it('should contain a top-level markdown header', () => {
      expect(PLAN_TEMPLATE_CONTENT).toMatch(/^# /m);
    });

    it('should contain Implementation Plan header', () => {
      expect(PLAN_TEMPLATE_CONTENT).toContain('# Implementation Plan:');
    });

    it('should contain technical context section', () => {
      expect(PLAN_TEMPLATE_CONTENT).toContain('## Technical Context');
    });

    it('should contain technology configuration fields', () => {
      expect(PLAN_TEMPLATE_CONTENT).toContain('**Language/Version**');
      expect(PLAN_TEMPLATE_CONTENT).toContain('**Primary Dependencies**');
      expect(PLAN_TEMPLATE_CONTENT).toContain('**Storage**');
      expect(PLAN_TEMPLATE_CONTENT).toContain('**Testing**');
      expect(PLAN_TEMPLATE_CONTENT).toContain('**Target Platform**');
    });

    it('should contain project structure section', () => {
      expect(PLAN_TEMPLATE_CONTENT).toContain('## Project Structure');
    });

    it('should contain summary section', () => {
      expect(PLAN_TEMPLATE_CONTENT).toContain('## Summary');
    });

    it('should contain constitution check section', () => {
      expect(PLAN_TEMPLATE_CONTENT).toContain('## Constitution Check');
    });

    it('should contain complexity tracking section', () => {
      expect(PLAN_TEMPLATE_CONTENT).toContain('## Complexity Tracking');
    });
  });

  describe('TASKS_TEMPLATE_CONTENT', () => {
    it('should be a non-empty string', () => {
      expect(typeof TASKS_TEMPLATE_CONTENT).toBe('string');
      expect(TASKS_TEMPLATE_CONTENT.length).toBeGreaterThan(0);
    });

    it('should contain a top-level markdown header', () => {
      expect(TASKS_TEMPLATE_CONTENT).toMatch(/^# /m);
    });

    it('should contain Tasks header', () => {
      expect(TASKS_TEMPLATE_CONTENT).toContain('# Tasks:');
    });

    it('should contain task format section', () => {
      expect(TASKS_TEMPLATE_CONTENT).toContain('## Format:');
      expect(TASKS_TEMPLATE_CONTENT).toContain('[P]');
      expect(TASKS_TEMPLATE_CONTENT).toContain('[Story]');
    });

    it('should contain phase sections', () => {
      expect(TASKS_TEMPLATE_CONTENT).toContain('## Phase 1: Setup');
      expect(TASKS_TEMPLATE_CONTENT).toContain('## Phase 2: Foundational');
      expect(TASKS_TEMPLATE_CONTENT).toContain('## Phase 3: User Story 1');
    });

    it('should contain task checkbox format', () => {
      expect(TASKS_TEMPLATE_CONTENT).toContain('- [ ] T001');
      expect(TASKS_TEMPLATE_CONTENT).toContain('- [ ] T002');
    });

    it('should contain path conventions section', () => {
      expect(TASKS_TEMPLATE_CONTENT).toContain('## Path Conventions');
    });

    it('should contain dependencies section', () => {
      expect(TASKS_TEMPLATE_CONTENT).toContain('## Dependencies & Execution Order');
    });

    it('should contain implementation strategy section', () => {
      expect(TASKS_TEMPLATE_CONTENT).toContain('## Implementation Strategy');
    });

    it('should contain frontmatter', () => {
      expect(TASKS_TEMPLATE_CONTENT).toMatch(/^---\n/);
      expect(TASKS_TEMPLATE_CONTENT).toContain('description:');
    });
  });

  describe('CHECKLIST_TEMPLATE_CONTENT', () => {
    it('should be a non-empty string', () => {
      expect(typeof CHECKLIST_TEMPLATE_CONTENT).toBe('string');
      expect(CHECKLIST_TEMPLATE_CONTENT.length).toBeGreaterThan(0);
    });

    it('should contain a top-level markdown header', () => {
      expect(CHECKLIST_TEMPLATE_CONTENT).toMatch(/^# /m);
    });

    it('should contain Checklist header', () => {
      expect(CHECKLIST_TEMPLATE_CONTENT).toContain('Checklist:');
    });

    it('should contain checklist items with checkbox format', () => {
      expect(CHECKLIST_TEMPLATE_CONTENT).toContain('- [ ] CHK001');
      expect(CHECKLIST_TEMPLATE_CONTENT).toContain('- [ ] CHK002');
    });

    it('should contain category sections', () => {
      expect(CHECKLIST_TEMPLATE_CONTENT).toContain('## [Category 1]');
      expect(CHECKLIST_TEMPLATE_CONTENT).toContain('## [Category 2]');
    });

    it('should contain purpose field', () => {
      expect(CHECKLIST_TEMPLATE_CONTENT).toContain('**Purpose**');
    });

    it('should contain notes section', () => {
      expect(CHECKLIST_TEMPLATE_CONTENT).toContain('## Notes');
    });
  });

  describe('AGENT_FILE_TEMPLATE_CONTENT', () => {
    it('should be a non-empty string', () => {
      expect(typeof AGENT_FILE_TEMPLATE_CONTENT).toBe('string');
      expect(AGENT_FILE_TEMPLATE_CONTENT.length).toBeGreaterThan(0);
    });

    it('should contain a top-level markdown header', () => {
      expect(AGENT_FILE_TEMPLATE_CONTENT).toMatch(/^# /m);
    });

    it('should contain Development Guidelines header', () => {
      expect(AGENT_FILE_TEMPLATE_CONTENT).toContain('Development Guidelines');
    });

    it('should contain active technologies section', () => {
      expect(AGENT_FILE_TEMPLATE_CONTENT).toContain('## Active Technologies');
    });

    it('should contain project structure section', () => {
      expect(AGENT_FILE_TEMPLATE_CONTENT).toContain('## Project Structure');
    });

    it('should contain commands section', () => {
      expect(AGENT_FILE_TEMPLATE_CONTENT).toContain('## Commands');
    });

    it('should contain code style section', () => {
      expect(AGENT_FILE_TEMPLATE_CONTENT).toContain('## Code Style');
    });

    it('should contain recent changes section', () => {
      expect(AGENT_FILE_TEMPLATE_CONTENT).toContain('## Recent Changes');
    });

    it('should contain manual additions markers', () => {
      expect(AGENT_FILE_TEMPLATE_CONTENT).toContain('<!-- MANUAL ADDITIONS START -->');
      expect(AGENT_FILE_TEMPLATE_CONTENT).toContain('<!-- MANUAL ADDITIONS END -->');
    });
  });

  describe('all templates', () => {
    const templates = [
      { name: 'SPEC_TEMPLATE_CONTENT', content: SPEC_TEMPLATE_CONTENT },
      { name: 'PLAN_TEMPLATE_CONTENT', content: PLAN_TEMPLATE_CONTENT },
      { name: 'TASKS_TEMPLATE_CONTENT', content: TASKS_TEMPLATE_CONTENT },
      { name: 'CHECKLIST_TEMPLATE_CONTENT', content: CHECKLIST_TEMPLATE_CONTENT },
      { name: 'AGENT_FILE_TEMPLATE_CONTENT', content: AGENT_FILE_TEMPLATE_CONTENT },
    ];

    it.each(templates)('$name should be a non-empty string', ({ content }) => {
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    });

    it.each(templates)('$name should contain markdown headers', ({ content }) => {
      expect(content).toMatch(/^#+ /m);
    });

    it.each(templates)('$name should not contain undefined or null placeholders', ({ content }) => {
      expect(content).not.toContain('undefined');
      expect(content).not.toContain('null');
    });

    it.each(templates)('$name should end with a newline', ({ content }) => {
      expect(content.endsWith('\n')).toBe(true);
    });
  });
});
