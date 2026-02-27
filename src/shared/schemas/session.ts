import { z } from 'zod';

export const ConversationTurnSchema = z.object({
  phase: z.string(),
  role: z.union([z.literal('user'), z.literal('assistant'), z.literal('system'), z.literal('tool')]),
  content: z.string(),
  timestamp: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type ConversationTurn = ReturnType<typeof ConversationTurnSchema.parse>;

export const GeneratedFileSchema = z.object({
  relativePath: z.string(),
  type: z.union([z.literal('markdown'), z.literal('json'), z.literal('text')]),
  createdAt: z.string(),
});

export const ArtifactIndexSchema = z.object({
  exportDir: z.string().optional(),
  generatedFiles: z.array(GeneratedFileSchema),
  // Allow phase-specific artifact blobs (discover/ideate/etc.) without strict typing
  discover: z.any().optional(),
  ideate: z.any().optional(),
  design: z.any().optional(),
  select: z.any().optional(),
  plan: z.any().optional(),
} as any); // allow index signature

export type ArtifactIndex = ReturnType<typeof ArtifactIndexSchema.parse>;

export const PocIterationSchema = z.object({
  iteration: z.number(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  changesSummary: z.string().optional(),
  testsRun: z.array(z.string()).optional(),
});

export const PocDevelopmentStateSchema = z.object({
  repoPath: z.string().optional(),
  iterations: z.array(PocIterationSchema).default([]),
  finalStatus: z.enum(['success', 'failed']).optional(),
});

export type PocDevelopmentState = ReturnType<typeof PocDevelopmentStateSchema.parse>;

export const WorkshopSessionSchema = z.object({
  sessionId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  schemaVersion: z.string(),
  phase: z.string(),
  status: z.enum(['Active', 'Paused', 'Completed', 'Errored']),
  participants: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      role: z.union([z.literal('Facilitator'), z.literal('Attendee'), z.literal('Observer')]),
    }),
  ).optional().default([]),
  businessContext: z.any().optional(),
  topic: z.any().optional(),
  activities: z.any().optional(),
  workflow: z.any().optional(),
  cards: z.any().optional(),
  ideas: z.any().optional(),
  evaluation: z.any().optional(),
  selection: z.any().optional(),
  plan: z.any().optional(),
  poc: PocDevelopmentStateSchema.optional(),
  artifacts: ArtifactIndexSchema,
  errors: z.array(z.any()).optional(),
  turns: z.array(ConversationTurnSchema),
});

export type WorkshopSession = ReturnType<typeof WorkshopSessionSchema.parse>;

export const validateWorkshopSession = (input: unknown): WorkshopSession =>
  WorkshopSessionSchema.parse(input);
