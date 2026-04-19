import type { Request, Response } from "express";
import type { RunPullRequestReviewInput } from "../../../application/use-cases/run-pull-request-review-use-case.js";
import type { CodeReviewControllerDeps } from "../code-review-controller-deps.js";

export type WebhookHttpToolkit = {
  readonly deps: CodeReviewControllerDeps;
  isAuthorized(request: Request): boolean;
  parseJsonPayload<T>(request: Request, parser: (payload: unknown) => T): T | null;
  extractRawPayload(request: Request): Buffer;
  respondWebhookSecretMissing(response: Response, envVarName: string): void;
  runReview(response: Response, input: RunPullRequestReviewInput): Promise<void>;
};
