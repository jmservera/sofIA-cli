# Environment Variables

sofIA uses environment variables for optional integrations. All are optional — the CLI degrades gracefully when they are absent.

## Web Search (Azure AI Foundry)

| Variable                       | Description                                     |
| ------------------------------ | ----------------------------------------------- |
| `SOFIA_FOUNDRY_AGENT_ENDPOINT` | Azure AI Foundry Bing Search agent endpoint URL |
| `SOFIA_FOUNDRY_AGENT_KEY`      | API key for the Foundry agent                   |

Both must be set for the `web.search` tool to be available. When not configured, the web search tool is disabled and the workshop proceeds without web search capabilities.

**Security:** `SOFIA_FOUNDRY_AGENT_KEY` is never logged or persisted. The logger redacts fields named `key`, `secret`, `token`, `apiKey`, `api_key`, `authorization`, `auth`, `credential`, and `credentials`.

## Copilot SDK

The `@github/copilot-sdk` reads its own environment variables for authentication. Refer to the [Copilot SDK documentation](https://github.com/github/copilot-sdk) for details.

## Logger Redaction

The following field names are automatically redacted in structured logs:

- `password`
- `token`
- `secret`
- `apiKey`
- `api_key`
- `authorization`
- `auth`
- `credential`
- `credentials`

Any log entry containing these field names will have their values replaced with `[REDACTED]`.
