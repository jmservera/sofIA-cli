# Feature Specification: AI Foundry Search Service Deployment

**Feature Branch**: `005-ai-search-deploy`  
**Created**: 2026-03-01  
**Status**: Draft  
**Input**: User description: "Create the AI Foundry Search service as a bicep file and make it easily deployable using a script. This Search service will be the one used as a tool for web search, especially during the first step where we may need to search about the company, competitors and project specific information."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — One-Command Search Service Deployment (Priority: P1)

A developer or workshop facilitator wants to provision the Azure AI Foundry infrastructure that powers sofIA's `web.search` tool. They run a single deployment script, provide their Azure subscription details, and receive a fully deployed Foundry project with a web-search-enabled agent. The script outputs the project endpoint URL and model deployment name. Since the Foundry Agent Service uses the caller's Azure login credentials for authentication (no separate API key), the user simply sets the project endpoint and model deployment name as environment variables (`FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_MODEL_DEPLOYMENT_NAME`) and the sofIA CLI immediately has web search capabilities.

**Why this priority**: Without the deployed Search service, the `web.search` tool has no backend. This is the foundational story — every other story depends on a working deployment.

**Independent Test**: Can be tested by running the deployment script against an Azure subscription and verifying the Search service is provisioned, accessible, and returns valid responses to a test query.

**Acceptance Scenarios**:

1. **Given** a user with an active Azure subscription and Owner/Contributor permissions, **When** they run the deployment script providing their subscription ID and a resource group name, **Then** all required Azure AI Foundry resources are provisioned, and the script outputs the project endpoint URL and model deployment name.
2. **Given** the deployment script has completed successfully, **When** the user sets the output values as environment variables (`FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_MODEL_DEPLOYMENT_NAME`) and is logged in to Azure, **Then** the sofIA CLI's `web.search` tool is enabled and returns search results with inline citations for a test query.
3. **Given** a user provides an Azure region that does not support the required services, **When** they run the deployment script, **Then** the script fails with a clear error message explaining which services are unavailable in that region and suggests supported alternatives.

---

### User Story 2 — Infrastructure-as-Code Reproducibility (Priority: P2)

A DevOps engineer or contributor wants to review, customize, and version-control the Azure infrastructure definition. They inspect the infrastructure template, understand the resources being created, modify parameters (such as region, naming conventions, or model selection), and deploy a customized version. The template is self-documenting with parameter descriptions and follows Azure best practices.

**Why this priority**: Reproducibility and transparency are essential for team collaboration, auditing, and compliance. Without a readable, parameterized template, each deployment becomes a one-off manual effort.

**Independent Test**: Can be tested by opening the infrastructure template files, verifying all parameters have descriptions and defaults, and deploying with customized parameter values.

**Acceptance Scenarios**:

1. **Given** a contributor opens the infrastructure template, **When** they review the file, **Then** every parameter has a description, a sensible default (where applicable), and the resources to be created are clearly documented.
2. **Given** a user wants to deploy in a different Azure region, **When** they override the region parameter, **Then** the deployment succeeds in the new region (assuming service availability) without modifying the template itself.
3. **Given** a user wants to use a different model for the Search agent, **When** they override the model deployment parameter, **Then** the deployment provisions the specified model instead of the default.

---

### User Story 3 — Seamless Integration with sofIA CLI (Priority: P3)

After deployment, a workshop facilitator launches sofIA and begins the Discover phase (Step 1). When the AI asks about the user's business and industry, the facilitator expects sofIA to automatically use the web search tool to research the company, its competitors, and industry trends. The search results are grounded with citations and enrich the discovery conversation.

**Why this priority**: This story validates the end-to-end value — deployment is only useful if the CLI can consume the service. However, the CLI integration layer already exists (the `web.search` tool in `webSearch.ts`); this story confirms it works with the newly deployed Foundry agent.

**Independent Test**: Can be tested by deploying the service, configuring environment variables, starting a sofIA workshop session, and verifying that the Discover phase uses web search to retrieve real-time information about a named company.

**Acceptance Scenarios**:

