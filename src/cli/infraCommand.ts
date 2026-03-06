/**
 * infraCommand — `sofia infra` sub-commands.
 *
 * Wraps the shell scripts in infra/ (deploy.sh, gather-env.sh, teardown.sh)
 * and exposes them as CLI sub-commands so users can run:
 *
 *   npx sofia infra deploy -g rg-name
 *   npx sofia infra gather-env -g rg-name
 *   npx sofia infra teardown -g rg-name --yes
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Resolve infra/ directory relative to package root ──────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let _pkgRoot = __dirname;
while (_pkgRoot !== path.dirname(_pkgRoot) && !existsSync(path.join(_pkgRoot, 'package.json'))) {
  _pkgRoot = path.dirname(_pkgRoot);
}
const INFRA_DIR = path.join(_pkgRoot, 'infra');

// ── Script runner ──────────────────────────────────────────────────────────

export interface ScriptResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Execute a bash script with the given arguments.
 * Streams stdout/stderr to the parent process in real-time and captures them.
 */
export function runInfraScript(scriptPath: string, args: string[]): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    if (!existsSync(scriptPath)) {
      reject(new Error(`Script not found: ${scriptPath}`));
      return;
    }

    const child = spawn('bash', [scriptPath, ...args], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', reject);

    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

// ── Argument builder ───────────────────────────────────────────────────────

/** Map from Commander camelCase option names to shell-script flag names. */
const FLAG_MAP: Record<string, string> = {
  resourceGroup: '--resource-group',
  subscription: '--subscription',
  location: '--location',
  accountName: '--account-name',
  model: '--model',
  yes: '--yes',
};

function buildArgs(opts: Record<string, unknown>, keys: string[]): string[] {
  const args: string[] = [];
  for (const key of keys) {
    const value = opts[key];
    const flag = FLAG_MAP[key];
    if (value === undefined || value === null || !flag) continue;
    if (typeof value === 'boolean') {
      if (value) args.push(flag);
    } else {
      args.push(flag, String(value));
    }
  }
  return args;
}

// ── Action helper used by index.ts sub-command registrations ───────────────

/**
 * Called by the Commander actions registered in index.ts.
 * Resolves the script path inside infra/, builds CLI args, runs it,
 * and sets process.exitCode.
 */
export async function invokeInfraAction(
  scriptName: string,
  opts: Record<string, unknown>,
  keys: string[],
): Promise<void> {
  const scriptPath = path.join(INFRA_DIR, scriptName);
  const args = buildArgs(opts, keys);
  const result = await runInfraScript(scriptPath, args);
  process.exitCode = result.exitCode;
}
