/**
 * Unit tests for templateRegistry.
 *
 * T033: selectTemplate returns python-pytest for Python plans
 * T034: selectTemplate returns node-ts-vitest for TypeScript plans
 * T035: selectTemplate returns default for ambiguous plans
 */
import { describe, it, expect } from 'vitest';

import {
  selectTemplate,
  createDefaultRegistry,
  NODE_TS_VITEST_TEMPLATE,
  PYTHON_PYTEST_TEMPLATE,
} from '../../../src/develop/templateRegistry.js';

describe('selectTemplate', () => {
  const registry = createDefaultRegistry();

  it('returns python-pytest for plans mentioning "Python"', () => {
    const result = selectTemplate(registry, 'Python 3.11 + FastAPI backend');
    expect(result.id).toBe('python-pytest');
  });

  it('returns python-pytest for plans mentioning "FastAPI"', () => {
    const result = selectTemplate(registry, 'A FastAPI-based REST API');
    expect(result.id).toBe('python-pytest');
  });

  it('returns python-pytest for plans with "flask" in dependencies', () => {
    const result = selectTemplate(registry, undefined, ['flask', 'redis']);
    expect(result.id).toBe('python-pytest');
  });

  it('returns python-pytest for plans with "django" dependency', () => {
    const result = selectTemplate(registry, undefined, ['django']);
    expect(result.id).toBe('python-pytest');
  });

  it('returns node-ts-vitest for plans mentioning "TypeScript"', () => {
    const result = selectTemplate(registry, 'TypeScript + Express backend');
    expect(result.id).toBe('node-ts-vitest');
  });

  it('returns node-ts-vitest for plans mentioning "Node"', () => {
    const result = selectTemplate(registry, 'Node.js microservice');
    expect(result.id).toBe('node-ts-vitest');
  });

  it('returns node-ts-vitest for plans with no architecture notes (default)', () => {
    const result = selectTemplate(registry);
    expect(result.id).toBe('node-ts-vitest');
  });

  it('returns default node-ts-vitest for ambiguous plans', () => {
    const result = selectTemplate(registry, 'A machine learning pipeline using GPT');
    expect(result.id).toBe('node-ts-vitest');
  });

  it('performs case-insensitive matching', () => {
    const result = selectTemplate(registry, 'PYTHON and FASTAPI');
    expect(result.id).toBe('python-pytest');
  });
});

describe('NODE_TS_VITEST_TEMPLATE', () => {
  it('has correct id and match patterns', () => {
    expect(NODE_TS_VITEST_TEMPLATE.id).toBe('node-ts-vitest');
    expect(NODE_TS_VITEST_TEMPLATE.installCommand).toBe('npm install');
    expect(NODE_TS_VITEST_TEMPLATE.testCommand).toBe('npm test -- --reporter=json');
    expect(NODE_TS_VITEST_TEMPLATE.matchPatterns).toContain('typescript');
  });

  it('includes .sofia-metadata.json in files', () => {
    const paths = NODE_TS_VITEST_TEMPLATE.files.map((f) => f.path);
    expect(paths).toContain('.sofia-metadata.json');
  });
});

describe('PYTHON_PYTEST_TEMPLATE', () => {
  it('has correct id and match patterns', () => {
    expect(PYTHON_PYTEST_TEMPLATE.id).toBe('python-pytest');
    expect(PYTHON_PYTEST_TEMPLATE.installCommand).toBe('pip install -r requirements.txt');
    expect(PYTHON_PYTEST_TEMPLATE.matchPatterns).toContain('python');
    expect(PYTHON_PYTEST_TEMPLATE.matchPatterns).toContain('fastapi');
  });

  it('includes required Python files', () => {
    const paths = PYTHON_PYTEST_TEMPLATE.files.map((f) => f.path);
    expect(paths).toContain('requirements.txt');
    expect(paths).toContain('pytest.ini');
    expect(paths).toContain('src/__init__.py');
    expect(paths).toContain('src/main.py');
    expect(paths).toContain('tests/test_main.py');
    expect(paths).toContain('.sofia-metadata.json');
  });
});

describe('createDefaultRegistry', () => {
  it('contains both built-in templates', () => {
    const registry = createDefaultRegistry();
    expect(registry.size).toBe(2);
    expect(registry.has('node-ts-vitest')).toBe(true);
    expect(registry.has('python-pytest')).toBe(true);
  });
});
