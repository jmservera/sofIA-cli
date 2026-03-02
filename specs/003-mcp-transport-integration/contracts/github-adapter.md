# Contract: GitHub MCP Adapter (Real Integration)

**Feature**: 003-mcp-transport-integration  
**Module**: `src/develop/githubMcpAdapter.ts`  
**Status**: Authoritative design document (replaces stub behavior from Feature 002)

---

## Overview

`GitHubMcpAdapter` wraps two GitHub MCP tool calls — `create_repository` and `push_files` — and applies graceful degradation when the GitHub MCP server is unavailable. This contract defines the real behavior replacing the stubs introduced in Feature 002.

---

## createRepository()

### Call

```typescript
mcpManager.callTool(
  'github',
  'create_repository',
  {
    name: options.name, // repository name (slug)
    description: options.description ?? '',
    private: options.private ?? true,
  },
  { timeoutMs: 60_000 },
);
```

### Response Mapping

The GitHub MCP `create_repository` tool returns a JSON object representing the created repository. Field extraction priority:

| Field to Extract | Try These Response Keys (in order)                                   |
| ---------------- | -------------------------------------------------------------------- |
| `repoUrl`        | `response.html_url`, `response.url`, `response.clone_url`            |
| `repoName`       | `response.name`, `response.full_name`, or fallback to `options.name` |

### Success Return

```typescript
{ available: true, repoUrl: 'https://github.com/org/repo', repoName: 'repo' }
```

### Failure Return

```typescript
{ available: false, reason: '<error message>' }
```

### Conditions Returning `{ available: false }`

| Condition                                           | Reason Logged                           |
| --------------------------------------------------- | --------------------------------------- |
| `isAvailable()` is `false`                          | `'GitHub MCP not available'`            |
| `callTool` throws `McpTransportError`               | Error message from transport            |
| Response missing `html_url`, `url`, and `clone_url` | `'MCP response missing repository URL'` |

---

## pushFiles()

### Pre-processing (ralphLoop.ts responsibility)

Before calling `pushFiles()`, the caller (Ralph Loop) MUST:

1. Read each file's content from disk using `readFile(resolve(outputDir, filePath), 'utf-8')`.
2. Skip files that fail to read — log a warning and omit them from the push.
3. Skip files outside the output directory (path traversal check using `isPathWithinDirectory`).

The `PushFilesOptions.files` array MUST contain actual file content — never empty strings.

### Call

```typescript
mcpManager.callTool(
  'github',
  'push_files',
  {
    owner: extractOwnerFromUrl(options.repoUrl), // extracted from repo URL
    repo: extractRepoFromUrl(options.repoUrl), // extracted from repo URL
    branch: options.branch ?? 'main',
    message: options.commitMessage,
    files: options.files.map((f) => ({
      path: f.path,
      content: f.content, // actual file content (UTF-8 text)
    })),
  },
  { timeoutMs: 60_000 },
);
```

### Response Mapping

| Field to Extract | Try These Response Keys               |
| ---------------- | ------------------------------------- |
| `commitSha`      | `response.sha`, `response.commit.sha` |

### Success Return

```typescript
{ available: true, commitSha: 'abc123def456' }
// commitSha is optional — may be undefined if the server doesn't return it
```

### Failure Return

```typescript
{ available: false, reason: '<error message>' }
```

---

## Post-Scaffold Push (RalphLoop Responsibility)

The Ralph Loop is responsible for an **initial scaffold push** immediately after npm install completes and before entering the iteration loop:

```
scaffold → npm install → push scaffold files → iteration 1 → iteration 2 → ...
```

**When to push**: Only if `githubAdapter.isAvailable()` AND a repo was created (non-null `repoUrl`).

**Files to push**: All `scaffoldResult.createdFiles` (relative paths within `outputDir`).

**Content**: Read from disk at `resolve(outputDir, filePath)` — same pattern as iteration pushes.

**On failure**: Log warning and continue — scaffold push failure is not fatal.

---

## Graceful Degradation Rules

1. When GitHub MCP is unavailable (`isAvailable()` returns `false`): both methods return `{ available: false }` immediately without attempting any tool call.
2. When a tool call throws any error: catch, log at `warn` level, return `{ available: false, reason: err.message }`.
3. When `createRepository` fails: the Ralph Loop continues with local-only output (no remote repo).
4. When `pushFiles` fails: the local PoC is intact; the remote repo may be stale. Log the failure with iteration number.

---

## Acceptance Tests

| Test                                                                | Type        | Description                                          |
| ------------------------------------------------------------------- | ----------- | ---------------------------------------------------- |
| `createRepository dispatches create_repository tool call`           | unit        | Verify callTool called with correct server/tool/args |
| `createRepository extracts repoUrl from html_url response field`    | unit        | Mock response with `html_url`                        |
| `createRepository extracts repoUrl from url response field`         | unit        | Mock response with `url` (fallback)                  |
| `createRepository returns available:false when MCP unavailable`     | unit        | `isAvailable()` returns false                        |
| `createRepository returns available:false on callTool error`        | unit        | Transport throws                                     |
| `createRepository returns available:false when response has no URL` | unit        | Mock response missing all URL fields                 |
| `pushFiles dispatches push_files with actual content`               | unit        | Verify `files[n].content` is non-empty string        |
| `pushFiles extracts commitSha from response.sha`                    | unit        | Mock response with `sha`                             |
| `pushFiles extracts commitSha from response.commit.sha`             | unit        | Mock response with nested sha                        |
| `pushFiles returns available:false when MCP unavailable`            | unit        | `isAvailable()` returns false                        |
| `pushFiles returns available:false on callTool error`               | unit        | Transport throws                                     |
| `ralphLoop pushFiles sends non-empty file content`                  | integration | Verify content !== '' for all pushed files           |
| `ralphLoop pushes scaffold files after npm install`                 | integration | Scaffold push happens before iteration 1             |
| `ralphLoop skips out-of-bounds paths before pushFiles`              | integration | Path traversal attempt is logged and skipped         |
