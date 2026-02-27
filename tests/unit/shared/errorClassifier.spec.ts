/**
 * Error classifier tests (T055).
 *
 * Validates centralized error classification and user-facing messages:
 * - Maps known error codes to categories
 * - Provides actionable messages
 * - Handles unknown errors gracefully
 * - Supports MCP, network, auth, and session errors
 */
import { describe, it, expect } from 'vitest';
import {
  classifyError,
  toUserMessage,
  type ErrorClassification,
  type ErrorCategory,
} from '../../../src/shared/errorClassifier.js';

describe('errorClassifier', () => {
  describe('classifyError', () => {
    it('classifies ECONNREFUSED as connection error', () => {
      const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      const result = classifyError(err);
      expect(result.category).toBe('connection');
      expect(result.recoverable).toBe(true);
    });

    it('classifies ENOTFOUND as dns error', () => {
      const err = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      const result = classifyError(err);
      expect(result.category).toBe('dns');
      expect(result.recoverable).toBe(true);
    });

    it('classifies ETIMEDOUT as timeout error', () => {
      const err = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
      const result = classifyError(err);
      expect(result.category).toBe('timeout');
      expect(result.recoverable).toBe(true);
    });

    it('classifies 401 as auth error', () => {
      const err = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      const result = classifyError(err);
      expect(result.category).toBe('auth');
      expect(result.recoverable).toBe(false);
    });

    it('classifies 403 as auth error', () => {
      const err = Object.assign(new Error('Forbidden'), { statusCode: 403 });
      const result = classifyError(err);
      expect(result.category).toBe('auth');
    });

    it('classifies 429 as rate-limit error', () => {
      const err = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });
      const result = classifyError(err);
      expect(result.category).toBe('rate-limit');
      expect(result.recoverable).toBe(true);
    });

    it('classifies ENOENT as not-found error', () => {
      const err = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
      const result = classifyError(err);
      expect(result.category).toBe('not-found');
    });

    it('classifies session validation errors', () => {
      const err = new Error('Invalid session: missing required field');
      err.name = 'ZodError';
      const result = classifyError(err);
      expect(result.category).toBe('validation');
    });

    it('classifies unknown errors as internal', () => {
      const err = new Error('Something unexpected happened');
      const result = classifyError(err);
      expect(result.category).toBe('internal');
      expect(result.recoverable).toBe(false);
    });

    it('classifies MCP-related errors', () => {
      const err = new Error('MCP server workiq failed to start');
      const result = classifyError(err);
      expect(result.category).toBe('mcp');
    });

    it('handles non-Error objects', () => {
      const result = classifyError('string error');
      expect(result.category).toBe('internal');
      expect(result.originalError).toBe('string error');
    });
  });

  describe('toUserMessage', () => {
    it('returns actionable message for connection errors', () => {
      const classification: ErrorClassification = {
        category: 'connection',
        recoverable: true,
        message: 'Connection refused',
        originalError: new Error('ECONNREFUSED'),
      };
      const msg = toUserMessage(classification);
      expect(msg).toContain('connection');
    });

    it('returns actionable message for auth errors', () => {
      const classification: ErrorClassification = {
        category: 'auth',
        recoverable: false,
        message: 'Unauthorized',
        originalError: new Error('401'),
      };
      const msg = toUserMessage(classification);
      expect(msg).toContain('auth');
    });

    it('returns actionable message for timeout errors', () => {
      const classification: ErrorClassification = {
        category: 'timeout',
        recoverable: true,
        message: 'Request timed out',
        originalError: new Error('ETIMEDOUT'),
      };
      const msg = toUserMessage(classification);
      expect(msg).toContain('timed out');
    });

    it('returns generic message for internal errors', () => {
      const classification: ErrorClassification = {
        category: 'internal',
        recoverable: false,
        message: 'Unexpected error',
        originalError: new Error('kaboom'),
      };
      const msg = toUserMessage(classification);
      expect(msg.length).toBeGreaterThan(0);
    });

    it('does not include stack traces', () => {
      const err = new Error('test');
      err.stack = 'Error: test\n at something.js:1:2';
      const classification: ErrorClassification = {
        category: 'internal',
        recoverable: false,
        message: 'test',
        originalError: err,
      };
      const msg = toUserMessage(classification);
      expect(msg).not.toContain('at something');
    });
  });
});
