import { REVIEW_AGENT_TYPES, type ReviewAgentType } from "../../domain/value-objects/review-agent-type.js";
import type { AgentReviewPort, AgentReviewResult } from "../../domain/ports/agent-review-port.js";
import type { PullRequestDiffPort } from "../../domain/ports/pull-request-diff-port.js";
import type { PullRequestRef } from "../../domain/value-objects/pull-request-ref.js";
import { PullRequestReviewRequest } from "../../domain/entities/pull-request-review-request.js";

export type RunPullRequestReviewInput = {
  readonly pullRequestRef: PullRequestRef;
  readonly repositoryLabel: string;
  readonly pullRequestNumber: number;
  readonly pullRequestUrl: string;
};

export type RunPullRequestReviewOutput = {
  readonly provider: PullRequestRef["provider"];
  readonly repositoryLabel: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
  readonly pullRequestUrl: string;
  readonly reviews: AgentReviewResult[];
};

export class RunPullRequestReviewUseCase {
  public constructor(
    private readonly pullRequestDiffPort: PullRequestDiffPort,
    private readonly agentReviewPort: AgentReviewPort
  ) {}

  public async execute(input: RunPullRequestReviewInput): Promise<RunPullRequestReviewOutput> {
    PullRequestReviewRequest.assertValid({
      repositoryLabel: input.repositoryLabel,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestUrl: input.pullRequestUrl
    });

    const pullRequestDiff = await this.pullRequestDiffPort.getDiff(input.pullRequestRef);

    const reviews = await Promise.all(
      REVIEW_AGENT_TYPES.map((agent) => this.executeAgent(agent, pullRequestDiff))
    );

    return {
      provider: input.pullRequestRef.provider,
      repositoryLabel: pullRequestDiff.repositoryLabel,
      pullRequestNumber: pullRequestDiff.pullRequestNumber,
      headSha: pullRequestDiff.headSha,
      pullRequestUrl: pullRequestDiff.pullRequestUrl,
      reviews
    };
  }

  private executeAgent(agent: ReviewAgentType, pullRequestDiff: Parameters<AgentReviewPort["runReview"]>[0]["pullRequestDiff"]) {
    return this.agentReviewPort.runReview({ agent, pullRequestDiff });
  }
}
