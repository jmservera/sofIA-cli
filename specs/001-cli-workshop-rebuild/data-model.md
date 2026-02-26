# Data Model: sofIA CLI workshop rebuild

**Feature**: ./spec.md
**Research**: ./research.md
**Date**: 2026-02-26

This is a conceptual data model for persistence and exports. It is not an implementation.

## Entities

### 1) Session

**Storage**: `./.sofia/sessions/<sessionId>.json`

**Fields (minimum)**
- `sessionId: string`
- `createdAt: string` (ISO-8601)
- `updatedAt: string` (ISO-8601)
- `schemaVersion: string`
- `phase: Phase`
- `status: SessionStatus`
- `participants: Participant[]`
- `businessContext?: BusinessContext`
- `topic?: TopicSelection`
- `activities?: Activity[]`
- `workflow?: WorkflowMap`
- `cards?: CardSelection`
- `ideas?: IdeaCard[]`
- `evaluation?: IdeaEvaluation`
- `selection?: SelectedIdea`
- `plan?: ImplementationPlan`
- `poc?: PocDevelopmentState`
- `artifacts: ArtifactIndex`
- `errors?: ErrorRecord[]`

**Validation rules**
- `sessionId` is stable across the session.
- `updatedAt` is monotonically increasing.
- `phase` must follow state machine (see below).
- Every user turn persists the session to disk.

### 2) Phase

`Phase` is an enum representing the governed progression:
- `Discover`
- `Ideate`
- `Design`
- `Select`
- `Plan`
- `Develop`
- `Complete`

**Rule**: Phase changes require an explicit “Proceed?” decision gate in UX.

### 3) SessionStatus

- `Active`
- `Paused`
- `Completed`
- `Errored`

### 4) Participant

- `id: string`
- `displayName: string`
- `role: "Facilitator" | "Attendee" | "Observer"`

### 5) BusinessContext

- `businessDescription: string`
- `challenges: string[]`
- `constraints?: string[]`
- `successMetrics?: Metric[]`

### 6) TopicSelection

- `topicArea: string`
- `scopeNotes?: string`

### 7) WorkflowMap

- `activities: WorkflowStep[]`
- `edges: WorkflowEdge[]`

`WorkflowStep`
- `id: string`
- `name: string`
- `description?: string`
- `metrics?: Metric[]` (e.g., hours/week, NSAT)

`WorkflowEdge`
- `fromStepId: string`
- `toStepId: string`

### 8) CardSelection

- `selectedCards: EnvisioningCard[]`
- `scores?: CardScore[]`

`EnvisioningCard`
- `id: string`
- `title: string`
- `category?: string`
- `notes?: string`

`CardScore`
- `cardId: string`
- `dimensions: Record<string, number>`

### 9) IdeaCard

- `id: string`
- `title: string`
- `description: string`
- `workflowStepIds: string[]`
- `aspirationalScope?: string`
- `assumptions?: string[]`

### 10) IdeaEvaluation

- `ideas: IdeaEvaluationItem[]`
- `method: "feasibility-value-matrix" | "custom"`

`IdeaEvaluationItem`
- `ideaId: string`
- `feasibility: number` (normalized 0..1 or 1..5; decide in implementation)
- `value: number`
- `risks?: string[]`
- `dataNeeded?: string[]`
- `humanValue?: string[]`
- `kpisInfluenced?: string[]`

### 11) SelectedIdea

- `ideaId: string`
- `selectionRationale: string`
- `confirmedByUser: boolean`
- `confirmedAt?: string`

### 12) ImplementationPlan

- `milestones: Milestone[]`
- `architectureNotes?: string`
- `dependencies?: string[]`

`Milestone`
- `id: string`
- `title: string`
- `items: string[]`

### 13) PocDevelopmentState

- `repoPath?: string`
- `iterations: PocIteration[]`
- `finalStatus?: "success" | "failed"`

`PocIteration`
- `iteration: number`
- `startedAt: string`
- `endedAt?: string`
- `changesSummary?: string`
- `testsRun?: string[]`

### 14) Activity

This replaces “LLM thoughts” with a compliant activity/telemetry stream.

- `id: string`
- `timestamp: string`
- `kind: "phase" | "tool" | "io" | "warning" | "error" | "progress"`
- `message: string`
- `data?: Record<string, unknown>`

### 15) ArtifactIndex

- `exportDir?: string` (e.g., `./exports/<sessionId>/`)
- `generatedFiles: GeneratedFile[]`

`GeneratedFile`
- `relativePath: string`
- `type: "markdown" | "json" | "text"`
- `createdAt: string`

### 16) ErrorRecord

- `timestamp: string`
- `code: string`
- `message: string`
- `details?: Record<string, unknown>`

## State machine

Valid transitions:
- `Discover → Ideate → Design → Select → Plan → Develop → Complete`

Failure transitions:
- Any phase may set `status=Errored` but **must** persist the session before exit.

Resume:
- `Paused → Active` without phase change.

## Export model

**Export root**: `./exports/<sessionId>/`

Minimum contents:
- `summary.json` (export index + top-level summary)
- Phase markdown files (names finalized in implementation):
  - `discover.md`, `ideate.md`, `design.md`, `select.md`, `plan.md`, `develop.md`

