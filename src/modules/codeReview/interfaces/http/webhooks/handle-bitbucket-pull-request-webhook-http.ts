import type { Request, Response } from "express";
import { splitBitbucketFullName } from "../bitbucket-full-name.js";
import { parseBitbucketPullRequestWebhook } from "../bitbucket-pull-request-webhook-schema.js";
import { isValidBitbucketWebhookSignature } from "../hub-webhook-hmac-sha256.js";
import { buildBitbucketPullRequestWebUrl } from "../scm-webhook-pull-url.js";
import type { WebhookHttpToolkit } from "./webhook-http-toolkit.js";

export async function handleBitbucketPullRequestWebhookHttp(
  toolkit: WebhookHttpToolkit,
  request: Request,
  response: Response
): Promise<void> {
  if (!toolkit.isAuthorized(request)) {
    response.status(401).json({ message: "unauthorized" });
    return;
  }

  const eventKey = request.header("x-event-key");
  if (eventKey !== "pullrequest:created") {
    response.status(202).json({ ignored: true, reason: "unsupported_event" });
    return;
  }

  if (!toolkit.deps.bitbucketWebhookSecret?.trim()) {
    toolkit.respondWebhookSecretMissing(response, "BITBUCKET_WEBHOOK_SECRET");
    return;
  }

  const payloadBuffer = toolkit.extractRawPayload(request);
  if (
    !isValidBitbucketWebhookSignature({
      signature256: request.header("x-hub-signature-256"),
      signature: request.header("x-hub-signature"),
      payload: payloadBuffer,
      secret: toolkit.deps.bitbucketWebhookSecret
    })
  ) {
    response.status(401).json({ message: "invalid webhook signature" });
    return;
  }

  const payload = toolkit.parseJsonPayload(request, parseBitbucketPullRequestWebhook);
  if (!payload) {
    response.status(400).json({ message: "invalid payload" });
    return;
  }

  const { workspace, repoSlug } = splitBitbucketFullName(payload.repository.full_name);
  const pullRequestId = payload.pullrequest.id;
  const pullRequestUrl =
    payload.pullrequest.links?.html?.href?.trim() ||
    buildBitbucketPullRequestWebUrl(payload.repository.full_name, pullRequestId);

  await toolkit.runReview(response, {
    pullRequestRef: {
      provider: "bitbucket",
      workspace,
      repoSlug,
      pullRequestId
    },
    repositoryLabel: payload.repository.full_name,
    pullRequestNumber: pullRequestId,
    pullRequestUrl
  });
}
