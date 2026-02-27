// Minimal stub for marked
export const marked = (md: string): string => md;
(marked as any).setOptions = (_opts: any) => {};
export default marked;
