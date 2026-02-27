/**
 * Export directory helper.
 *
 * Default export root: ./exports/<sessionId>/
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_EXPORT_ROOT = join(process.cwd(), 'exports');

/**
 * Get the export directory path for a session.
 */
export function getExportDir(sessionId: string, exportRoot: string = DEFAULT_EXPORT_ROOT): string {
  return join(exportRoot, sessionId);
}

/**
 * Ensure the export directory exists. Creates it if missing.
 */
export async function ensureExportDir(
  sessionId: string,
  exportRoot: string = DEFAULT_EXPORT_ROOT,
): Promise<string> {
  const dir = getExportDir(sessionId, exportRoot);
  await mkdir(dir, { recursive: true });
  return dir;
}
