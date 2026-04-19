type PullRequestReviewRequestProps = {
  readonly repositoryLabel: string;
  readonly pullRequestNumber: number;
  readonly pullRequestUrl: string;
};

export class PullRequestReviewRequest {
  private constructor(private readonly props: PullRequestReviewRequestProps) {}

  public static create(props: PullRequestReviewRequestProps): PullRequestReviewRequest {
    if (!props.repositoryLabel.trim()) {
      throw new Error("repositoryLabel is required");
    }

    if (props.pullRequestNumber <= 0) {
      throw new Error("pullRequestNumber must be positive");
    }

    if (!props.pullRequestUrl.trim()) {
      throw new Error("pullRequestUrl is required");
    }

    return new PullRequestReviewRequest(props);
  }

  public get repositoryLabel(): string {
    return this.props.repositoryLabel;
  }

  public get pullRequestNumber(): number {
    return this.props.pullRequestNumber;
  }

  public get pullRequestUrl(): string {
    return this.props.pullRequestUrl;
  }
}
