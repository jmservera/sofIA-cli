/**
 * Type declarations for marked-terminal (no upstream @types package).
 */

declare module 'marked-terminal' {
  export function markedTerminal(
    options?: Record<string, unknown>,
    highlightOptions?: Record<string, unknown>,
  ): import('marked').MarkedExtension;

  const Renderer: unknown;
  export default Renderer;
}
