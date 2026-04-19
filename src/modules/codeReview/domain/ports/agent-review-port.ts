import type { PullRequestDiff } from "./pull-request-diff-port.js";
import type { ReviewAgentType } from "../value-objects/review-agent-type.js";
import type { ReviewInlineFinding } from "../value-objects/review-inline-finding.js";

export type AgentReviewResult = {
  readonly agent: ReviewAgentType;
  readonly summary: string;
  readonly findings: string[];
  readonly inlineFindings: ReviewInlineFinding[];
};

export interface AgentReviewPort {
  runReview(input: {
    readonly agent: ReviewAgentType;
    readonly pullRequestDiff: PullRequestDiff;
  }): Promise<AgentReviewResult>;
}
