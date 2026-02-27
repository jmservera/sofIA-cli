/**
 * Shared Zod schemas for WorkshopSession and related entities.
 *
 * Source of truth: specs/001-cli-workshop-rebuild/data-model.md
 * Contract: specs/001-cli-workshop-rebuild/contracts/session-json.md
 */
import { z } from '../../vendor/zod.js';

// ── Enums ────────────────────────────────────────────────────────────────────

export const Phase = [
  'Discover',
  'Ideate',
  'Design',
  'Select',
  'Plan',
  'Develop',
  'Complete',
] as const;

export const phaseSchema = z.enum(Phase);
export type PhaseValue = z.infer<typeof phaseSchema>;

export const SessionStatus = ['Active', 'Paused', 'Completed', 'Errored'] as const;
export const sessionStatusSchema = z.enum(SessionStatus);
export type SessionStatusValue = z.infer<typeof sessionStatusSchema>;

// ── Leaf entities ────────────────────────────────────────────────────────────

export const metricSchema = z.object({
  name: z.string(),
  value: z.string().optional(),
  unit: z.string().optional(),
});
export type Metric = z.infer<typeof metricSchema>;

export const participantSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  role: z.enum(['Facilitator', 'Attendee', 'Observer']),
});
export type Participant = z.infer<typeof participantSchema>;

export const businessContextSchema = z.object({
  businessDescription: z.string(),
  challenges: z.array(z.string()),
  constraints: z.array(z.string()).optional(),
  successMetrics: z.array(metricSchema).optional(),
});
export type BusinessContext = z.infer<typeof businessContextSchema>;

export const topicSelectionSchema = z.object({
  topicArea: z.string(),
  scopeNotes: z.string().optional(),
});
export type TopicSelection = z.infer<typeof topicSelectionSchema>;

// ── Workflow ─────────────────────────────────────────────────────────────────

export const workflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  metrics: z.array(metricSchema).optional(),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

export const workflowEdgeSchema = z.object({
  fromStepId: z.string(),
  toStepId: z.string(),
});
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const workflowMapSchema = z.object({
  activities: z.array(workflowStepSchema),
  edges: z.array(workflowEdgeSchema),
});
export type WorkflowMap = z.infer<typeof workflowMapSchema>;

// ── Cards ────────────────────────────────────────────────────────────────────

export const envisioningCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string().optional(),
  notes: z.string().optional(),
});
export type EnvisioningCard = z.infer<typeof envisioningCardSchema>;

export const cardScoreSchema = z.object({
  cardId: z.string(),
  dimensions: z.record(z.string(), z.number()),
});
export type CardScore = z.infer<typeof cardScoreSchema>;

export const cardSelectionSchema = z.object({
  selectedCards: z.array(envisioningCardSchema),
  scores: z.array(cardScoreSchema).optional(),
});
export type CardSelection = z.infer<typeof cardSelectionSchema>;

// ── Ideas ────────────────────────────────────────────────────────────────────

export const ideaCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  workflowStepIds: z.array(z.string()),
  aspirationalScope: z.string().optional(),
  assumptions: z.array(z.string()).optional(),
});
export type IdeaCard = z.infer<typeof ideaCardSchema>;

// ── Evaluation ───────────────────────────────────────────────────────────────

export const ideaEvaluationItemSchema = z.object({
  ideaId: z.string(),
  feasibility: z.number(),
  value: z.number(),
  risks: z.array(z.string()).optional(),
  dataNeeded: z.array(z.string()).optional(),
  humanValue: z.array(z.string()).optional(),
  kpisInfluenced: z.array(z.string()).optional(),
});
export type IdeaEvaluationItem = z.infer<typeof ideaEvaluationItemSchema>;

export const ideaEvaluationSchema = z.object({
  ideas: z.array(ideaEvaluationItemSchema),
  method: z.enum(['feasibility-value-matrix', 'custom']),
});
export type IdeaEvaluation = z.infer<typeof ideaEvaluationSchema>;

// ── Selection ────────────────────────────────────────────────────────────────

export const selectedIdeaSchema = z.object({
  ideaId: z.string(),
  selectionRationale: z.string(),
  confirmedByUser: z.boolean(),
  confirmedAt: z.string().optional(),
});
export type SelectedIdea = z.infer<typeof selectedIdeaSchema>;

// ── Plan ─────────────────────────────────────────────────────────────────────

export const milestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(z.string()),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const implementationPlanSchema = z.object({
  milestones: z.array(milestoneSchema),
  architectureNotes: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
});
export type ImplementationPlan = z.infer<typeof implementationPlanSchema>;

// ── PoC ──────────────────────────────────────────────────────────────────────

export const pocIterationSchema = z.object({
  iteration: z.number(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  changesSummary: z.string().optional(),
  testsRun: z.array(z.string()).optional(),
});
export type PocIteration = z.infer<typeof pocIterationSchema>;

export const pocDevelopmentStateSchema = z.object({
  repoPath: z.string().optional(),
  iterations: z.array(pocIterationSchema),
  finalStatus: z.enum(['success', 'failed']).optional(),
});
export type PocDevelopmentState = z.infer<typeof pocDevelopmentStateSchema>;

// ── Artifacts ────────────────────────────────────────────────────────────────

export const generatedFileSchema = z.object({
  relativePath: z.string(),
  type: z.enum(['markdown', 'json', 'text']),
  createdAt: z.string(),
});
export type GeneratedFile = z.infer<typeof generatedFileSchema>;

export const artifactIndexSchema = z.object({
  exportDir: z.string().optional(),
  generatedFiles: z.array(generatedFileSchema),
});
export type ArtifactIndex = z.infer<typeof artifactIndexSchema>;

// ── Conversation Turn ────────────────────────────────────────────────────────

export const conversationTurnSchema = z.object({
  phase: phaseSchema,
  sequence: z.number(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;

// ── Error Record ─────────────────────────────────────────────────────────────

export const errorRecordSchema = z.object({
  timestamp: z.string(),
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ErrorRecord = z.infer<typeof errorRecordSchema>;

// ── Activity (telemetry event) ───────────────────────────────────────────────

export const activitySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  kind: z.enum(['phase', 'tool', 'io', 'warning', 'error', 'progress']),
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type Activity = z.infer<typeof activitySchema>;

// ── Workshop Session (root) ──────────────────────────────────────────────────

export const workshopSessionSchema = z
  .object({
    sessionId: z.string(),
    schemaVersion: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    name: z.string().optional(),
    phase: phaseSchema,
    status: sessionStatusSchema,
    participants: z.array(participantSchema),
    businessContext: businessContextSchema.optional(),
    topic: topicSelectionSchema.optional(),
    activities: z.array(activitySchema).optional(),
    workflow: workflowMapSchema.optional(),
    cards: cardSelectionSchema.optional(),
    ideas: z.array(ideaCardSchema).optional(),
    evaluation: ideaEvaluationSchema.optional(),
    selection: selectedIdeaSchema.optional(),
    plan: implementationPlanSchema.optional(),
    poc: pocDevelopmentStateSchema.optional(),
    artifacts: artifactIndexSchema,
    turns: z.array(conversationTurnSchema).optional(),
    errors: z.array(errorRecordSchema).optional(),
  })
  .passthrough(); // Forward compatibility: preserve unknown fields

export type WorkshopSession = z.infer<typeof workshopSessionSchema>;
