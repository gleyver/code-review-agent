import type { PullRequestReviewCommentPort } from "../../domain/ports/pull-request-review-comment-port.js";
import type { PullRequestRef } from "../../domain/value-objects/pull-request-ref.js";
import type { ReviewInlineFinding } from "../../domain/value-objects/review-inline-finding.js";
import { formatScmInlineCommentBody } from "../format-scm-inline-comment-body.js";

type GithubRef = Extract<PullRequestRef, { provider: "github" }>;

export class GitHubPullRequestReviewCommentAdapter implements PullRequestReviewCommentPort {
  public constructor(private readonly githubToken: string) {}

  public async postReviewSummary(input: {
    readonly pullRequestRef: PullRequestRef;
    readonly bodyMarkdown: string;
    readonly headSha: string;
  }): Promise<void> {
    if (input.pullRequestRef.provider !== "github") {
      throw new Error("GitHubPullRequestReviewCommentAdapter: provider mismatch");
    }

    if (!this.githubToken.trim()) {
      throw new Error("GITHUB_TOKEN is not configured");
    }

    if (!input.headSha.trim()) {
      throw new Error("headSha is required for GitHub PR review comment");
    }

    const ref = input.pullRequestRef;
    const reviewError = await this.tryCreatePullRequestReview(ref, input.headSha, input.bodyMarkdown);

    if (!reviewError) {
      return;
    }

    const isForbidden = reviewError.includes("GitHub PR review comment failed: 403");
    if (!isForbidden) {
      throw new Error(reviewError);
    }

    const issueError = await this.tryCreateIssueComment(ref, input.bodyMarkdown);

    if (!issueError) {
      return;
    }

    throw new Error(
      `${reviewError} | Fallback issue comment: ${issueError} ` +
        "(Ajuste o PAT: fine-grained precisa de Pull requests: Write para review e/ou Issues: Write para comentario na conversa; classic: escopo repo.)"
    );
  }

  public async postInlineFindings(input: {
    readonly pullRequestRef: PullRequestRef;
    readonly headSha: string;
    readonly findings: readonly ReviewInlineFinding[];
  }): Promise<number> {
    if (input.pullRequestRef.provider !== "github") {
      throw new Error("GitHubPullRequestReviewCommentAdapter: provider mismatch");
    }

    if (input.findings.length === 0) {
      return 0;
    }

    if (!this.githubToken.trim()) {
      throw new Error("GITHUB_TOKEN is not configured");
    }

    if (!input.headSha.trim()) {
      throw new Error("headSha is required for GitHub inline PR comments");
    }

    const ref = input.pullRequestRef;
    let posted = 0;
    const errors: string[] = [];

    for (const finding of input.findings) {
      const url = `https://api.github.com/repos/${ref.repositoryFullName}/pulls/${ref.pullRequestNumber}/comments`;
      const response = await fetch(url, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          body: formatScmInlineCommentBody(finding),
          commit_id: input.headSha,
          path: finding.path,
          line: finding.line,
          side: "RIGHT"
        })
      });

      if (response.ok) {
        posted += 1;
        continue;
      }

      const errorBody = await response.text();
      errors.push(`${finding.path}:${finding.line} -> ${response.status} ${errorBody.slice(0, 240)}`);
    }

    if (posted === 0) {
      throw new Error(`GitHub inline comments failed: ${errors.join(" | ")}`);
    }

    return posted;
  }

  private buildHeaders(): HeadersInit {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.githubToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  private async tryCreatePullRequestReview(
    ref: GithubRef,
    headSha: string,
    bodyMarkdown: string
  ): Promise<string | null> {
    const url = `https://api.github.com/repos/${ref.repositoryFullName}/pulls/${ref.pullRequestNumber}/reviews`;

    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        commit_id: headSha,
        body: bodyMarkdown,
        event: "COMMENT"
      })
    });

    if (response.ok) {
      return null;
    }

    const errorBody = await response.text();
    return `GitHub PR review comment failed: ${response.status} ${errorBody.slice(0, 800)}`;
  }

  private async tryCreateIssueComment(ref: GithubRef, bodyMarkdown: string): Promise<string | null> {
    const url = `https://api.github.com/repos/${ref.repositoryFullName}/issues/${ref.pullRequestNumber}/comments`;

    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ body: bodyMarkdown })
    });

    if (response.ok) {
      return null;
    }

    const errorBody = await response.text();
    return `GitHub issue comment failed: ${response.status} ${errorBody.slice(0, 800)}`;
  }
}
