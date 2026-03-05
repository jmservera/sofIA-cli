/**
 * Export writer.
 *
 * Generates Markdown artifacts per phase and summary.json
 * under the export directory for a session.
 *
 * Contract: specs/001-cli-workshop-rebuild/contracts/export-summary-json.md
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { WorkshopSession } from '../shared/schemas/session.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExportFile {
  path: string; // Relative to export directory
  type: string; // 'markdown' | 'json'
}

export interface ExportResult {
  exportDir: string;
  files: ExportFile[];
}

export interface ExportSummary {
  sessionId: string;
  exportedAt: string;
  phase: string;
  status: string;
  files: ExportFile[];
  highlights?: string[];
}

// ── Phase Markdown Generators ────────────────────────────────────────────────

function generateDiscoverMarkdown(session: WorkshopSession): string | null {
  const lines: string[] = ['# Discover Phase\n'];

  if (session.businessContext) {
    lines.push('## Business Context\n');
    lines.push(`**Business**: ${session.businessContext.businessDescription}\n`);
    lines.push('### Challenges\n');
    for (const c of session.businessContext.challenges) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }

  if (session.workflow) {
    lines.push('## Workflow\n');
    lines.push('### Activities\n');
    for (const act of session.workflow.activities) {
      lines.push(`- **${act.name}** (${act.id})`);
    }
    lines.push('');
    if (session.workflow.edges.length > 0) {
      lines.push('### Connections\n');
      for (const edge of session.workflow.edges) {
        lines.push(`- ${edge.fromStepId} → ${edge.toStepId}`);
      }
      lines.push('');
    }
  }

  // Include conversation turns for this phase
  const discoverTurns = session.turns?.filter((t) => t.phase === 'Discover') ?? [];
  if (discoverTurns.length > 0) {
    lines.push('## Conversation\n');
    for (const turn of discoverTurns) {
      lines.push(`**${turn.role}**: ${turn.content}\n`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function generateIdeateMarkdown(session: WorkshopSession): string | null {
  const lines: string[] = ['# Ideate Phase\n'];

  // FR-020: Render structured data if available
  if (session.ideas?.length) {
    lines.push('## Ideas\n');
    for (const idea of session.ideas) {
      lines.push(`### ${idea.title}\n`);
      lines.push(`${idea.description}\n`);
      if (idea.workflowStepIds.length > 0) {
        lines.push(`**Workflow steps**: ${idea.workflowStepIds.join(', ')}\n`);
      }
    }
  }

  // FR-022: Always include conversation turns if they exist
  const ideateTurns = session.turns?.filter((t) => t.phase === 'Ideate') ?? [];
  if (ideateTurns.length > 0) {
    lines.push('## Conversation\n');
    for (const turn of ideateTurns) {
      lines.push(`**${turn.role}**: ${turn.content}\n`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function generateDesignMarkdown(session: WorkshopSession): string | null {
  const lines: string[] = ['# Design Phase\n'];

  // FR-020: Render structured data if available
  if (session.evaluation) {
    lines.push(`## Evaluation\n`);
    lines.push(`**Method**: ${session.evaluation.method}\n`);
    lines.push('### Evaluated Ideas\n');
    for (const eval_ of session.evaluation.ideas) {
      lines.push(
        `- **${eval_.ideaId}**: Feasibility=${eval_.feasibility ?? 'N/A'}, Value=${eval_.value ?? 'N/A'}`,
      );
    }
    lines.push('');
  }

  // FR-022: Always include conversation turns if they exist
  const designTurns = session.turns?.filter((t) => t.phase === 'Design') ?? [];
  if (designTurns.length > 0) {
    lines.push('## Conversation\n');
    for (const turn of designTurns) {
      lines.push(`**${turn.role}**: ${turn.content}\n`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function generateSelectMarkdown(session: WorkshopSession): string | null {
  const lines: string[] = ['# Select Phase\n'];

  // FR-020: Render structured data if available
  if (session.selection) {
    lines.push(`## Selection\n`);
    lines.push(`**Selected Idea**: ${session.selection.ideaId}\n`);
    lines.push(`**Rationale**: ${session.selection.selectionRationale}\n`);
    lines.push(`**Confirmed**: ${session.selection.confirmedByUser ? 'Yes' : 'No'}\n`);
    if (session.selection.confirmedAt) {
      lines.push(`**Confirmed At**: ${session.selection.confirmedAt}\n`);
    }
  }

  // FR-022: Always include conversation turns if they exist
  const selectTurns = session.turns?.filter((t) => t.phase === 'Select') ?? [];
  if (selectTurns.length > 0) {
    lines.push('## Conversation\n');
    for (const turn of selectTurns) {
      lines.push(`**${turn.role}**: ${turn.content}\n`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function generatePlanMarkdown(session: WorkshopSession): string | null {
  const lines: string[] = ['# Plan Phase\n'];

  // FR-020: Render structured data if available
  if (session.plan?.milestones?.length) {
    lines.push('## Milestones\n');
    for (const m of session.plan.milestones) {
      lines.push(`### ${m.title}\n`);
      for (const item of m.items) {
        lines.push(`- ${item}`);
      }
      lines.push('');
    }
  }

  // FR-022: Always include conversation turns if they exist
  const planTurns = session.turns?.filter((t) => t.phase === 'Plan') ?? [];
  if (planTurns.length > 0) {
    lines.push('## Conversation\n');
    for (const turn of planTurns) {
      lines.push(`**${turn.role}**: ${turn.content}\n`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function generateDevelopMarkdown(session: WorkshopSession): string | null {
  const lines: string[] = ['# Develop Phase\n'];

  // FR-020: Render structured data if available
  if (session.poc) {
    const poc = session.poc;

    // Repository location
    lines.push('## PoC Repository\n');
    if (poc.repoUrl) {
      lines.push(`**Repository URL**: ${poc.repoUrl}\n`);
    } else if (poc.repoPath) {
      lines.push(`**Repository Path**: ${poc.repoPath}\n`);
    }
    if (poc.repoSource) {
      lines.push(`**Source**: ${poc.repoSource}\n`);
    }

    // Technology stack
    if (poc.techStack) {
      lines.push('## Technology Stack\n');
      lines.push(`- **Language**: ${poc.techStack.language}`);
      lines.push(`- **Runtime**: ${poc.techStack.runtime}`);
      lines.push(`- **Test Runner**: ${poc.techStack.testRunner}`);
      if (poc.techStack.framework) {
        lines.push(`- **Framework**: ${poc.techStack.framework}`);
      }
      if (poc.techStack.buildCommand) {
        lines.push(`- **Build Command**: ${poc.techStack.buildCommand}`);
      }
      lines.push('');
    }

    // Final status and termination
    if (poc.finalStatus) {
      lines.push('## Result\n');
      lines.push(`**Status**: ${poc.finalStatus}\n`);
      if (poc.terminationReason) {
        lines.push(`**Termination Reason**: ${poc.terminationReason}\n`);
      }
      if (poc.totalDurationMs !== undefined) {
        lines.push(`**Total Duration**: ${(poc.totalDurationMs / 1000).toFixed(1)}s\n`);
      }
    }

    // Final test results
    if (poc.finalTestResults) {
      const tr = poc.finalTestResults;
      lines.push('## Final Test Results\n');
      lines.push(`- **Passed**: ${tr.passed}`);
      lines.push(`- **Failed**: ${tr.failed}`);
      lines.push(`- **Skipped**: ${tr.skipped}`);
      lines.push(`- **Total**: ${tr.total}`);
      lines.push(`- **Duration**: ${tr.durationMs}ms`);
      if (tr.failures.length > 0) {
        lines.push('\n### Failures\n');
        for (const f of tr.failures) {
          lines.push(`#### ${f.testName}`);
          lines.push(`\`\`\`\n${f.message}\n\`\`\`\n`);
        }
      }
      lines.push('');
    }

    // Iteration timeline
    if (poc.iterations.length > 0) {
      lines.push('## Iteration Timeline\n');
      for (const iter of poc.iterations) {
        const duration = iter.endedAt
          ? `${((new Date(iter.endedAt).getTime() - new Date(iter.startedAt).getTime()) / 1000).toFixed(1)}s`
          : 'in progress';
        lines.push(`### Iteration ${iter.iteration} — ${iter.outcome} (${duration})\n`);
        if (iter.changesSummary) {
          lines.push(`${iter.changesSummary}\n`);
        }
        if (iter.filesChanged.length > 0) {
          lines.push(`**Files changed**: ${iter.filesChanged.join(', ')}\n`);
        }
        if (iter.testResults) {
          const tr = iter.testResults;
          lines.push(
            `**Tests**: ${tr.passed} passed, ${tr.failed} failed, ${tr.skipped} skipped (${tr.durationMs}ms)\n`,
          );
        }
        if (iter.errorMessage) {
          lines.push(`**Error**: ${iter.errorMessage}\n`);
        }
      }
    }
  }

  // FR-022: Always include conversation turns if they exist
  const developTurns = session.turns?.filter((t) => t.phase === 'Develop') ?? [];
  if (developTurns.length > 0) {
    lines.push('## Conversation\n');
    for (const turn of developTurns) {
      lines.push(`**${turn.role}**: ${turn.content}\n`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

// ── Phase generator mapping ──────────────────────────────────────────────────

const PHASE_GENERATORS: Record<string, (session: WorkshopSession) => string | null> = {
  Discover: generateDiscoverMarkdown,
  Ideate: generateIdeateMarkdown,
  Design: generateDesignMarkdown,
  Select: generateSelectMarkdown,
  Plan: generatePlanMarkdown,
  Develop: generateDevelopMarkdown,
};

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Export a workshop session to the specified directory.
 * Generates Markdown files for each phase with data and a summary.json.
 */
