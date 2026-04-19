import { describe, expect, it } from "vitest";
import { PullRequestReviewRequest } from "./pull-request-review-request.js";

describe("PullRequestReviewRequest.assertValid", () => {
  it("does not throw for valid props", () => {
    expect(() =>
      PullRequestReviewRequest.assertValid({
        repositoryLabel: "org/repo",
        pullRequestNumber: 1,
        pullRequestUrl: "https://example.com/pr/1"
      })
    ).not.toThrow();
  });

  it("throws when repositoryLabel is blank", () => {
    expect(() =>
      PullRequestReviewRequest.assertValid({
        repositoryLabel: "   ",
        pullRequestNumber: 1,
        pullRequestUrl: "https://x"
      })
    ).toThrow("repositoryLabel");
  });

  it("throws when pullRequestNumber is not positive", () => {
    expect(() =>
      PullRequestReviewRequest.assertValid({
        repositoryLabel: "a",
        pullRequestNumber: 0,
        pullRequestUrl: "https://x"
      })
    ).toThrow("positive");
  });
});