1. **Given** the Foundry Search agent is deployed and environment variables are configured, **When** a user starts a sofIA workshop and describes their business, **Then** the `web.search` tool is invoked to research the company and returns results with citations.
2. **Given** the Foundry Search agent endpoint becomes temporarily unavailable, **When** the sofIA CLI tries to use the `web.search` tool, **Then** the CLI degrades gracefully (no crash) and the workshop continues without web search capabilities, with a warning to the user.

---

### User Story 4 — Teardown and Cost Management (Priority: P4)

A user who has finished a workshop or testing session wants to remove all deployed Azure resources to avoid ongoing costs. They run a teardown command that cleanly removes the resource group and all contained resources.

**Why this priority**: Azure resources incur costs when idle. Workshop and PoC scenarios are often short-lived, so easy teardown is important for cost management, though it doesn't block core functionality.

**Independent Test**: Can be tested by deploying the infrastructure, running the teardown command, and verifying the resource group and all resources are deleted.

**Acceptance Scenarios**:

1. **Given** a previously deployed Foundry Search infrastructure, **When** the user runs the teardown command, **Then** the resource group and all contained resources are deleted within 10 minutes.
2. **Given** the user runs the teardown command for a resource group that doesn't exist, **Then** the script exits with a clear informational message (not an error).

---

### Edge Cases

- What happens when the user's Azure subscription has reached its quota for Cognitive Services resources?
- How does the system handle a deployment where the specified resource group already contains a Foundry resource with the same name?
- What happens if the user loses network connectivity mid-deployment?
- How does the system handle Azure regions where the Foundry Agent Service or web search capability is not yet available?
- What happens when the user's Azure account has insufficient permissions (e.g., Reader role instead of Owner/Contributor)?
- How does the system handle concurrent deployments to the same resource group?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST include an infrastructure template that defines all Azure resources needed for the AI Foundry web search capability (Foundry account, project, model deployment, and agent capability).
- **FR-002**: The project MUST include a deployment script that provisions the infrastructure with a single command, accepting the target Azure subscription, resource group, and region as inputs. If the specified resource group does not exist, the script MUST create it automatically.
- **FR-003**: The deployment script MUST output the Foundry project endpoint URL and model deployment name needed to configure the sofIA CLI (`FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_MODEL_DEPLOYMENT_NAME`). Authentication uses the caller's Azure login credentials — no separate API key is needed.
- **FR-004**: The infrastructure template MUST be parameterized, allowing users to customize the deployment name, region, and model selection without modifying the template. The default region MUST be `swedencentral`.
- **FR-005**: The deployment script MUST validate prerequisites before attempting deployment (Azure CLI installed, user logged in, correct subscription selected, sufficient permissions).
- **FR-006**: The deployment script MUST provide clear, actionable error messages when a deployment fails, including the specific failure reason and suggested remediation.
- **FR-007**: The project MUST include a teardown command that removes all deployed resources by deleting the resource group.
- **FR-008**: The infrastructure template MUST follow the basic agent setup pattern (Microsoft-managed resources) to minimize complexity and cost for workshop/PoC scenarios.
- **FR-009**: The deployed agent MUST support the `web_search_preview` tool type to provide real-time web search grounded with citations.
- **FR-010**: The deployment script MUST be executable from common development environments (Linux, macOS, Windows via WSL or Git Bash).
- **FR-011**: The infrastructure template MUST include documentation (parameter descriptions, comments) explaining each resource and its purpose.
- **FR-012**: The deployment MUST configure the Foundry agent with web search enabled and an appropriate model deployment for handling search queries. The default model deployment MUST be `gpt-4.1-mini`.
- **FR-013**: The sofIA CLI MUST authenticate to the Foundry Agent Service using the user's Azure login credentials (e.g., via Azure Identity), eliminating the need for separate API key management.
- **FR-014**: Search responses MUST include inline URL citations so the user can verify the sources of information surfaced during the workshop.
- **FR-015**: The web search agent MUST follow an ephemeral lifecycle — created when a sofIA CLI session starts and automatically deleted when the session ends. The Bicep template provisions only the Foundry account, project, and model deployment; agent creation/deletion is handled at runtime by the CLI.
- **FR-016**: If the CLI detects the legacy environment variables (`SOFIA_FOUNDRY_AGENT_ENDPOINT` or `SOFIA_FOUNDRY_AGENT_KEY`), it MUST display a clear error message instructing the user to migrate to the new variables (`FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_MODEL_DEPLOYMENT_NAME`). The old variables MUST NOT be used for authentication.

