import type { PullRequestRef } from "../value-objects/pull-request-ref.js";
import type { ReviewInlineFinding } from "../value-objects/review-inline-finding.js";

export interface PullRequestReviewCommentPort {
  postReviewSummary(input: {
    readonly pullRequestRef: PullRequestRef;
    readonly bodyMarkdown: string;
    /** SHA do commit no topo da branch do PR (obrigatorio no GitHub para review COMMENT). */
    readonly headSha: string;
  }): Promise<void>;

  /** Comentarios ancorados em arquivo/linha (lado novo do diff). Retorna quantos foram criados. */
  postInlineFindings(input: {
    readonly pullRequestRef: PullRequestRef;
    readonly headSha: string;
    readonly findings: readonly ReviewInlineFinding[];
  }): Promise<number>;
}
