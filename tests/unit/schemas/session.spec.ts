/**
 * Unit tests for WorkshopSession Zod schemas.
 *
 * Validates that the session data model matches the spec in data-model.md
 * and the contract in contracts/session-json.md.
 */
import { describe, it, expect } from 'vitest';

import {
  Phase,
  SessionStatus,
  workshopSessionSchema,
  type WorkshopSession,
} from '../../../src/shared/schemas/session.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function validSession(overrides: Partial<WorkshopSession> = {}): unknown {
  return {
    sessionId: 'test-001',
    schemaVersion: '1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    phase: 'Discover',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    ...overrides,
  };
}

// ── Phase enum ───────────────────────────────────────────────────────────────

describe('Phase', () => {
  it('contains all seven governed phases', () => {
    const expected = [
      'Discover',
      'Ideate',
      'Design',
      'Select',
      'Plan',
      'Develop',
      'Complete',
    ];
    expect(Phase).toEqual(expected);
  });
});

// ── SessionStatus enum ───────────────────────────────────────────────────────

describe('SessionStatus', () => {
  it('contains Active, Paused, Completed, Errored', () => {
    expect(SessionStatus).toEqual(['Active', 'Paused', 'Completed', 'Errored']);
  });
});

// ── workshopSessionSchema ────────────────────────────────────────────────────

