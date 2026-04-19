import type { Request, Response } from "express";
import { collectInlineFindingsForPost } from "../../application/utils/collect-inline-findings-for-post.js";
import { buildReviewSummaryMarkdown } from "../../application/utils/build-review-summary-markdown.js";
import { ServiceNotConfiguredError } from "../../domain/errors/service-not-configured-error.js";
import type { RunPullRequestReviewInput, RunPullRequestReviewOutput } from "../../application/use-cases/run-pull-request-review-use-case.js";
import { toLoggableErrorFields } from "../../../../shared/logger/loggable-error.js";
import { timingSafeStringEqual } from "../../../../shared/security/timing-safe-string-equal.js";
import type { CodeReviewControllerDeps } from "./code-review-controller-deps.js";
import { handleAzureDevOpsPullRequestWebhookHttp } from "./webhooks/handle-azure-devops-pull-request-webhook-http.js";
import { handleBitbucketPullRequestWebhookHttp } from "./webhooks/handle-bitbucket-pull-request-webhook-http.js";
import { handleGitHubPullRequestWebhookHttp } from "./webhooks/handle-github-pull-request-webhook-http.js";
import { handleGitLabMergeRequestWebhookHttp } from "./webhooks/handle-gitlab-merge-request-webhook-http.js";
import { handlePipelinePullRequestReviewHttp } from "./webhooks/handle-pipeline-pull-request-review-http.js";
import type { WebhookHttpToolkit } from "./webhooks/webhook-http-toolkit.js";

export type { CodeReviewControllerDeps, CodeReviewControllerLogger } from "./code-review-controller-deps.js";

function findServiceNotConfiguredError(error: unknown): ServiceNotConfiguredError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined && current !== null; depth += 1) {
    if (current instanceof ServiceNotConfiguredError) {
      return current;
    }
    if (current instanceof Error && current.cause !== undefined) {
      current = current.cause;
      continue;
    }
    break;
  }
  return null;
}

export class CodeReviewController {
  public constructor(private readonly deps: CodeReviewControllerDeps) {}

  public handlePipelinePullRequestReview = async (request: Request, response: Response): Promise<void> => {
    await handlePipelinePullRequestReviewHttp(this.createWebhookToolkit(), request, response);
  };

  public handleGitHubWebhook = async (request: Request, response: Response): Promise<void> => {
    await handleGitHubPullRequestWebhookHttp(this.createWebhookToolkit(), request, response);
  };

  public handleGitLabWebhook = async (request: Request, response: Response): Promise<void> => {
    await handleGitLabMergeRequestWebhookHttp(this.createWebhookToolkit(), request, response);
  };

  public handleBitbucketWebhook = async (request: Request, response: Response): Promise<void> => {
    await handleBitbucketPullRequestWebhookHttp(this.createWebhookToolkit(), request, response);
  };

  public handleAzureDevOpsWebhook = async (request: Request, response: Response): Promise<void> => {
    await handleAzureDevOpsPullRequestWebhookHttp(this.createWebhookToolkit(), request, response);
  };

  private createWebhookToolkit(): WebhookHttpToolkit {
    return {
      deps: this.deps,
      isAuthorized: (request) => this.isAuthorized(request),
      parseJsonPayload: (request, parser) => this.parseJsonPayload(request, parser),
      extractRawPayload: (request) => this.extractRawPayload(request),
      respondWebhookSecretMissing: (response, envVarName) => this.respondWebhookSecretMissing(response, envVarName),
      runReview: (response, input) => this.runReview(response, input)
    };
  }

