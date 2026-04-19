import type { AgentReviewPort, AgentReviewResult } from "../../domain/ports/agent-review-port.js";
import type { ReviewAgentType } from "../../domain/value-objects/review-agent-type.js";
import type { PullRequestDiff } from "../../domain/ports/pull-request-diff-port.js";
import type { FoundryAgentInvocationRunner } from "./foundry-agent-invocation.js";
import type { FoundryAgentBinding } from "./foundry-bindings.js";

export class FoundryAgentReviewAdapter implements AgentReviewPort {
  public constructor(
    private readonly foundryRunner: FoundryAgentInvocationRunner,
    private readonly foundryAgents: Record<ReviewAgentType, FoundryAgentBinding>
  ) {}

  public async runReview(input: {
    readonly agent: ReviewAgentType;
    readonly pullRequestDiff: PullRequestDiff;
  }): Promise<AgentReviewResult> {
    const foundryBinding = this.foundryAgents[input.agent];
    return this.foundryRunner.runReviewWithFoundryAgent({
      agent: input.agent,
      pullRequestDiff: input.pullRequestDiff,
      agentName: foundryBinding.name,
      agentVersion: foundryBinding.version
    });
  }
}
