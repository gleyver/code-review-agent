import type { Request, Response } from "express";
import { collectInlineFindingsForPost } from "../../application/utils/collect-inline-findings-for-post.js";
import { buildReviewSummaryMarkdown } from "../../application/utils/build-review-summary-markdown.js";
import type { PullRequestReviewCommentPort } from "../../domain/ports/pull-request-review-comment-port.js";
import type {
  RunPullRequestReviewInput,
  RunPullRequestReviewOutput,
  RunPullRequestReviewUseCase
} from "../../application/use-cases/run-pull-request-review-use-case.js";
import { parseAzureDevOpsPullRequestWebhook } from "./azure-devops-pull-request-webhook-schema.js";
import {
  buildAzureDevOpsPullRequestWebUrl,
  buildAzureDevOpsPullRequestWebUrlFromParts,
  parseAzureDevOpsGitRepositoryUrl
} from "./azure-devops-repo-url.js";
import { splitBitbucketFullName } from "./bitbucket-full-name.js";
import { parseBitbucketPullRequestWebhook } from "./bitbucket-pull-request-webhook-schema.js";
import { isValidBitbucketWebhookSignature, isValidGitHubWebhookSignature } from "./hub-webhook-hmac-sha256.js";
import { parsePullRequestWebhook } from "./github-webhook-schema.js";
import { parseGitlabMergeRequestWebhook } from "./gitlab-merge-request-webhook-schema.js";
import { mapPipelinePayloadToReviewInput, parsePipelinePullRequestReview } from "./pipeline-pull-request-review.js";
import {
  buildBitbucketPullRequestWebUrl,
  buildGitHubPullRequestWebUrl,
  buildGitLabMergeRequestWebUrl,
  buildGitLabMergeRequestWebUrlByProjectId
} from "./scm-webhook-pull-url.js";
import { toLoggableErrorFields } from "../../../../shared/logger/loggable-error.js";

type Logger = {
  info: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
};

type CodeReviewControllerDeps = {
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
  /** Raiz web do GitLab (ex.: https://gitlab.com) derivada de GITLAB_BASE_URL para montar MR URL quando o webhook nao traz object_attributes.url */
  readonly gitlabWebRootUrl: string;
  readonly exposeReviewErrorDetail: boolean;
  readonly logger: Logger;
};

export class CodeReviewController {
  public constructor(private readonly deps: CodeReviewControllerDeps) {}

  /** `POST /reviews/pull-request` — JSON com `provider`; para CI (ver README). */
  public handlePipelinePullRequestReview = async (request: Request, response: Response): Promise<void> => {
    if (!this.isAuthorized(request)) {
      response.status(401).json({ message: "unauthorized" });
      return;
    }

    const payload = this.parseJsonPayload(request, parsePipelinePullRequestReview);
    if (!payload) {
      response.status(400).json({ message: "invalid payload" });
      return;
    }

    const input = mapPipelinePayloadToReviewInput(payload, { gitlabWebRootUrl: this.deps.gitlabWebRootUrl });
    await this.runReview(response, input);
  };

  public handleGitHubWebhook = async (request: Request, response: Response): Promise<void> => {
    if (!this.isAuthorized(request)) {
      response.status(401).json({ message: "unauthorized" });
      return;
    }

    const event = request.header("x-github-event");
    if (event !== "pull_request") {
      response.status(202).json({ ignored: true, reason: "unsupported_event" });
      return;
    }

    if (!this.deps.githubWebhookSecret?.trim()) {
      this.respondWebhookSecretMissing(response, "GITHUB_WEBHOOK_SECRET");
      return;
    }

    const signature = request.header("x-hub-signature-256");
    const payloadBuffer = this.extractRawPayload(request);

    if (!isValidGitHubWebhookSignature({ signature, payload: payloadBuffer, secret: this.deps.githubWebhookSecret })) {
      response.status(401).json({ message: "invalid webhook signature" });
      return;
    }

    const payload = this.parseJsonPayload(request, parsePullRequestWebhook);
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

    await this.runReview(response, {
      pullRequestRef: {
        provider: "github",
        repositoryFullName: payload.repository.full_name,
        pullRequestNumber
      },
      repositoryLabel: payload.repository.full_name,
      pullRequestNumber,
      pullRequestUrl
    });
  };

