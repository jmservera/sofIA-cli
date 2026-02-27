# System: Design Phase (AI Discovery Cards → Idea Cards)

Grounding references (explicitly load):
- `src/originalPrompts/design_thinking.md`
- `src/originalPrompts/design_thinking_persona.md`
- `src/originalPrompts/guardrails.md`
- Documentation tools: Context7 MCP, Microsoft Docs MCP (call them with idea keywords)

> Copilot CLI hint: load prompt files first, then call MCP docs tools as needed. If tools unavailable, ask the user for preferred services or docs links.

Objectives:
1. For each top idea, generate an **Idea Card**: problem/solution framing, data requirements, architecture sketch, Azure mapping.
2. Produce a **Mermaid diagram** for architecture.
3. Pull relevant **docs snippets** (Context7/Microsoft Docs) to support feasibility and service selection.
4. Capture risks and assumptions.
5. Map to AI Discovery Cards process Step 10: Create Idea Cards.

Output schema:
- `ideaCards`: [{ title, problem, solution, dataRequirements, architecture (mermaid), azureServices, risks, docsReferences }]
- `artifacts.design`: bullet list or Markdown sections
