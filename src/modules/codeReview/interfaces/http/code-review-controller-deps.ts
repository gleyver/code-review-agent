import type { RunPullRequestReviewUseCase } from "../../application/use-cases/run-pull-request-review-use-case.js";
import type { PullRequestReviewCommentPort } from "../../domain/ports/pull-request-review-comment-port.js";

export type CodeReviewControllerLogger = {
  readonly info: (payload: unknown, message?: string) => void;
  readonly error: (payload: unknown, message?: string) => void;
};

export type CodeReviewControllerDeps = {
  readonly useCase: RunPullRequestReviewUseCase;
  readonly reviewCommentPort: PullRequestReviewCommentPort;
  readonly postReviewPrComment: boolean;
  readonly reviewServiceToken: string | undefined;
  readonly githubWebhookSecret: string | undefined;
  readonly gitlabWebhookSecret: string | undefined;
  readonly bitbucketWebhookSecret: string | undefined;
  readonly azureDevOpsWebhookSecret: string | undefined;
  readonly azureDevOpsOrganizationFallback: string | undefined;
  readonly azureDevOpsProjectFallback: string | undefined;
  readonly gitlabWebRootUrl: string;
  readonly exposeReviewErrorDetail: boolean;
  readonly logger: CodeReviewControllerLogger;
};
