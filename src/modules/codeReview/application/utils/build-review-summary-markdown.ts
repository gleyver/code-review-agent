import type { RunPullRequestReviewOutput } from "../use-cases/run-pull-request-review-use-case.js";

const MAX_MARKDOWN_LENGTH = 60_000;

export function buildReviewSummaryMarkdown(output: RunPullRequestReviewOutput): string {
  const inlineSuggested = output.reviews.reduce((total, review) => total + review.inlineFindings.length, 0);
  const lines: string[] = [
    "## Code review automatizado",
    "",
    `_SCM: ${output.provider} | PR #${output.pullRequestNumber}_`,
    ""
  ];

  if (inlineSuggested > 0) {
    lines.push(`_Comentarios inline sugeridos pela IA: ${inlineSuggested} (tambem publicados no diff quando o SCM permitir)._`);
    lines.push("");
  }

  for (const review of output.reviews) {
    lines.push(`### ${review.agent}`);
    lines.push("");
    lines.push(review.summary);
    lines.push("");

    if (review.findings.length > 0) {
      lines.push("**Achados:**");

      for (const finding of review.findings) {
        lines.push(`- ${finding}`);
      }

      lines.push("");
    }
  }

  const text = lines.join("\n");

  if (text.length <= MAX_MARKDOWN_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_MARKDOWN_LENGTH)}\n\n_(conteudo truncado por limite da API)_`;
}
