import type { AIProjectClient } from "@azure/ai-projects";
import type { ReviewAgentType } from "../../domain/value-objects/review-agent-type.js";
import type { PullRequestDiff } from "../../domain/ports/pull-request-diff-port.js";
import type { AgentReviewResult } from "../../domain/ports/agent-review-port.js";
import { buildDiffUserPrompt, buildInlineFindingsForAgent, parseAgentOutput } from "./agent-review-shared.js";

type FoundryAgentReferenceBody = {
  readonly agent_reference: {
    readonly name: string;
    readonly version: string;
    readonly type: "agent_reference";
  };
};

export class FoundryAgentInvocationRunner {
  public constructor(private readonly projectClient: AIProjectClient) {}

  public async runReviewWithFoundryAgent(input: {
    readonly agent: ReviewAgentType;
    readonly pullRequestDiff: PullRequestDiff;
    readonly agentName: string;
    readonly agentVersion: string;
  }): Promise<AgentReviewResult> {
    const openAIClient = this.projectClient.getOpenAIClient();
    const userContent = buildDiffUserPrompt(input.pullRequestDiff);

    const conversation = await openAIClient.conversations.create({
      items: [
        {
          role: "user",
          content: userContent,
          type: "message"
        }
      ]
    });

    try {
      const foundryBody: FoundryAgentReferenceBody = {
        agent_reference: {
          name: input.agentName,
          version: input.agentVersion,
          type: "agent_reference"
        }
      };

      const response = await openAIClient.responses.create(
        { conversation: conversation.id },
        { body: foundryBody }
      );

      const text = response.output_text ?? "";
      const payload = parseAgentOutput(text);

      return {
        agent: input.agent,
        summary: payload.summary,
        findings: payload.findings,
        inlineFindings: buildInlineFindingsForAgent(input.agent, payload.inlineFindingInputs)
      };
    } finally {
      await openAIClient.conversations.delete(conversation.id).catch(() => undefined);
    }
  }
}
