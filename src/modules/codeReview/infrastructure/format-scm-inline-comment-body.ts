import type { ReviewInlineFinding } from "../domain/value-objects/review-inline-finding.js";

export function formatScmInlineCommentBody(finding: ReviewInlineFinding): string {
  return `**[${finding.agent}]**\n\n${finding.message}`;
}
