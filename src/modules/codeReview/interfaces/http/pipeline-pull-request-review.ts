import type { RunPullRequestReviewInput } from "../../application/use-cases/run-pull-request-review-use-case.js";
import { splitBitbucketFullName } from "./bitbucket-full-name.js";
import { buildAzureDevOpsPullRequestWebUrlFromParts } from "./azure-devops-repo-url.js";
import {
  buildBitbucketPullRequestWebUrl,
  buildGitHubPullRequestWebUrl,
  buildGitLabMergeRequestWebUrl,
  buildGitLabMergeRequestWebUrlByProjectId
} from "./scm-webhook-pull-url.js";
import { z } from "zod";

const pipelineGithubSchema = z.object({
  provider: z.literal("github"),
  repositoryFullName: z.string().min(1),
  pullRequestNumber: z.number().int().positive(),
  pullRequestUrl: z.string().url().optional()
});

const pipelineGitlabSchema = z.object({
  provider: z.literal("gitlab"),
  projectId: z.union([z.string().min(1), z.number().int().positive()]),
  mergeRequestIid: z.number().int().positive(),
  pathWithNamespace: z.string().min(1).optional(),
  pullRequestUrl: z.string().url().optional()
});

const pipelineBitbucketSchema = z.object({
  provider: z.literal("bitbucket"),
  repositoryFullName: z.string().min(1),
  pullRequestId: z.number().int().positive(),
  pullRequestUrl: z.string().url().optional()
});

const pipelineAzureSchema = z.object({
  provider: z.literal("azure_devops"),
  organization: z.string().min(1),
  project: z.string().min(1),
  repositoryId: z.string().min(1),
  pullRequestId: z.number().int().positive(),
  pullRequestUrl: z.string().url().optional()
});

const pipelinePullRequestReviewSchema = z.discriminatedUnion("provider", [
  pipelineGithubSchema,
  pipelineGitlabSchema,
  pipelineBitbucketSchema,
  pipelineAzureSchema
]);

export type PipelinePullRequestReview = z.infer<typeof pipelinePullRequestReviewSchema>;

export function parsePipelinePullRequestReview(payload: unknown): PipelinePullRequestReview {
  return pipelinePullRequestReviewSchema.parse(payload);
}

type MapDeps = {
  readonly gitlabWebRootUrl: string;
};

export function mapPipelinePayloadToReviewInput(
  payload: PipelinePullRequestReview,
  deps: MapDeps
): RunPullRequestReviewInput {
  if (payload.provider === "github") {
    return mapGithubPipeline(payload, deps);
  }

  if (payload.provider === "gitlab") {
    return mapGitlabPipeline(payload, deps);
  }

  if (payload.provider === "bitbucket") {
    return mapBitbucketPipeline(payload);
  }

  return mapAzurePipeline(payload);
}

function mapGithubPipeline(
  payload: z.infer<typeof pipelineGithubSchema>,
  _deps: MapDeps
): RunPullRequestReviewInput {
  const pullRequestNumber = payload.pullRequestNumber;
  const pullRequestUrl =
    payload.pullRequestUrl?.trim() || buildGitHubPullRequestWebUrl(payload.repositoryFullName, pullRequestNumber);

  return {
    pullRequestRef: {
      provider: "github",
      repositoryFullName: payload.repositoryFullName,
      pullRequestNumber
    },
    repositoryLabel: payload.repositoryFullName,
    pullRequestNumber,
    pullRequestUrl
  };
}

function mapGitlabPipeline(
  payload: z.infer<typeof pipelineGitlabSchema>,
  deps: MapDeps
): RunPullRequestReviewInput {
  const projectId = String(payload.projectId);
  const iid = payload.mergeRequestIid;
  const pathWithNamespace = payload.pathWithNamespace?.trim();

  let pullRequestUrl = payload.pullRequestUrl?.trim() ?? "";

  if (!pullRequestUrl && pathWithNamespace) {
    pullRequestUrl = buildGitLabMergeRequestWebUrl(deps.gitlabWebRootUrl, pathWithNamespace, iid);
  }

  if (!pullRequestUrl) {
    pullRequestUrl = buildGitLabMergeRequestWebUrlByProjectId(deps.gitlabWebRootUrl, projectId, iid);
  }

  const repositoryLabel = pathWithNamespace || projectId;

  return {
    pullRequestRef: {
      provider: "gitlab",
      projectId,
      mergeRequestIid: iid
    },
    repositoryLabel,
    pullRequestNumber: iid,
    pullRequestUrl
  };
}

function mapBitbucketPipeline(payload: z.infer<typeof pipelineBitbucketSchema>): RunPullRequestReviewInput {
  const { workspace, repoSlug } = splitBitbucketFullName(payload.repositoryFullName);
  const pullRequestId = payload.pullRequestId;
  const pullRequestUrl =
    payload.pullRequestUrl?.trim() || buildBitbucketPullRequestWebUrl(payload.repositoryFullName, pullRequestId);

  return {
    pullRequestRef: {
      provider: "bitbucket",
      workspace,
      repoSlug,
      pullRequestId
    },
    repositoryLabel: payload.repositoryFullName,
    pullRequestNumber: pullRequestId,
    pullRequestUrl
  };
}

function mapAzurePipeline(payload: z.infer<typeof pipelineAzureSchema>): RunPullRequestReviewInput {
  const organization = payload.organization.trim();
  const project = payload.project.trim();
  const repositoryId = payload.repositoryId.trim();
  const pullRequestId = payload.pullRequestId;

  const pullRequestUrl =
    payload.pullRequestUrl?.trim() ||
    buildAzureDevOpsPullRequestWebUrlFromParts(organization, project, repositoryId, pullRequestId);

  return {
    pullRequestRef: {
      provider: "azure_devops",
      organization,
      project,
      repositoryId,
      pullRequestId
    },
    repositoryLabel: `${organization}/${project}`,
    pullRequestNumber: pullRequestId,
    pullRequestUrl
  };
}
