import { describe, expect, it, vi } from "vitest";
import type { AgentReviewPort, AgentReviewResult } from "../../domain/ports/agent-review-port.js";
import type { PullRequestDiff, PullRequestDiffPort } from "../../domain/ports/pull-request-diff-port.js";
import { RunPullRequestReviewUseCase } from "./run-pull-request-review-use-case.js";

const sampleDiff: PullRequestDiff = {
  provider: "github",
  repositoryLabel: "o/r",
  pullRequestNumber: 1,
  headSha: "abc",
  pullRequestUrl: "https://github.com/o/r/pull/1",
  unifiedDiff: "diff --git"
};

function makeAgentPort(results: AgentReviewResult[]): AgentReviewPort {
  let call = 0;
  return {
    runReview: vi.fn(async () => {
      const r = results[call];
      call += 1;
      if (!r) {
        throw new Error("unexpected extra agent call");
      }
      return r;
    })
  };
}

describe("RunPullRequestReviewUseCase", () => {
  it("calls diff port once and agent port three times", async () => {
    const getDiff = vi.fn(async () => sampleDiff);
    const diffPort: PullRequestDiffPort = { getDiff };
    const agentResults: AgentReviewResult[] = [
      { agent: "performance", summary: "s", findings: [], inlineFindings: [] },
      { agent: "security", summary: "s", findings: [], inlineFindings: [] },
      { agent: "architecture", summary: "s", findings: [], inlineFindings: [] }
    ];
    const agentPort = makeAgentPort(agentResults);
    const useCase = new RunPullRequestReviewUseCase(diffPort, agentPort);

    const output = await useCase.execute({
      pullRequestRef: { provider: "github", repositoryFullName: "o/r", pullRequestNumber: 1 },
      repositoryLabel: "o/r",
      pullRequestNumber: 1,
      pullRequestUrl: "https://github.com/o/r/pull/1"
    });

    expect(getDiff).toHaveBeenCalledTimes(1);
    expect(agentPort.runReview).toHaveBeenCalledTimes(3);
    expect(output.headSha).toBe("abc");
    expect(output.reviews).toHaveLength(3);
  });
});