describe('workshopSessionSchema', () => {
  it('parses a minimal valid session', () => {
    const result = workshopSessionSchema.parse(validSession());
    expect(result.sessionId).toBe('test-001');
    expect(result.phase).toBe('Discover');
    expect(result.status).toBe('Active');
  });

  it('rejects missing required field sessionId', () => {
    const data = validSession();
    delete (data as Record<string, unknown>).sessionId;
    expect(() => workshopSessionSchema.parse(data)).toThrow();
  });

  it('rejects invalid phase value', () => {
    expect(() =>
      workshopSessionSchema.parse(validSession({ phase: 'InvalidPhase' as Phase[number] })),
    ).toThrow();
  });

  it('rejects invalid status value', () => {
    expect(() =>
      workshopSessionSchema.parse(validSession({ status: 'Nope' as SessionStatus[number] })),
    ).toThrow();
  });

  it('accepts optional entity fields', () => {
    const result = workshopSessionSchema.parse(
      validSession({
        businessContext: {
          businessDescription: 'A retail company',
          challenges: ['inventory tracking'],
        },
        topic: { topicArea: 'Supply Chain' },
      }),
    );
    expect(result.businessContext?.businessDescription).toBe('A retail company');
    expect(result.topic?.topicArea).toBe('Supply Chain');
  });

  it('preserves unknown extra fields (forward compat)', () => {
    const raw = { ...validSession(), futureField: 'hello' } as Record<string, unknown>;
    const result = workshopSessionSchema.parse(raw);
    // Zod passthrough should keep the extra field
    expect((result as Record<string, unknown>).futureField).toBe('hello');
  });

  it('handles a full session with ideas and evaluation', () => {
    const result = workshopSessionSchema.parse(
      validSession({
        ideas: [
          {
            id: 'idea-1',
            title: 'Smart Onboarding',
            description: 'AI-guided onboarding',
            workflowStepIds: ['step-1'],
          },
        ],
        evaluation: {
          ideas: [
            {
              ideaId: 'idea-1',
              feasibility: 4,
              value: 5,
            },
          ],
          method: 'feasibility-value-matrix',
        },
      }),
    );
    expect(result.ideas).toHaveLength(1);
    expect(result.evaluation?.method).toBe('feasibility-value-matrix');
  });

  it('validates participant roles', () => {
    const result = workshopSessionSchema.parse(
      validSession({
        participants: [
          { id: 'p1', displayName: 'Alice', role: 'Facilitator' },
          { id: 'p2', displayName: 'Bob', role: 'Attendee' },
        ],
      }),
    );
    expect(result.participants).toHaveLength(2);
  });

  it('rejects invalid participant role', () => {
    expect(() =>
      workshopSessionSchema.parse(
        validSession({
          participants: [{ id: 'p1', displayName: 'Alice', role: 'Admin' }],
        }),
      ),
    ).toThrow();
  });

  it('validates ConversationTurn array in turns', () => {
    const result = workshopSessionSchema.parse(
      validSession({
        turns: [
          {
            phase: 'Discover',
            sequence: 1,
            role: 'user',
            content: 'We are a retail company',
            timestamp: '2026-01-01T00:01:00Z',
          },
          {
            phase: 'Discover',
            sequence: 2,
            role: 'assistant',
            content: 'Got it! Tell me more about your challenges.',
            timestamp: '2026-01-01T00:02:00Z',
          },
        ],
      }),
    );
    expect(result.turns).toHaveLength(2);
  });

  it('validates ArtifactIndex with generated files', () => {
    const result = workshopSessionSchema.parse(
      validSession({
        artifacts: {
          exportDir: './exports/test-001/',
          generatedFiles: [
            {
              relativePath: 'discover.md',
              type: 'markdown',
              createdAt: '2026-01-01T00:05:00Z',
            },
          ],
        },
      }),
    );
    expect(result.artifacts.generatedFiles).toHaveLength(1);
  });

  it('validates PocDevelopmentState', () => {
    const result = workshopSessionSchema.parse(
      validSession({
        poc: {
          iterations: [],
        },
      }),
    );
    expect(result.poc?.iterations).toEqual([]);
  });

  it('validates ImplementationPlan with milestones', () => {
    const result = workshopSessionSchema.parse(
      validSession({
        plan: {
          milestones: [
            { id: 'm1', title: 'Phase 1', items: ['Setup', 'Build'] },
          ],
        },
      }),
    );
    expect(result.plan?.milestones).toHaveLength(1);
  });

  it('validates BXT evaluation with classification', () => {
    const result = workshopSessionSchema.parse(
      validSession({
        evaluation: {
          ideas: [
            {
              ideaId: 'idea-1',
              feasibility: 3,
              value: 4,
              risks: ['Data quality'],
              dataNeeded: ['CRM data'],
              humanValue: ['Time savings'],
              kpisInfluenced: ['CSAT'],
            },
          ],
          method: 'feasibility-value-matrix',
        },
      }),
    );
    expect(result.evaluation?.ideas[0].risks).toContain('Data quality');
  });

  it('validates SelectedIdea', () => {
    const result = workshopSessionSchema.parse(
      validSession({
        selection: {
          ideaId: 'idea-1',
          selectionRationale: 'Highest BXT score',
          confirmedByUser: true,
          confirmedAt: '2026-01-01T01:00:00Z',
        },
      }),
    );
    expect(result.selection?.confirmedByUser).toBe(true);
  });

  it('validates WorkflowMap with steps and edges', () => {
    const result = workshopSessionSchema.parse(
      validSession({
        workflow: {
          activities: [
            { id: 'step-1', name: 'Receive Order' },
            { id: 'step-2', name: 'Process Payment' },
          ],
          edges: [{ fromStepId: 'step-1', toStepId: 'step-2' }],
        },
      }),
    );
    expect(result.workflow?.activities).toHaveLength(2);
    expect(result.workflow?.edges).toHaveLength(1);
  });

  it('validates CardSelection', () => {
    const result = workshopSessionSchema.parse(
      validSession({
        cards: {
          selectedCards: [
            { id: 'extract-information', title: 'Extract Information' },
          ],
          scores: [
            {
              cardId: 'extract-information',
              dimensions: { relevance: 5, feasibility: 3 },
            },
          ],
        },
      }),
    );
    expect(result.cards?.selectedCards).toHaveLength(1);
  });

  it('validates ErrorRecord array', () => {
    const result = workshopSessionSchema.parse(
      validSession({
        errors: [
          {
            timestamp: '2026-01-01T00:10:00Z',
            code: 'MCP_TIMEOUT',
            message: 'WorkIQ timed out after 30s',
          },
        ],
      }),
    );
    expect(result.errors).toHaveLength(1);
  });
});
