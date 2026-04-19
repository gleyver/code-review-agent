import type { Request, Response } from "express";
import { isValidGitHubWebhookSignature } from "../hub-webhook-hmac-sha256.js";
import { parsePullRequestWebhook } from "../github-webhook-schema.js";
import { buildGitHubPullRequestWebUrl } from "../scm-webhook-pull-url.js";
import type { WebhookHttpToolkit } from "./webhook-http-toolkit.js";

export async function handleGitHubPullRequestWebhookHttp(
  toolkit: WebhookHttpToolkit,
  request: Request,
  response: Response
): Promise<void> {
  if (!toolkit.isAuthorized(request)) {
    response.status(401).json({ message: "unauthorized" });
    return;
  }

  const event = request.header("x-github-event");
  if (event !== "pull_request") {
    response.status(202).json({ ignored: true, reason: "unsupported_event" });
    return;
  }

  if (!toolkit.deps.githubWebhookSecret?.trim()) {
    toolkit.respondWebhookSecretMissing(response, "GITHUB_WEBHOOK_SECRET");
    return;
  }

  const signature = request.header("x-hub-signature-256");
  const payloadBuffer = toolkit.extractRawPayload(request);

  if (!isValidGitHubWebhookSignature({ signature, payload: payloadBuffer, secret: toolkit.deps.githubWebhookSecret })) {
    response.status(401).json({ message: "invalid webhook signature" });
    return;
  }

  const payload = toolkit.parseJsonPayload(request, parsePullRequestWebhook);
  if (!payload) {
    response.status(400).json({ message: "invalid payload" });
    return;
  }

  if (payload.action !== "opened") {
    response.status(202).json({ ignored: true, reason: "unsupported_action" });
    return;
  }

  const pullRequestNumber = payload.pull_request.number;
  const pullRequestUrl =
    payload.pull_request.html_url?.trim() ||
    buildGitHubPullRequestWebUrl(payload.repository.full_name, pullRequestNumber);

  await toolkit.runReview(response, {
    pullRequestRef: {
      provider: "github",
      repositoryFullName: payload.repository.full_name,
      pullRequestNumber
    },
    repositoryLabel: payload.repository.full_name,
    pullRequestNumber,
    pullRequestUrl
  });
}
