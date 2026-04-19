type PullRequestReviewRequestProps = {
  readonly repositoryLabel: string;
  readonly pullRequestNumber: number;
  readonly pullRequestUrl: string;
};

/** Invariantes do pedido de review antes de aceder ao SCM ou aos agentes. */
export class PullRequestReviewRequest {
  private constructor() {}

  public static assertValid(props: PullRequestReviewRequestProps): void {
    if (!props.repositoryLabel.trim()) {
      throw new Error("repositoryLabel is required");
    }

    if (props.pullRequestNumber <= 0) {
      throw new Error("pullRequestNumber must be positive");
    }

    if (!props.pullRequestUrl.trim()) {
      throw new Error("pullRequestUrl is required");
    }
  }
}
