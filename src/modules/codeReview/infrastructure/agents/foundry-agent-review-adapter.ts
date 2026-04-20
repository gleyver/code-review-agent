import type { AgentReviewPort, AgentReviewResult } from "../../domain/ports/agent-review-port.js";
import type { ReviewAgentType } from "../../domain/value-objects/review-agent-type.js";
import type { PullRequestDiff } from "../../domain/ports/pull-request-diff-port.js";
import type { FoundryAgentInvocationRunner } from "./foundry-agent-invocation.js";
import type { FoundryAgentBinding } from "./foundry-bindings.js";

export class FoundryAgentReviewAdapter implements AgentReviewPort {
  public constructor(
    private readonly foundryRunner: FoundryAgentInvocationRunner,
    private readonly foundryAgents: ReadonlyMap<string, FoundryAgentBinding>,
    private readonly agentOrder: readonly string[]
  ) {}

  public async runReview(input: {
    readonly agent: ReviewAgentType;
    readonly pullRequestDiff: PullRequestDiff;
  }): Promise<AgentReviewResult> {
    const binding = this.foundryAgents.get(input.agent);
    if (!binding) {
      throw new Error(
        `Agente "${input.agent}" nao existe na configuracao Foundry. IDs configurados: ${this.agentOrder.join(", ")}`
      );
    }

    return this.foundryRunner.runReviewWithFoundryAgent({
      agent: input.agent,
      pullRequestDiff: input.pullRequestDiff,
      agentName: binding.name,
      agentVersion: binding.version
    });
  }
}
