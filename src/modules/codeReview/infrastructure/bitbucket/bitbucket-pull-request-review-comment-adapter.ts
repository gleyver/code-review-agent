import type { PullRequestReviewCommentPort } from "../../domain/ports/pull-request-review-comment-port.js";
import type { PullRequestRef } from "../../domain/value-objects/pull-request-ref.js";
import type { ReviewInlineFinding } from "../../domain/value-objects/review-inline-finding.js";
import { formatScmInlineCommentBody } from "../format-scm-inline-comment-body.js";

export class BitbucketPullRequestReviewCommentAdapter implements PullRequestReviewCommentPort {
  public constructor(
    private readonly username: string,
    private readonly appPassword: string
  ) {}

  public async postReviewSummary(input: {
    readonly pullRequestRef: PullRequestRef;
    readonly bodyMarkdown: string;
    readonly headSha: string;
  }): Promise<void> {
    if (input.pullRequestRef.provider !== "bitbucket") {
      throw new Error("BitbucketPullRequestReviewCommentAdapter: provider mismatch");
    }

    if (!this.username.trim() || !this.appPassword.trim()) {
      throw new Error("BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD are not configured");
    }

    const ref = input.pullRequestRef;
    const base = `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(ref.workspace)}/${encodeURIComponent(ref.repoSlug)}`;
    const authorization = `Basic ${Buffer.from(`${this.username}:${this.appPassword}`).toString("base64")}`;
    const url = `${base}/pullrequests/${ref.pullRequestId}/comments`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ content: { raw: input.bodyMarkdown } })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Bitbucket PR comment failed: ${response.status} ${errorBody.slice(0, 800)}`);
    }
  }

  public async postInlineFindings(input: {
    readonly pullRequestRef: PullRequestRef;
    readonly headSha: string;
    readonly findings: readonly ReviewInlineFinding[];
  }): Promise<number> {
    if (input.pullRequestRef.provider !== "bitbucket") {
      throw new Error("BitbucketPullRequestReviewCommentAdapter: provider mismatch");
    }

    if (input.findings.length === 0) {
      return 0;
    }

    if (!this.username.trim() || !this.appPassword.trim()) {
      throw new Error("BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD are not configured");
    }

    const ref = input.pullRequestRef;
    const base = `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(ref.workspace)}/${encodeURIComponent(ref.repoSlug)}`;
    const authorization = `Basic ${Buffer.from(`${this.username}:${this.appPassword}`).toString("base64")}`;
    let posted = 0;
    const errors: string[] = [];

    for (const finding of input.findings) {
      const url = `${base}/pullrequests/${ref.pullRequestId}/comments`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: { raw: formatScmInlineCommentBody(finding) },
          inline: {
            path: finding.path,
            to: finding.line
          }
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
      throw new Error(`Bitbucket inline comments failed: ${errors.join(" | ")}`);
    }

    return posted;
  }
}
