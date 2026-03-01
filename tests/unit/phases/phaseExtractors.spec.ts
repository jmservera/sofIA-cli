/**
 * Phase extraction logic tests.
 *
 * Tests for extractResult() implementations that parse structured JSON
 * blocks from LLM responses and map them to WorkshopSession fields.
 */
import { describe, it, expect } from 'vitest';

import {
  extractJsonBlock,
  extractBusinessContext,
  extractWorkflow,
  extractIdeas,
  extractEvaluation,
  extractSelection,
  extractPlan,
  extractPocState,
  extractSessionName,
} from '../../../src/phases/phaseExtractors.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';

function _emptySession(): WorkshopSession {
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
  };
}

describe('extractJsonBlock', () => {
  it('extracts JSON from markdown code fence', () => {
    const response = `Here are the results:\n\`\`\`json\n{"key": "value"}\n\`\`\`\nDone.`;
    const result = extractJsonBlock(response);
    expect(result).toEqual({ key: 'value' });
  });

  it('extracts JSON from unfenced block', () => {
    const response = `Result: {"businessDescription": "A company"}`;
    const result = extractJsonBlock(response);
    expect(result).toEqual({ businessDescription: 'A company' });
  });

  it('returns null when no JSON found', () => {
    const response = 'This is a plain text response with no JSON.';
    const result = extractJsonBlock(response);
    expect(result).toBeNull();
  });

  it('handles malformed JSON gracefully', () => {
    const response = '```json\n{broken: json}\n```';
    const result = extractJsonBlock(response);
    expect(result).toBeNull();
  });

  it('extracts JSON array from code fence', () => {
    const response = '```json\n[{"id": "1"}, {"id": "2"}]\n```';
    const result = extractJsonBlock(response);
    expect(result).toEqual([{ id: '1' }, { id: '2' }]);
  });
});

describe('extractBusinessContext', () => {
  it('extracts valid business context from response', () => {
    const response = `Here's what I gathered:

\`\`\`json
{
  "businessDescription": "A logistics company",
  "challenges": ["Slow routing", "High costs"]
}
\`\`\``;
    const result = extractBusinessContext(response);
    expect(result).not.toBeNull();
    expect(result!.businessDescription).toBe('A logistics company');
    expect(result!.challenges).toEqual(['Slow routing', 'High costs']);
  });

  it('returns null for non-matching JSON', () => {
    const response = '```json\n{"unrelated": "data"}\n```';
    const result = extractBusinessContext(response);
    expect(result).toBeNull();
  });

  it('returns null when no JSON present', () => {
    const result = extractBusinessContext('No structured data here.');
    expect(result).toBeNull();
  });

  it('includes optional fields when present', () => {
    const response = `\`\`\`json
{
  "businessDescription": "SaaS platform",
  "challenges": ["Scale"],
  "constraints": ["Budget limited"],
  "successMetrics": [{"name": "Revenue", "value": "10M", "unit": "USD"}]
}
\`\`\``;
    const result = extractBusinessContext(response);
    expect(result!.constraints).toEqual(['Budget limited']);
    expect(result!.successMetrics).toHaveLength(1);
  });
});

describe('extractWorkflow', () => {
  it('extracts workflow map with activities and edges', () => {
    const response = `\`\`\`json
{
  "activities": [
    {"id": "s1", "name": "Receive Order"},
    {"id": "s2", "name": "Process Order"}
  ],
  "edges": [
    {"fromStepId": "s1", "toStepId": "s2"}
  ]
}
\`\`\``;
    const result = extractWorkflow(response);
    expect(result).not.toBeNull();
    expect(result!.activities).toHaveLength(2);
    expect(result!.edges).toHaveLength(1);
  });

  it('returns null for invalid workflow', () => {
    const response = '```json\n{"name": "not a workflow"}\n```';
    const result = extractWorkflow(response);
    expect(result).toBeNull();
  });
});

describe('extractIdeas', () => {
  it('extracts array of idea cards', () => {
    const response = `\`\`\`json
[
  {
    "id": "idea-1",
    "title": "AI Routing",
    "description": "Use AI to optimize delivery routes",
    "workflowStepIds": ["s1", "s2"]
  }
]
\`\`\``;
    const result = extractIdeas(response);
    expect(result).toHaveLength(1);
    expect(result![0].title).toBe('AI Routing');
  });

  it('extracts ideas from object wrapper', () => {
    const response = `\`\`\`json
{
  "ideas": [
    {
      "id": "idea-1",
      "title": "AI Routing",
      "description": "Optimize routes",
      "workflowStepIds": ["s1"]
    }
  ]
}
\`\`\``;
    const result = extractIdeas(response);
    expect(result).toHaveLength(1);
  });

  it('returns null when no ideas found', () => {
    const result = extractIdeas('No ideas in this response');
    expect(result).toBeNull();
  });
});

