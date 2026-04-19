import type { AgentReviewResult } from "../../domain/ports/agent-review-port.js";
import type { ReviewInlineFinding } from "../../domain/value-objects/review-inline-finding.js";

const MAX_INLINE_COMMENTS = 35;

export function collectInlineFindingsForPost(reviews: readonly AgentReviewResult[]): ReviewInlineFinding[] {
  const merged = new Map<string, ReviewInlineFinding>();

  for (const review of reviews) {
    for (const finding of review.inlineFindings) {
      const key = `${finding.path}:${finding.line}`;
      const existing = merged.get(key);

      if (!existing) {
        merged.set(key, finding);
        continue;
      }

      merged.set(key, {
        ...existing,
        message: `${existing.message}\n\n---\n\n**${finding.agent}:** ${finding.message}`
      });
    }
  }

  return [...merged.values()].slice(0, MAX_INLINE_COMMENTS);
}
