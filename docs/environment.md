# Environment Variables

sofIA uses environment variables for optional integrations. All are optional — the CLI degrades gracefully when they are absent.

## Web Search (Azure AI Foundry)

| Variable                        | Description                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `FOUNDRY_PROJECT_ENDPOINT`      | Azure AI Foundry project endpoint URL (e.g., `https://<name>.services.ai.azure.com/api/projects/<project>`) |
| `FOUNDRY_MODEL_DEPLOYMENT_NAME` | Model deployment name for the web search agent (e.g., `gpt-4.1-mini`)                                       |

Both must be set for the `web.search` tool to be available. When not configured, the web search tool is disabled and the workshop proceeds without web search capabilities.

**Authentication:** sofIA authenticates to the Azure AI Foundry Agent Service using `DefaultAzureCredential` from `@azure/identity`. No API key is required — ensure you are logged in via `az login` or have another credential available (Managed Identity, environment variables, etc.).

### Migrating from Legacy Configuration

If you previously used `SOFIA_FOUNDRY_AGENT_ENDPOINT` / `SOFIA_FOUNDRY_AGENT_KEY`:

1. **Remove** the old variables from your environment
2. **Set** the new variables (`FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_MODEL_DEPLOYMENT_NAME`)
3. **Ensure** you are logged in via `az login`

The CLI will display an error if it detects the old variables, guiding you through the migration.

> **Note**: `SOFIA_FOUNDRY_AGENT_ENDPOINT` and `SOFIA_FOUNDRY_AGENT_KEY` are no longer used. API key authentication has been replaced by Azure Identity credentials.

## Testing

| Variable               | Description                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `SOFIA_LIVE_MCP_TESTS` | Set to `true` to enable end-to-end tests that require real MCP server access and external API calls (e.g., web search). Default: `false` |

These tests are skipped by default because they:

- Require external service credentials
- May incur API costs
- Have longer execution times
- Depend on live network access

To run live tests:

```bash
export SOFIA_LIVE_MCP_TESTS=true
npm test  # or npm run test:e2e
```

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
