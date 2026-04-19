import type { PullRequestDiff } from "../../domain/ports/pull-request-diff-port.js";
import { ServiceNotConfiguredError } from "../../domain/errors/service-not-configured-error.js";
import type { PullRequestRef } from "../../domain/value-objects/pull-request-ref.js";

type GitHubPullRequestResponse = {
  readonly head: {
    readonly sha: string;
  };
  readonly html_url: string;
};

export class GitHubPullRequestDiffAdapter {
  public constructor(private readonly githubToken: string) {}

  public async getDiffForGithub(ref: Extract<PullRequestRef, { provider: "github" }>): Promise<PullRequestDiff> {
    if (!this.githubToken.trim()) {
      throw new ServiceNotConfiguredError("GITHUB_TOKEN is not configured");
    }

    const [metadataResponse, diffResponse] = await Promise.all([
      fetch(`https://api.github.com/repos/${ref.repositoryFullName}/pulls/${ref.pullRequestNumber}`, {
        headers: this.buildHeaders("application/vnd.github+json")
      }),
      fetch(`https://api.github.com/repos/${ref.repositoryFullName}/pulls/${ref.pullRequestNumber}`, {
        headers: this.buildHeaders("application/vnd.github.v3.diff")
      })
    ]);

    if (!metadataResponse.ok) {
      throw new Error(`GitHub PR metadata request failed: ${metadataResponse.status}`);
    }

    if (!diffResponse.ok) {
      throw new Error(`GitHub PR diff request failed: ${diffResponse.status}`);
    }

    const metadata = (await metadataResponse.json()) as GitHubPullRequestResponse;
    const unifiedDiff = await diffResponse.text();

    return {
      provider: "github",
      repositoryLabel: ref.repositoryFullName,
      pullRequestNumber: ref.pullRequestNumber,
      headSha: metadata.head.sha,
      pullRequestUrl: metadata.html_url,
      unifiedDiff
    };
  }

  private buildHeaders(accept: string): HeadersInit {
    return {
      Accept: accept,
      Authorization: `Bearer ${this.githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }
}
