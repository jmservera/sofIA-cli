/**
 * Context summarizer tests.
 *
 * Tests for buildSummarizedContext() and renderSummarizedContext()
 * that project structured session fields into compact markdown
 * for injection into phase system prompts.
 */
import { describe, it, expect } from 'vitest';

import {
  buildSummarizedContext,
  renderSummarizedContext,
} from '../../../src/phases/contextSummarizer.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';

function emptySession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  return {
    sessionId: 'test-1',
    schemaVersion: '1.0.0',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    phase: 'Discover',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    turns: [],
    ...overrides,
  };
}

describe('buildSummarizedContext', () => {
  it('returns empty context for empty session', () => {
    const ctx = buildSummarizedContext(emptySession());
    expect(ctx.businessSummary).toBeUndefined();
    expect(ctx.challenges).toBeUndefined();
    expect(ctx.ideaSummaries).toBeUndefined();
    expect(ctx.evaluationSummary).toBeUndefined();
    expect(ctx.selectionSummary).toBeUndefined();
    expect(ctx.planMilestones).toBeUndefined();
  });

  it('projects all fields from a full session', () => {
    const session = emptySession({
      businessContext: {
        businessDescription: 'Zava Industries',
        challenges: ['Scaling', 'Automation'],
      },
      topic: { topicArea: 'Customer Support' },
      workflow: {
        activities: [
          { id: 's1', name: 'Intake' },
          { id: 's2', name: 'Processing' },
        ],
        edges: [],
      },
      ideas: [
        { id: 'idea-1', title: 'AI Bot', description: 'Automate support', workflowStepIds: ['s1'] },
      ],
      evaluation: {
        method: 'feasibility-value-matrix',
        ideas: [{ ideaId: 'idea-1', feasibility: 8, value: 9 }],
      },
      selection: {
        ideaId: 'idea-1',
        selectionRationale: 'Best fit',
        confirmedByUser: true,
      },
      plan: {
        milestones: [
          { id: 'm1', title: 'Phase 1', items: ['Task 1'] },
        ],
        architectureNotes: 'Node.js + TypeScript',
      },
    });

    const ctx = buildSummarizedContext(session);
    expect(ctx.businessSummary).toBe('Zava Industries');
    expect(ctx.challenges).toEqual(['Scaling', 'Automation']);
    expect(ctx.topicArea).toBe('Customer Support');
    expect(ctx.workflowSteps).toEqual(['Intake', 'Processing']);
    expect(ctx.ideaSummaries).toHaveLength(1);
    expect(ctx.ideaSummaries![0].title).toBe('AI Bot');
    expect(ctx.evaluationSummary).toContain('feasibility-value-matrix');
    expect(ctx.selectionSummary).toContain('idea-1');
    expect(ctx.planMilestones).toEqual(['Phase 1']);
    expect(ctx.architectureNotes).toBe('Node.js + TypeScript');
  });

  it('gracefully handles null fields', () => {
    const session = emptySession({
      businessContext: {
        businessDescription: 'Test Inc',
        challenges: [],
      },
      // Everything else is null/undefined
    });

    const ctx = buildSummarizedContext(session);
    expect(ctx.businessSummary).toBe('Test Inc');
    expect(ctx.ideaSummaries).toBeUndefined();
    expect(ctx.evaluationSummary).toBeUndefined();
  });

  it('includes discovery enrichment highlights', () => {
    const session = emptySession({
      discovery: {
        enrichment: {
          industryTrends: ['AI adoption growing', 'Cloud migration'],
          companyNews: ['Raised Series B'],
        },
      },
    });

    const ctx = buildSummarizedContext(session);
    expect(ctx.enrichmentHighlights).toBeDefined();
    expect(ctx.enrichmentHighlights).toContain('AI adoption growing');
    expect(ctx.enrichmentHighlights).toContain('Raised Series B');
  });
});

describe('renderSummarizedContext', () => {
  it('returns empty string for empty context', () => {
    expect(renderSummarizedContext({})).toBe('');
  });

  it('renders markdown with all sections', () => {
    const markdown = renderSummarizedContext({
      businessSummary: 'Zava Industries',
      challenges: ['Scaling'],
      topicArea: 'Support',
      workflowSteps: ['Intake', 'Processing'],
      ideaSummaries: [{ id: 'idea-1', title: 'AI Bot', description: 'Automate' }],
      evaluationSummary: 'Method: feasibility-value-matrix, 1 ideas evaluated',
      selectionSummary: 'Selected: idea-1',
      planMilestones: ['Phase 1'],
      architectureNotes: 'Node.js',
    });

    expect(markdown).toContain('## Prior Phase Context');
    expect(markdown).toContain('### Business Context');
    expect(markdown).toContain('Zava Industries');
    expect(markdown).toContain('### Workflow');
    expect(markdown).toContain('### Ideas');
    expect(markdown).toContain('### Evaluation');
    expect(markdown).toContain('### Selection');
    expect(markdown).toContain('### Plan');
  });

  it('omits sections when data is absent', () => {
    const markdown = renderSummarizedContext({
      businessSummary: 'Test Inc',
    });

    expect(markdown).toContain('Test Inc');
    expect(markdown).not.toContain('### Ideas');
    expect(markdown).not.toContain('### Plan');
  });
});
