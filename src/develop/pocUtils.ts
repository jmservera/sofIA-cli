/**
 * PoC Utilities.
 *
 * Standalone helper functions and types extracted from the former
 * PocScaffolder class: git init, TODO scanning, output validation,
 * and shared type definitions used by the scaffold / Ralph loop pipeline.
 */
import { writeFile, access, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

import type { TechStack, WorkshopSession } from '../shared/schemas/session.js';
import type { TemplateEntry } from './templateRegistry.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScaffoldContext {
  /** Kebab-case project name derived from idea title */
  projectName: string;
  /** Original idea title */
  ideaTitle: string;
  /** Idea description from workshop */
  ideaDescription: string;
  /** Tech stack to use */
  techStack: TechStack;
  /** Summary of the implementation plan */
  planSummary: string;
  /** Workshop session ID */
  sessionId: string;
  /** Output directory (absolute path) */
  outputDir: string;
}

export interface TemplateFile {
  /** Path relative to outputDir */
  path: string;
  /** File content string or generator function */
  content: string | ((ctx: ScaffoldContext) => string);
  /** Skip writing if file already exists (default: true) */
  skipIfExists?: boolean;
}

export interface ScaffoldResult {
  /** Files that were created */
  createdFiles: string[];
  /** Files that were skipped because they already existed */
  skippedFiles: string[];
  /** The scaffold context used */
  context: ScaffoldContext;
}

export interface ValidationResult {
  valid: boolean;
  missingFiles: string[];
  errors: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert an idea title to a kebab-case project name.
 */
export function toKebabCase(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 64);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ── Build Context ────────────────────────────────────────────────────────────

/**
 * Build a ScaffoldContext from a workshop session.
 */
export function buildScaffoldContext(
  session: WorkshopSession,
  outputDir: string,
  templateEntry?: TemplateEntry,
): ScaffoldContext {
  const idea = session.ideas?.find((i) => i.id === session.selection?.ideaId);
  const ideaTitle = idea?.title ?? 'AI PoC';
  const ideaDescription = idea?.description ?? 'A proof-of-concept AI application.';

  const planSummary = session.plan?.architectureNotes
    ? session.plan.architectureNotes
    : (session.plan?.milestones?.map((m) => m.title).join(', ') ?? 'See plan for details');

  const techStack: TechStack = templateEntry?.techStack
    ? { ...templateEntry.techStack }
    : {
        language: 'TypeScript',
        runtime: 'Node.js 20',
        testRunner: 'npm test',
        buildCommand: 'npm run build',
        framework: undefined,
      };

  // Infer framework from plan if present
  if (session.plan?.architectureNotes) {
    const notes = session.plan.architectureNotes.toLowerCase();
    if (notes.includes('express')) techStack.framework = 'Express';
    else if (notes.includes('fastapi')) techStack.framework = 'FastAPI';
    else if (notes.includes('next')) techStack.framework = 'Next.js';
  }

  return {
    projectName: toKebabCase(ideaTitle),
    ideaTitle,
    ideaDescription,
    techStack,
    planSummary,
    sessionId: session.sessionId,
    outputDir,
  };
}

// ── Git Initialization ───────────────────────────────────────────────────────

/**
 * Initialize a local git repository in the output directory.
 * Creates an initial commit with all scaffold files.
 *
 * @param outputDir The directory to initialize git in
 * @returns true if successful, false otherwise
 */
export async function initializeGitRepo(outputDir: string): Promise<boolean> {
  try {
    const gitDir = join(outputDir, '.git');
    const exists = await fileExists(gitDir);
    if (exists) {
      return true; // Already initialized
    }

    execSync('git init', { cwd: outputDir, stdio: 'ignore' });
    execSync('git add .', { cwd: outputDir, stdio: 'ignore' });
    execSync('git commit -m "chore: initial scaffold from sofIA"', {
      cwd: outputDir,
      stdio: 'ignore',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'sofIA',
        GIT_AUTHOR_EMAIL: 'sofia@workshop.local',
        GIT_COMMITTER_NAME: 'sofIA',
        GIT_COMMITTER_EMAIL: 'sofia@workshop.local',
      },
    });

    return true;
  } catch (_err) {
    return false;
  }
}

// ── TODO Scanning ────────────────────────────────────────────────────────────

/**
 * Scan scaffold files for TODO markers and update .sofia-metadata.json.
 */
export async function scanAndRecordTodos(outputDir: string): Promise<{
  totalInitial: number;
  remaining: number;
  markers: string[];
}> {
  const markers: string[] = [];

  async function scanDir(dir: string, base: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
      const full = join(dir, entry);
      const rel = base ? `${base}/${entry}` : entry;
      let s;
      try {
        s = await stat(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        await scanDir(full, rel);
      } else if (s.isFile()) {
        try {
          const content = await readFile(full, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('TODO:')) {
              markers.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        } catch {
          // skip binary or unreadable files
        }
      }
    }
  }

  await scanDir(outputDir, '');

  const todos = {
    totalInitial: markers.length,
    remaining: markers.length,
    markers,
  };

  // Update .sofia-metadata.json with TODO info
  const metadataPath = join(outputDir, '.sofia-metadata.json');
  try {
    const raw = await readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(raw);
    metadata.todos = todos;
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');
  } catch {
    // Metadata file may not exist yet
  }

  return todos;
}

// ── Output Validator ─────────────────────────────────────────────────────────

/**
 * Validate that a scaffold directory meets the poc-output contract requirements.
 */
export async function validatePocOutput(outputDir: string): Promise<ValidationResult> {
  const requiredFiles = [
    'package.json',
    'README.md',
    'tsconfig.json',
    '.gitignore',
    '.sofia-metadata.json',
  ];

  const missingFiles: string[] = [];
  const errors: string[] = [];

  for (const file of requiredFiles) {
    const exists = await fileExists(join(outputDir, file));
    if (!exists) {
      missingFiles.push(file);
    }
  }

  if (!missingFiles.includes('package.json')) {
    try {
      const pkgContent = await readFile(join(outputDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgContent) as { scripts?: Record<string, string> };
      if (!pkg.scripts?.test) {
        errors.push('package.json is missing "test" script');
      }
    } catch {
      errors.push('package.json is not valid JSON');
    }
  }

  let hasSrcTs = false;
  try {
    const srcFiles = await readdir(join(outputDir, 'src'));
    hasSrcTs = srcFiles.some((f) => f.endsWith('.ts'));
  } catch {
    // src/ doesn't exist
  }
  if (!hasSrcTs) {
    errors.push('No TypeScript files found in src/');
  }

  let hasTestFile = false;
  try {
    const testFiles = await readdir(join(outputDir, 'tests'));
    hasTestFile = testFiles.some((f) => f.endsWith('.test.ts'));
  } catch {
    // tests/ doesn't exist
  }
  if (!hasTestFile) {
    errors.push('No test files found in tests/');
  }

  return {
    valid: missingFiles.length === 0 && errors.length === 0,
    missingFiles,
    errors,
  };
}
