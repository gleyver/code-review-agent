import type { ReviewAgentType } from "./review-agent-type.js";

export type ReviewInlineFinding = {
  readonly agent: ReviewAgentType;
  readonly path: string;
  readonly line: number;
  readonly message: string;
  readonly title?: string;
  readonly severity?: string;
};
