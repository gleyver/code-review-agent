import type { PullRequestDiff, PullRequestDiffPort } from "../domain/ports/pull-request-diff-port.js";
import type { PullRequestRef } from "../domain/value-objects/pull-request-ref.js";
import { AzureDevOpsPullRequestDiffAdapter } from "./azure-devops/azure-devops-pull-request-diff-adapter.js";
import { BitbucketPullRequestDiffAdapter } from "./bitbucket/bitbucket-pull-request-diff-adapter.js";
import { GitHubPullRequestDiffAdapter } from "./github/github-pull-request-diff-adapter.js";
import { GitLabMergeRequestDiffAdapter } from "./gitlab/gitlab-merge-request-diff-adapter.js";

export class CompositePullRequestDiffAdapter implements PullRequestDiffPort {
  public constructor(
    private readonly github: GitHubPullRequestDiffAdapter,
    private readonly gitlab: GitLabMergeRequestDiffAdapter,
    private readonly bitbucket: BitbucketPullRequestDiffAdapter,
    private readonly azureDevOps: AzureDevOpsPullRequestDiffAdapter
  ) {}

  public async getDiff(ref: PullRequestRef): Promise<PullRequestDiff> {
    if (ref.provider === "github") {
      return this.github.getDiffForGithub(ref);
    }

    if (ref.provider === "gitlab") {
      return this.gitlab.getDiffForGitlab(ref);
    }

    if (ref.provider === "bitbucket") {
      return this.bitbucket.getDiffForBitbucket(ref);
    }

    return this.azureDevOps.getDiffForAzureDevOps(ref);
  }
}
