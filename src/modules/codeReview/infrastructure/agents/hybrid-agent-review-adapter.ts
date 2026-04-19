import type { AgentReviewPort, AgentReviewResult } from "../../domain/ports/agent-review-port.js";
import type { ReviewAgentType } from "../../domain/value-objects/review-agent-type.js";
import type { PullRequestDiff } from "../../domain/ports/pull-request-diff-port.js";
import type { FoundryAgentInvocationRunner } from "./foundry-agent-invocation.js";
import type { OpenAIAgentReviewAdapter } from "./openai-agent-review-adapter.js";

export type FoundryAgentBinding = {
  readonly name: string;
  readonly version: string;
};

export class HybridAgentReviewAdapter implements AgentReviewPort {
  public constructor(
    private readonly openAiAdapter: OpenAIAgentReviewAdapter,
    private readonly foundryRunner: FoundryAgentInvocationRunner | null,
    private readonly foundryAgents: Partial<Record<ReviewAgentType, FoundryAgentBinding>>
  ) {}

  public async runReview(input: {
    readonly agent: ReviewAgentType;
    readonly pullRequestDiff: PullRequestDiff;
  }): Promise<AgentReviewResult> {
    const binding = this.foundryAgents[input.agent];

    if (this.foundryRunner && binding) {
      return this.foundryRunner.runReviewWithFoundryAgent({
        agent: input.agent,
        pullRequestDiff: input.pullRequestDiff,
        agentName: binding.name,
        agentVersion: binding.version
      });
    }

    return this.openAiAdapter.runReview(input);
  }
}