### Key Entities

- **Foundry Account**: The top-level Azure AI Foundry resource that hosts projects and model deployments. Identified by a unique name within a resource group.
- **Foundry Project**: A project within the Foundry account where the web search agent operates. Provides the endpoint URL used by the sofIA CLI.
- **Model Deployment**: A deployed language model (default: `gpt-4.1-mini`) within the Foundry account that processes search queries and generates grounded responses with citations.
- **Web Search Agent**: A Foundry agent configured with the `web_search_preview` tool that performs real-time web searches. The agent is ephemeral — created when a sofIA CLI session starts and deleted when the session ends. No agent resource is managed in the Bicep template.
- **Deployment Configuration**: The set of parameters (subscription, resource group, region, naming, model choice) that define a specific infrastructure deployment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can deploy the complete web search infrastructure in under 15 minutes, including prerequisite checks and resource provisioning.
- **SC-002**: The deployment script succeeds on the first attempt for 95% of users who have a valid Azure subscription with Owner/Contributor permissions.
- **SC-003**: After deployment, the sofIA CLI can perform a web search query and receive grounded results with citations within 10 seconds.
- **SC-004**: Teardown removes all deployed resources and stops all associated billing within 10 minutes of execution.
- **SC-005**: The infrastructure template is fully self-documented — a user can understand every resource and parameter by reading the template file alone, without external documentation.
- **SC-006**: The deployment is reproducible — running the deployment script twice with the same parameters on different machines produces functionally equivalent environments.

## Clarifications

### Session 2026-03-01

- Q: What should the default Azure region be for the deployment template? → A: `swedencentral`
- Q: What should the default model deployment for the web search agent be? → A: `gpt-4.1-mini`
- Q: Should the Foundry agent be persistent or ephemeral? → A: Ephemeral per CLI session (created on session start, deleted on session end)
- Q: Should the deployment script auto-create the resource group if it doesn't exist? → A: Yes, auto-create it (subscription-level deployment)
- Q: Should the CLI support both old and new env vars during migration? → A: Clean break — only new env vars, with error message if old ones detected

## Assumptions

- Users have an active Azure subscription with Owner or Contributor permissions on the target resource group.
- The Azure CLI is installed and the user is already authenticated (`az login`). This same Azure login is used for both deploying the infrastructure and authenticating the sofIA CLI to the Foundry Agent Service at runtime.
- The target Azure region supports Azure AI Foundry and the Grounding with Bing Search capability (uses Bing Search behind the scenes — governed by [Grounding with Bing terms of use](https://www.microsoft.com/bing/apis/grounding-legal-enterprise)).
- The basic agent setup (Microsoft-managed infrastructure) is sufficient for workshop and PoC use cases — standard agent setup with BYO resources is out of scope for this feature.
- The sofIA CLI's existing `webSearch.ts` module uses raw HTTP POST with a bearer token (`SOFIA_FOUNDRY_AGENT_ENDPOINT` + `SOFIA_FOUNDRY_AGENT_KEY`). This feature will migrate the web search integration to the Foundry Agent Service SDK pattern, which authenticates via Azure Identity credentials and uses the `web_search_preview` tool type. The environment variables will change from `SOFIA_FOUNDRY_AGENT_ENDPOINT`/`SOFIA_FOUNDRY_AGENT_KEY` to `FOUNDRY_PROJECT_ENDPOINT`/`FOUNDRY_MODEL_DEPLOYMENT_NAME`. This is a clean break — old env vars will trigger an error message guiding migration; they will not be silently ignored or used as fallback.
- The Foundry web search agent returns responses with inline URL citations (annotations of type `url_citation`), which the sofIA CLI should surface to the user.
- Cost for Grounding with Bing Search is usage-based and acceptable for workshop scenarios (typically a small number of queries per session). See [pricing](https://www.microsoft.com/bing/apis/grounding-pricing).
- The infrastructure files will live in a new `infra/` directory at the project root, following Azure conventions.
- An Azure admin may need to ensure web search is not disabled at the subscription level (see `az feature unregister --name OpenAI.BlockedTools.web_search --namespace Microsoft.CognitiveServices`).
