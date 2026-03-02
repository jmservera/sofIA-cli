# Session Model

## Overview

A **WorkshopSession** is the central data structure persisted throughout a workshop. It captures all artifacts from each phase and supports resume, backtracking, and export.

## Storage

- **Path:** `.sofia/sessions/<sessionId>.json`
- **Format:** UTF-8 JSON, overwritten atomically after every user turn
- **Schema versioning:** `schemaVersion` field enables forward migration

## Session Lifecycle

```
New Session → Active (Discover) → ... → Active (Plan) → Active (Develop) → Completed
                  ↕                          ↕
               Paused                     Paused
                  ↕                          ↕
               Active                     Active
                  ↓                          ↓
               Errored                    Errored
```

### States

| Status      | Description                                             |
| ----------- | ------------------------------------------------------- |
| `Active`    | Session is in progress                                  |
| `Paused`    | Session paused (can resume)                             |
| `Completed` | All phases finished                                     |
| `Errored`   | Failed with an error (session is persisted before exit) |

## Phases

Phases follow a strict linear progression with decision gates:

```
Discover → Ideate → Design → Select → Plan → Develop → Complete
```

| Phase        | Purpose                                                      | Key Artifacts              |
| ------------ | ------------------------------------------------------------ | -------------------------- |
| **Discover** | Understand the business, challenges, and context             | `businessContext`, `topic` |
| **Ideate**   | Brainstorm activities, explore AI Envisioning Cards          | `activities`, `cards`      |
| **Design**   | Generate and refine Idea Cards with architecture sketches    | `ideas`                    |
| **Select**   | Evaluate ideas via feasibility/value matrix, pick the best   | `evaluation`, `selection`  |
| **Plan**     | Create implementation roadmap and milestones                 | `plan`                     |
| **Develop**  | Capture PoC requirements and intent (handoff to feature 002) | `poc`                      |

### Decision Gates

Phase transitions require explicit user confirmation. The system will **never** auto-advance to the next phase. After each phase completes, the user is prompted with a "Proceed to next phase?" decision gate.

### Backtracking

Users can backtrack to an earlier phase. When backtracking:

- All downstream phase artifacts are **invalidated** (marked for recomputation)
- The session moves to the target phase
- Invalidated phases must be re-run to regenerate their artifacts

## Session Fields

```typescript
interface WorkshopSession {
  sessionId: string; // Stable UUID
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601, monotonically increasing
  schemaVersion: string; // e.g., "1.0.0"
  phase: Phase; // Current phase
  status: SessionStatus; // Active | Paused | Completed | Errored
  participants: Participant[]; // Facilitator, attendees, observers
  businessContext?: BusinessContext;
  topic?: TopicSelection;
  activities?: Activity[];
  workflow?: WorkflowMap;
  cards?: CardSelection;
  ideas?: IdeaCard[];
  evaluation?: IdeaEvaluation;
  selection?: SelectedIdea;
  plan?: ImplementationPlan;
  poc?: PocDevelopmentState;
  artifacts: ArtifactIndex;
  errors?: ErrorRecord[];
}
```

### Key Sub-entities

| Entity                | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `BusinessContext`     | Company description, challenges, constraints, success metrics |
| `TopicSelection`      | Chosen focus area and scope notes                             |
| `WorkflowMap`         | Steps and edges describing the activity flow                  |
| `CardSelection`       | Selected AI Envisioning Cards with scores                     |
| `IdeaCard`            | Generated ideas with title, description, workflow links       |
| `IdeaEvaluation`      | Feasibility/value scoring for each idea                       |
| `SelectedIdea`        | The chosen idea with rationale and user confirmation          |
| `ImplementationPlan`  | Milestones, architecture notes, dependencies                  |
| `PocDevelopmentState` | PoC repo path, iterations, final status                       |

## Safety

- Secrets and tokens are **never** persisted in session JSON
- Sensitive values from tool responses are redacted before writing
- The `schemaVersion` field supports future migrations without data loss
- Unknown fields are preserved when loading/saving (forward compatibility)

## Related

- Data model spec: [specs/001-cli-workshop-rebuild/data-model.md](../specs/001-cli-workshop-rebuild/data-model.md)
- Session JSON contract: [specs/001-cli-workshop-rebuild/contracts/session-json.md](../specs/001-cli-workshop-rebuild/contracts/session-json.md)
- Schema source: `src/shared/schemas/session.ts`
