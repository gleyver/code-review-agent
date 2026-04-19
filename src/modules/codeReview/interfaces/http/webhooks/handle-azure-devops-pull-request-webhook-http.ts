import type { Request, Response } from "express";
import { timingSafeStringEqual } from "../../../../../shared/security/timing-safe-string-equal.js";
import { parseAzureDevOpsPullRequestWebhook } from "../azure-devops-pull-request-webhook-schema.js";
import {
  buildAzureDevOpsPullRequestWebUrl,
  buildAzureDevOpsPullRequestWebUrlFromParts,
  parseAzureDevOpsGitRepositoryUrl
} from "../azure-devops-repo-url.js";
import type { WebhookHttpToolkit } from "./webhook-http-toolkit.js";

export async function handleAzureDevOpsPullRequestWebhookHttp(
  toolkit: WebhookHttpToolkit,
  request: Request,
  response: Response
): Promise<void> {
  if (!toolkit.isAuthorized(request)) {
    response.status(401).json({ message: "unauthorized" });
    return;
  }

  const adoSecret = toolkit.deps.azureDevOpsWebhookSecret?.trim();
  if (!adoSecret) {
    toolkit.respondWebhookSecretMissing(response, "AZURE_DEVOPS_WEBHOOK_SECRET");
    return;
  }

  const azureToken = request.header("x-azure-webhook-token");
  if (!timingSafeStringEqual(adoSecret, azureToken)) {
    response.status(401).json({ message: "invalid azure devops webhook token" });
    return;
  }

  const payload = toolkit.parseJsonPayload(request, parseAzureDevOpsPullRequestWebhook);
  if (!payload) {
    response.status(400).json({ message: "invalid payload" });
    return;
  }

  if (payload.eventType !== "git.pullrequest.created") {
    response.status(202).json({ ignored: true, reason: "unsupported_event" });
    return;
  }

  const repositoryUrl = payload.resource.repository.url?.trim() ?? "";
  const repositoryId = payload.resource.repository.id?.trim() ?? "";

  if (!repositoryUrl && !repositoryId) {
    response.status(400).json({ message: "repository precisa de url ou id" });
    return;
  }

  const parsedRepo = repositoryUrl ? parseAzureDevOpsGitRepositoryUrl(repositoryUrl) : null;

  if (repositoryUrl && !parsedRepo) {
    response.status(400).json({
      message:
        "repository.url invalida (esperado: https://dev.azure.com/{org}/{projeto}/_git/{nome-do-repo})"
    });
    return;
  }

  const organization = (parsedRepo?.organization ?? toolkit.deps.azureDevOpsOrganizationFallback)?.trim();
  const project = (parsedRepo?.project ?? toolkit.deps.azureDevOpsProjectFallback)?.trim();

  if (!organization || !project) {
    response.status(400).json({
      message:
        "defina organization/projeto via repository.url ou configure AZURE_DEVOPS_ORGANIZATION e AZURE_DEVOPS_PROJECT"
    });
    return;
  }

  const repositoryIdentifier = repositoryId || (parsedRepo?.repoSlug ?? "");

  if (!repositoryIdentifier) {
    response.status(400).json({
      message: "informe repository.id (GUID) ou repository.url com o repositorio apos /_git/"
    });
    return;
  }

  const pullRequestId = payload.resource.pullRequestId;
  let pullRequestUrl = payload.resource.url?.trim() ?? "";

  if (!pullRequestUrl) {
    pullRequestUrl = repositoryUrl
      ? buildAzureDevOpsPullRequestWebUrl(repositoryUrl, pullRequestId)
      : buildAzureDevOpsPullRequestWebUrlFromParts(organization, project, repositoryIdentifier, pullRequestId);
  }

  await toolkit.runReview(response, {
    pullRequestRef: {
      provider: "azure_devops",
      organization,
      project,
      repositoryId: repositoryIdentifier,
      pullRequestId
    },
    repositoryLabel: `${organization}/${project}`,
    pullRequestNumber: pullRequestId,
    pullRequestUrl
  });
}
