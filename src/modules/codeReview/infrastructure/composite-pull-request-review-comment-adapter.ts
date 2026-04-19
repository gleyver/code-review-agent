import type { PullRequestReviewCommentPort } from "../domain/ports/pull-request-review-comment-port.js";
import type { PullRequestRef } from "../domain/value-objects/pull-request-ref.js";
import type { ReviewInlineFinding } from "../domain/value-objects/review-inline-finding.js";
import { AzureDevOpsPullRequestReviewCommentAdapter } from "./azure-devops/azure-devops-pull-request-review-comment-adapter.js";
import { BitbucketPullRequestReviewCommentAdapter } from "./bitbucket/bitbucket-pull-request-review-comment-adapter.js";
import { GitHubPullRequestReviewCommentAdapter } from "./github/github-pull-request-review-comment-adapter.js";
import { GitLabMergeRequestReviewCommentAdapter } from "./gitlab/gitlab-merge-request-review-comment-adapter.js";

export class CompositePullRequestReviewCommentAdapter implements PullRequestReviewCommentPort {
  public constructor(
    private readonly github: GitHubPullRequestReviewCommentAdapter,
    private readonly gitlab: GitLabMergeRequestReviewCommentAdapter,
    private readonly bitbucket: BitbucketPullRequestReviewCommentAdapter,
    private readonly azureDevOps: AzureDevOpsPullRequestReviewCommentAdapter
  ) {}

  public async postReviewSummary(input: {
    readonly pullRequestRef: PullRequestRef;
    readonly bodyMarkdown: string;
    readonly headSha: string;
  }): Promise<void> {
    if (input.pullRequestRef.provider === "github") {
      await this.github.postReviewSummary(input);
      return;
    }

    if (input.pullRequestRef.provider === "gitlab") {
      await this.gitlab.postReviewSummary(input);
      return;
    }

    if (input.pullRequestRef.provider === "bitbucket") {
      await this.bitbucket.postReviewSummary(input);
      return;
    }

    await this.azureDevOps.postReviewSummary(input);
  }

  public async postInlineFindings(input: {
    readonly pullRequestRef: PullRequestRef;
    readonly headSha: string;
    readonly findings: readonly ReviewInlineFinding[];
  }): Promise<number> {
    if (input.pullRequestRef.provider === "github") {
      return this.github.postInlineFindings(input);
    }

    if (input.pullRequestRef.provider === "gitlab") {
      return this.gitlab.postInlineFindings(input);
    }

    if (input.pullRequestRef.provider === "bitbucket") {
      return this.bitbucket.postInlineFindings(input);
    }

    return this.azureDevOps.postInlineFindings(input);
  }
}