  private async postPrCommentsToScm(
    input: RunPullRequestReviewInput,
    output: RunPullRequestReviewOutput
  ): Promise<{
    commentPosted: boolean;
    commentPostError?: string;
    inlineCommentsPosted: number;
    inlineCommentsPostError?: string;
  }> {
    if (!this.deps.postReviewPrComment) {
      return { commentPosted: false, inlineCommentsPosted: 0 };
    }

    let commentPosted = false;
    let commentPostError: string | undefined;

    try {
      const bodyMarkdown = buildReviewSummaryMarkdown(output);
      await this.deps.reviewCommentPort.postReviewSummary({
        pullRequestRef: input.pullRequestRef,
        bodyMarkdown,
        headSha: output.headSha
      });
      commentPosted = true;
    } catch (commentError) {
      commentPostError = commentError instanceof Error ? commentError.message : String(commentError);
      this.deps.logger.error(toLoggableErrorFields(commentError), "post PR review comment failed");
    }

    const inlineFindings = collectInlineFindingsForPost(output.reviews);

    if (inlineFindings.length === 0) {
      return { commentPosted, commentPostError, inlineCommentsPosted: 0 };
    }

    try {
      const inlineCommentsPosted = await this.deps.reviewCommentPort.postInlineFindings({
        pullRequestRef: input.pullRequestRef,
        headSha: output.headSha,
        findings: inlineFindings
      });

      return { commentPosted, commentPostError, inlineCommentsPosted };
    } catch (inlineError) {
      const inlineCommentsPostError =
        inlineError instanceof Error ? inlineError.message : String(inlineError);
      this.deps.logger.error(toLoggableErrorFields(inlineError), "post PR inline review comments failed");

      return { commentPosted, commentPostError, inlineCommentsPosted: 0, inlineCommentsPostError };
    }
  }

  private async runReview(response: Response, input: RunPullRequestReviewInput): Promise<void> {
    try {
      const output = await this.deps.useCase.execute(input);

      this.deps.logger.info(
        {
          provider: output.provider,
          repository: output.repositoryLabel,
          pullRequestNumber: output.pullRequestNumber,
          headSha: output.headSha,
          reviewAgents: output.reviews.map((r) => ({
            agent: r.agent,
            findingsCount: r.findings.length,
            inlineFindingsCount: r.inlineFindings.length,
            summaryChars: r.summary.length
          }))
        },
        "pull request reviewed"
      );

      const commentResult = await this.postPrCommentsToScm(input, output);

      response.status(200).json({
        ...output,
        commentPosted: commentResult.commentPosted,
        inlineCommentsPosted: commentResult.inlineCommentsPosted,
        ...(commentResult.commentPostError ? { commentPostError: commentResult.commentPostError } : {}),
        ...(commentResult.inlineCommentsPostError
          ? { inlineCommentsPostError: commentResult.inlineCommentsPostError }
          : {})
      });
    } catch (error) {
      const notConfigured = findServiceNotConfiguredError(error);
      if (notConfigured) {
        response.status(503).json({ message: notConfigured.message, code: notConfigured.code });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);

      this.deps.logger.error(toLoggableErrorFields(error), "review failed");

      if (this.deps.exposeReviewErrorDetail) {
        response.status(500).json({ message: "review failed", detail: message });
        return;
      }

      response.status(500).json({ message: "review failed" });
    }
  }

  private respondWebhookSecretMissing(response: Response, envVarName: string): void {
    response.status(503).json({
      message: "webhook not configured",
      detail: `Defina ${envVarName} no servidor para aceitar este webhook. Em desenvolvimento pode usar POST /reviews/pull-request com Authorization se REVIEW_SERVICE_TOKEN estiver definido.`
    });
  }

  private parseJsonPayload<T>(request: Request, parser: (payload: unknown) => T): T | null {
    try {
      return parser(this.parseBody(request.body));
    } catch {
      return null;
    }
  }

  private parseBody(body: unknown): unknown {
    if (Buffer.isBuffer(body)) {
      return JSON.parse(body.toString("utf-8"));
    }

    return body;
  }

  private extractRawPayload(request: Request): Buffer {
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    if (rawBody) {
      return rawBody;
    }

    if (Buffer.isBuffer(request.body)) {
      return request.body;
    }

    return Buffer.from(JSON.stringify(request.body ?? {}));
  }

  private isAuthorized(request: Request): boolean {
    const token = this.deps.reviewServiceToken?.trim();
    if (!token) {
      return true;
    }

    const authorization = request.header("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return false;
    }

    const candidate = authorization.slice("Bearer ".length).trim();
    return timingSafeStringEqual(token, candidate);
  }
}
