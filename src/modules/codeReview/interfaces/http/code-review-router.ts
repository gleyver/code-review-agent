import type { TokenCredential } from "@azure/core-auth";
import { DefaultAzureCredential } from "@azure/identity";
import { AIProjectClient } from "@azure/ai-projects";
import { AzureAiProjectApiKeyCredential } from "../../infrastructure/agents/azure-ai-project-api-key-credential.js";
import { Router } from "express";
import { env } from "../../../../shared/config/env.js";
import { logger } from "../../../../shared/logger/logger.js";
import { AzureDevOpsPullRequestDiffAdapter } from "../../infrastructure/azure-devops/azure-devops-pull-request-diff-adapter.js";
import { AzureDevOpsPullRequestReviewCommentAdapter } from "../../infrastructure/azure-devops/azure-devops-pull-request-review-comment-adapter.js";
import { BitbucketPullRequestDiffAdapter } from "../../infrastructure/bitbucket/bitbucket-pull-request-diff-adapter.js";
import { BitbucketPullRequestReviewCommentAdapter } from "../../infrastructure/bitbucket/bitbucket-pull-request-review-comment-adapter.js";
import { CompositePullRequestDiffAdapter } from "../../infrastructure/composite-pull-request-diff-adapter.js";
import { CompositePullRequestReviewCommentAdapter } from "../../infrastructure/composite-pull-request-review-comment-adapter.js";
import { GitHubPullRequestDiffAdapter } from "../../infrastructure/github/github-pull-request-diff-adapter.js";
import { GitHubPullRequestReviewCommentAdapter } from "../../infrastructure/github/github-pull-request-review-comment-adapter.js";
import { GitLabMergeRequestDiffAdapter } from "../../infrastructure/gitlab/gitlab-merge-request-diff-adapter.js";
import { GitLabMergeRequestReviewCommentAdapter } from "../../infrastructure/gitlab/gitlab-merge-request-review-comment-adapter.js";
import { buildFoundryAgentBindingsFromEnv } from "../../infrastructure/agents/foundry-bindings.js";
import { FoundryAgentInvocationRunner } from "../../infrastructure/agents/foundry-agent-invocation.js";
import { FoundryAgentReviewAdapter } from "../../infrastructure/agents/foundry-agent-review-adapter.js";
import { RunPullRequestReviewUseCase } from "../../application/use-cases/run-pull-request-review-use-case.js";
import { CodeReviewController } from "./code-review-controller.js";
import { deriveGitLabWebRootFromApiBase } from "./scm-webhook-pull-url.js";

export function buildCodeReviewRouter(): Router {
  const githubAdapter = new GitHubPullRequestDiffAdapter(env.GITHUB_TOKEN ?? "");
  const gitlabAdapter = new GitLabMergeRequestDiffAdapter(env.GITLAB_TOKEN ?? "", env.GITLAB_BASE_URL);
  const bitbucketAdapter = new BitbucketPullRequestDiffAdapter(env.BITBUCKET_USERNAME ?? "", env.BITBUCKET_APP_PASSWORD ?? "");
  const azureAdapter = new AzureDevOpsPullRequestDiffAdapter(env.AZURE_DEVOPS_PAT ?? "");
  const diffAdapter = new CompositePullRequestDiffAdapter(githubAdapter, gitlabAdapter, bitbucketAdapter, azureAdapter);
  const githubCommentAdapter = new GitHubPullRequestReviewCommentAdapter(env.GITHUB_TOKEN ?? "");
  const gitlabCommentAdapter = new GitLabMergeRequestReviewCommentAdapter(env.GITLAB_TOKEN ?? "", env.GITLAB_BASE_URL);
  const bitbucketCommentAdapter = new BitbucketPullRequestReviewCommentAdapter(env.BITBUCKET_USERNAME ?? "", env.BITBUCKET_APP_PASSWORD ?? "");
  const azureCommentAdapter = new AzureDevOpsPullRequestReviewCommentAdapter(env.AZURE_DEVOPS_PAT ?? "");
  const reviewCommentPort = new CompositePullRequestReviewCommentAdapter(
    githubCommentAdapter,
    gitlabCommentAdapter,
    bitbucketCommentAdapter,
    azureCommentAdapter
  );
  const projectEndpoint = env.AZURE_AI_PROJECT_ENDPOINT.trim();
  const foundryCredential: TokenCredential = env.AZURE_AI_PROJECT_API_KEY?.trim()
    ? new AzureAiProjectApiKeyCredential(env.AZURE_AI_PROJECT_API_KEY.trim())
    : new DefaultAzureCredential();
  const foundryRunner = new FoundryAgentInvocationRunner(new AIProjectClient(projectEndpoint, foundryCredential));
  const agentAdapter = new FoundryAgentReviewAdapter(foundryRunner, buildFoundryAgentBindingsFromEnv(env));
  const useCase = new RunPullRequestReviewUseCase(diffAdapter, agentAdapter);
  const controller = new CodeReviewController({
    useCase,
    reviewCommentPort,
    postReviewPrComment: env.POST_REVIEW_PR_COMMENT,
    reviewServiceToken: env.REVIEW_SERVICE_TOKEN,
    githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET,
    gitlabWebhookSecret: env.GITLAB_WEBHOOK_SECRET,
    azureDevOpsWebhookSecret: env.AZURE_DEVOPS_WEBHOOK_SECRET,
    azureDevOpsOrganizationFallback: env.AZURE_DEVOPS_ORGANIZATION,
    azureDevOpsProjectFallback: env.AZURE_DEVOPS_PROJECT,
    gitlabWebRootUrl: deriveGitLabWebRootFromApiBase(env.GITLAB_BASE_URL),
    exposeReviewErrorDetail: env.EXPOSE_REVIEW_ERROR_DETAIL,
    logger
  });
  const router = Router();

  router.post("/reviews/pull-request", controller.handlePipelinePullRequestReview);
  router.post("/webhooks/github", controller.handleGitHubWebhook);
  router.post("/webhooks/gitlab", controller.handleGitLabWebhook);
  router.post("/webhooks/bitbucket", controller.handleBitbucketWebhook);
  router.post("/webhooks/azure-devops", controller.handleAzureDevOpsWebhook);

  return router;
}