  public handleGitLabWebhook = async (request: Request, response: Response): Promise<void> => {
    if (!this.isAuthorized(request)) {
      response.status(401).json({ message: "unauthorized" });
      return;
    }

    if (request.header("x-gitlab-event") !== "Merge Request Hook") {
      response.status(202).json({ ignored: true, reason: "unsupported_event" });
      return;
    }

    if (!this.deps.gitlabWebhookSecret?.trim()) {
      this.respondWebhookSecretMissing(response, "GITLAB_WEBHOOK_SECRET");
      return;
    }

    const gitlabToken = request.header("x-gitlab-token");
    if (gitlabToken !== this.deps.gitlabWebhookSecret) {
      response.status(401).json({ message: "invalid gitlab webhook token" });
      return;
    }

    const payload = this.parseJsonPayload(request, parseGitlabMergeRequestWebhook);
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
        pullRequestUrl = buildGitLabMergeRequestWebUrl(this.deps.gitlabWebRootUrl, pathWithNamespace, iid);
      }

      if (!pullRequestUrl) {
        pullRequestUrl = buildGitLabMergeRequestWebUrlByProjectId(this.deps.gitlabWebRootUrl, projectId, iid);
      }
    }

    await this.runReview(response, {
      pullRequestRef: {
        provider: "gitlab",
        projectId,
        mergeRequestIid: iid
      },
      repositoryLabel,
      pullRequestNumber: iid,
      pullRequestUrl
    });
  };

  public handleBitbucketWebhook = async (request: Request, response: Response): Promise<void> => {
    if (!this.isAuthorized(request)) {
      response.status(401).json({ message: "unauthorized" });
      return;
    }

    const eventKey = request.header("x-event-key");
    if (eventKey !== "pullrequest:created") {
      response.status(202).json({ ignored: true, reason: "unsupported_event" });
      return;
    }

    if (!this.deps.bitbucketWebhookSecret?.trim()) {
      this.respondWebhookSecretMissing(response, "BITBUCKET_WEBHOOK_SECRET");
      return;
    }

    const payloadBuffer = this.extractRawPayload(request);
    if (
      !isValidBitbucketWebhookSignature({
        signature256: request.header("x-hub-signature-256"),
        signature: request.header("x-hub-signature"),
        payload: payloadBuffer,
        secret: this.deps.bitbucketWebhookSecret
      })
    ) {
      response.status(401).json({ message: "invalid webhook signature" });
      return;
    }

    const payload = this.parseJsonPayload(request, parseBitbucketPullRequestWebhook);
    if (!payload) {
      response.status(400).json({ message: "invalid payload" });
      return;
    }

    const { workspace, repoSlug } = splitBitbucketFullName(payload.repository.full_name);
    const pullRequestId = payload.pullrequest.id;
    const pullRequestUrl =
      payload.pullrequest.links?.html?.href?.trim() ||
      buildBitbucketPullRequestWebUrl(payload.repository.full_name, pullRequestId);

    await this.runReview(response, {
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
  };

  public handleAzureDevOpsWebhook = async (request: Request, response: Response): Promise<void> => {
    if (!this.isAuthorized(request)) {
      response.status(401).json({ message: "unauthorized" });
      return;
    }

    if (!this.deps.azureDevOpsWebhookSecret?.trim()) {
      this.respondWebhookSecretMissing(response, "AZURE_DEVOPS_WEBHOOK_SECRET");
      return;
    }

    const azureToken = request.header("x-azure-webhook-token");
    if (azureToken !== this.deps.azureDevOpsWebhookSecret) {
      response.status(401).json({ message: "invalid azure devops webhook token" });
      return;
    }

    const payload = this.parseJsonPayload(request, parseAzureDevOpsPullRequestWebhook);
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

    const organization = (parsedRepo?.organization ?? this.deps.azureDevOpsOrganizationFallback)?.trim();
    const project = (parsedRepo?.project ?? this.deps.azureDevOpsProjectFallback)?.trim();

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

    await this.runReview(response, {
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
  };

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
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not configured")) {
        response.status(503).json({ message });
        return;
      }

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
    if (!this.deps.reviewServiceToken) {
      return true;
    }

    const authorization = request.header("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return false;
    }

    return authorization.slice("Bearer ".length) === this.deps.reviewServiceToken;
  }
}
