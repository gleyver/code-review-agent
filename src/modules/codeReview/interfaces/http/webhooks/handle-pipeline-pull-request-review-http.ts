import type { Request, Response } from "express";
import { mapPipelinePayloadToReviewInput, parsePipelinePullRequestReview } from "../pipeline-pull-request-review.js";
import type { WebhookHttpToolkit } from "./webhook-http-toolkit.js";

export async function handlePipelinePullRequestReviewHttp(
  toolkit: WebhookHttpToolkit,
  request: Request,
  response: Response
): Promise<void> {
  if (!toolkit.isAuthorized(request)) {
    response.status(401).json({ message: "unauthorized" });
    return;
  }

  const payload = toolkit.parseJsonPayload(request, parsePipelinePullRequestReview);
  if (!payload) {
    response.status(400).json({ message: "invalid payload" });
    return;
  }

  const input = mapPipelinePayloadToReviewInput(payload, { gitlabWebRootUrl: toolkit.deps.gitlabWebRootUrl });
  await toolkit.runReview(response, input);
}