export async function exportSession(
  session: WorkshopSession,
  exportDir: string,
): Promise<ExportResult> {
  await mkdir(exportDir, { recursive: true });

  const files: ExportFile[] = [];

  // Generate phase Markdown files
  for (const [phaseName, generator] of Object.entries(PHASE_GENERATORS)) {
    const content = generator(session);
    if (content) {
      const fileName = `${phaseName.toLowerCase()}.md`;
      await writeFile(join(exportDir, fileName), content, 'utf-8');
      files.push({ path: fileName, type: 'markdown' });
    }
  }

  // Generate highlights — include one entry per phase with data or turns (FR-024)
  const highlights: string[] = [];
  if (session.businessContext) {
    highlights.push(`Business: ${session.businessContext.businessDescription}`);
  } else {
    const discoverTurns = session.turns?.filter((t) => t.phase === 'Discover' && t.role === 'assistant') ?? [];
    if (discoverTurns.length > 0) {
      highlights.push(`Discover: ${discoverTurns[0].content.slice(0, 100)}`);
    }
  }
  if (session.ideas?.length) {
    highlights.push(`Ideas: ${session.ideas.length} ideas generated`);
  } else {
    const ideateTurns = session.turns?.filter((t) => t.phase === 'Ideate' && t.role === 'assistant') ?? [];
    if (ideateTurns.length > 0) {
      highlights.push(`Ideate: ${ideateTurns[0].content.slice(0, 100)}`);
    }
  }
  if (session.evaluation) {
    highlights.push(`Evaluation: ${session.evaluation.ideas.length} ideas evaluated`);
  } else {
    const designTurns = session.turns?.filter((t) => t.phase === 'Design' && t.role === 'assistant') ?? [];
    if (designTurns.length > 0) {
      highlights.push(`Design: ${designTurns[0].content.slice(0, 100)}`);
    }
  }
  if (session.selection) {
    highlights.push(`Selected idea: ${session.selection.ideaId}`);
  } else {
    const selectTurns = session.turns?.filter((t) => t.phase === 'Select' && t.role === 'assistant') ?? [];
    if (selectTurns.length > 0) {
      highlights.push(`Select: ${selectTurns[0].content.slice(0, 100)}`);
    }
  }
  if (session.plan?.milestones?.length) {
    highlights.push(`${session.plan.milestones.length} milestones planned`);
  } else {
    const planTurns = session.turns?.filter((t) => t.phase === 'Plan' && t.role === 'assistant') ?? [];
    if (planTurns.length > 0) {
      highlights.push(`Plan: ${planTurns[0].content.slice(0, 100)}`);
    }
  }
  // PoC highlights
  if (session.poc) {
    const poc = session.poc;
    if (poc.finalStatus) {
      highlights.push(`PoC status: ${poc.finalStatus}`);
    }
    if (poc.iterations?.length) {
      highlights.push(`PoC iterations: ${poc.iterations.length}`);
    }
    if (poc.terminationReason) {
      highlights.push(`PoC termination: ${poc.terminationReason}`);
    }
  } else {
    const developTurns = session.turns?.filter((t) => t.phase === 'Develop' && t.role === 'assistant') ?? [];
    if (developTurns.length > 0) {
      highlights.push(`Develop: ${developTurns[0].content.slice(0, 100)}`);
    }
  }

  // Generate summary.json
  const summary: ExportSummary = {
    sessionId: session.sessionId,
    exportedAt: new Date().toISOString(),
    phase: session.phase,
    status: session.status,
    files,
    highlights: highlights.length > 0 ? highlights : undefined,
  };

  const summaryFileName = 'summary.json';
  await writeFile(join(exportDir, summaryFileName), JSON.stringify(summary, null, 2), 'utf-8');
  files.push({ path: summaryFileName, type: 'json' });

  return { exportDir, files };
}
