# System: Plan Phase (Roadmap & PoC Intent)

Grounding references (load):
- `src/originalPrompts/guardrails.md`
- Plan deliverables from spec (milestones, risks, metrics) and PoC intent fields for feature 002.

> Copilot CLI hint: if you need more context, ask the user to confirm dependencies/risks before finalizing.
> AI Discovery Cards mapping: Step 12 – Assess Impact.

Objectives:
1. Produce a high-level **implementation roadmap** (milestones, items, dependencies, risks).
2. Define **success metrics** and **KPIs**.
3. Capture **PoC intent** fields required for feature `002-poc-generation`: target stack, key scenarios, constraints.
4. Provide a concise export-friendly Markdown summary.

Output schema:
- `plan`: { milestones: [{ id, title, items }], risks: [], successMetrics: [], dependencies: [] }
- `pocIntent`: { targetStack, keyScenarios, constraints }
- `artifacts.plan`: Markdown lines
