import type { Request, Response } from "express";
import { timingSafeStringEqual } from "../../../../../shared/security/timing-safe-string-equal.js";
import { parseGitlabMergeRequestWebhook } from "../gitlab-merge-request-webhook-schema.js";
import { buildGitLabMergeRequestWebUrl, buildGitLabMergeRequestWebUrlByProjectId } from "../scm-webhook-pull-url.js";
import type { WebhookHttpToolkit } from "./webhook-http-toolkit.js";

export async function handleGitLabMergeRequestWebhookHttp(
  toolkit: WebhookHttpToolkit,
  request: Request,
  response: Response
): Promise<void> {
  if (!toolkit.isAuthorized(request)) {
    response.status(401).json({ message: "unauthorized" });
    return;
  }

  if (request.header("x-gitlab-event") !== "Merge Request Hook") {
    response.status(202).json({ ignored: true, reason: "unsupported_event" });
    return;
  }

  const secret = toolkit.deps.gitlabWebhookSecret?.trim();
  if (!secret) {
    toolkit.respondWebhookSecretMissing(response, "GITLAB_WEBHOOK_SECRET");
    return;
  }

  const gitlabToken = request.header("x-gitlab-token");
  if (!timingSafeStringEqual(secret, gitlabToken)) {
    response.status(401).json({ message: "invalid gitlab webhook token" });
    return;
  }

  const payload = toolkit.parseJsonPayload(request, parseGitlabMergeRequestWebhook);
  if (!payload) {
    response.status(400).json({ message: "invalid payload" });
    return;
  }

  if (payload.object_attributes.action !== "open") {
    response.status(202).json({ ignored: true, reason: "unsupported_action" });
    return;
  }

  const projectId = String(payload.project.id);
  const iid = payload.object_attributes.iid;
  const repositoryLabel = payload.project.path_with_namespace ?? projectId;
  const pathWithNamespace = payload.project.path_with_namespace?.trim();

  let pullRequestUrl = payload.object_attributes.url?.trim() ?? "";

  if (!pullRequestUrl) {
    if (pathWithNamespace) {
      pullRequestUrl = buildGitLabMergeRequestWebUrl(toolkit.deps.gitlabWebRootUrl, pathWithNamespace, iid);
    }

    if (!pullRequestUrl) {
      pullRequestUrl = buildGitLabMergeRequestWebUrlByProjectId(toolkit.deps.gitlabWebRootUrl, projectId, iid);
    }
  }

  await toolkit.runReview(response, {
    pullRequestRef: {
      provider: "gitlab",
      projectId,
      mergeRequestIid: iid
    },
    repositoryLabel,
    pullRequestNumber: iid,
    pullRequestUrl
  });
}
