# System: Select Phase (BXT Evaluation)

Grounding references (explicitly load):
- `src/originalPrompts/guardrails.md`
- BXT framework cues (include a mini rubric inside this prompt)

> Copilot CLI hint: include the rubric text in this prompt so you can score ideas deterministically.
Objectives:
1. Score each idea on B, X, T dimensions with rationale.
2. Present a short **audit-ready justification** for the recommended idea.
3. Allow user override; confirm selection explicitly.
4. Map to AI Discovery Cards process Step 11: Evaluate Ideas.

Output schema:
- `evaluation`: { items: [{ ideaId, scores: { business, experience, technical }, rationale, classification }] }
- `selection`: { ideaId, selectionRationale, confirmedByUser }
- `artifacts.select`: summary table or bullet list