describe('extractEvaluation', () => {
  it('extracts evaluation with method', () => {
    const response = `\`\`\`json
{
  "method": "feasibility-value-matrix",
  "ideas": [
    {
      "ideaId": "idea-1",
      "feasibility": 4,
      "value": 5,
      "risks": ["Data quality"]
    }
  ]
}
\`\`\``;
    const result = extractEvaluation(response);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('feasibility-value-matrix');
    expect(result!.ideas).toHaveLength(1);
  });

  it('returns null for non-evaluation JSON', () => {
    const result = extractEvaluation('```json\n{"foo": "bar"}\n```');
    expect(result).toBeNull();
  });
});

describe('extractSelection', () => {
  it('extracts selected idea', () => {
    const response = `\`\`\`json
{
  "ideaId": "idea-1",
  "selectionRationale": "Highest combined score",
  "confirmedByUser": false
}
\`\`\``;
    const result = extractSelection(response);
    expect(result).not.toBeNull();
    expect(result!.ideaId).toBe('idea-1');
    expect(result!.confirmedByUser).toBe(false);
  });
});

describe('extractPlan', () => {
  it('extracts implementation plan with milestones', () => {
    const response = `\`\`\`json
{
  "milestones": [
    {
      "id": "m1",
      "title": "Setup",
      "items": ["Initialize project", "Configure CI"]
    },
    {
      "id": "m2",
      "title": "Core Features",
      "items": ["Implement routing", "Add monitoring"]
    }
  ],
  "architectureNotes": "Microservices architecture",
  "dependencies": ["Azure Maps API"]
}
\`\`\``;
    const result = extractPlan(response);
    expect(result).not.toBeNull();
    expect(result!.milestones).toHaveLength(2);
    expect(result!.architectureNotes).toBe('Microservices architecture');
  });
});

describe('extractPocState', () => {
  it('extracts PoC development state', () => {
    const response = `\`\`\`json
{
  "repoSource": "local",
  "iterations": [
    {
      "iteration": 1,
      "startedAt": "2025-01-01T00:00:00Z",
      "outcome": "scaffold",
      "filesChanged": ["package.json", "src/index.ts"],
      "changesSummary": "Initial scaffold"
    }
  ]
}
\`\`\``;
    const result = extractPocState(response);
    expect(result).not.toBeNull();
    expect(result!.iterations).toHaveLength(1);
  });

  it('returns null when no PoC data', () => {
    const result = extractPocState('Just text here');
    expect(result).toBeNull();
  });
});

// ── T062: extractSessionName ─────────────────────────────────────────────────

describe('extractSessionName', () => {
  it('extracts sessionName from JSON block in response', () => {
    const response = `Here's the summary:

\`\`\`json
{
  "businessDescription": "A logistics company",
  "challenges": ["Slow routing"],
  "sessionName": "Logistics AI Routing"
}
\`\`\``;
    const result = extractSessionName(response);
    expect(result).toBe('Logistics AI Routing');
  });

  it('returns null when sessionName is missing from JSON block', () => {
    const response = `\`\`\`json
{
  "businessDescription": "A company",
  "challenges": ["Growth"]
}
\`\`\``;
    const result = extractSessionName(response);
    expect(result).toBeNull();
  });

  it('returns null when no JSON block is present', () => {
    const result = extractSessionName('Just a plain text response with no JSON.');
    expect(result).toBeNull();
  });

  it('returns null when sessionName is not a string', () => {
    const response = `\`\`\`json
{ "sessionName": 42 }
\`\`\``;
    const result = extractSessionName(response);
    expect(result).toBeNull();
  });

  it('trims whitespace from sessionName', () => {
    const response = `\`\`\`json
{ "sessionName": "  Retail AI Onboarding  " }
\`\`\``;
    const result = extractSessionName(response);
    expect(result).toBe('Retail AI Onboarding');
  });

  it('returns null for empty string sessionName', () => {
    const response = `\`\`\`json
{ "sessionName": "" }
\`\`\``;
    const result = extractSessionName(response);
    expect(result).toBeNull();
  });
});
