import type { PullRequestDiff } from "../../domain/ports/pull-request-diff-port.js";
import type { ReviewAgentType } from "../../domain/value-objects/review-agent-type.js";
import type { ReviewInlineFinding } from "../../domain/value-objects/review-inline-finding.js";

export type ParsedInlineFindingInput = {
  readonly path: string;
  readonly line: number;
  readonly message: string;
  readonly title?: string;
  readonly severity?: string;
};

export function buildDiffUserPrompt(diff: PullRequestDiff): string {
  return [
    `SCM: ${diff.provider}`,
    `Repository: ${diff.repositoryLabel}`,
    `PR: #${diff.pullRequestNumber}`,
    `Head SHA: ${diff.headSha}`,
    `URL: ${diff.pullRequestUrl}`,
    "",
    "Unified diff:",
    diff.unifiedDiff.slice(0, 120_000)
  ].join("\n");
}

export function normalizeDiffPath(path: string): string {
  let normalized = path.trim().replace(/\\/g, "/");

  if (normalized.startsWith("a/") || normalized.startsWith("b/")) {
    normalized = normalized.slice(2);
  }

  if (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

function readInlineFindingItems(payload: Record<string, unknown>): unknown {
  const snake = payload.inline_findings;
  if (Array.isArray(snake)) {
    return snake;
  }

  const camel = payload.inlineFindings;
  if (Array.isArray(camel)) {
    return camel;
  }

  return [];
}

function parseInlineFindingItems(raw: unknown): ParsedInlineFindingInput[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const results: ParsedInlineFindingInput[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const path = normalizeDiffPath(String(record.path ?? ""));
    const line = Number(record.line);
    const message = String(record.message ?? "").trim();
    const titleRaw = record.title !== undefined ? String(record.title).trim() : "";
    const severityRaw = record.severity !== undefined ? String(record.severity).trim() : "";

    if (!path) {
      continue;
    }

    if (!Number.isInteger(line) || line < 1 || line > 500_000) {
      continue;
    }

    if (!message) {
      continue;
    }

    results.push({
      path,
      line,
      message,
      ...(titleRaw ? { title: titleRaw } : {}),
      ...(severityRaw ? { severity: severityRaw } : {})
    });
  }

  return results;
}

export function buildInlineFindingsForAgent(
  agent: ReviewAgentType,
  items: readonly ParsedInlineFindingInput[]
): ReviewInlineFinding[] {
  return items.map((item) => buildOneInlineFinding(agent, item));
}

function buildOneInlineFinding(agent: ReviewAgentType, item: ParsedInlineFindingInput): ReviewInlineFinding {
  const headerParts: string[] = [];

  if (item.severity) {
    headerParts.push(`**${item.severity}**`);
  }

  if (item.title) {
    headerParts.push(`**${item.title}**`);
  }

  const header = headerParts.join(" ");
  const body = header ? `${header}\n\n${item.message}` : item.message;

  return {
    agent,
    path: item.path,
    line: item.line,
    message: body,
    ...(item.title ? { title: item.title } : {}),
    ...(item.severity ? { severity: item.severity } : {})
  };
}

function extractJsonObject(text: string): string {
  let trimmed = text.trim();

  if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, "");
    const fenceEnd = trimmed.lastIndexOf("```");

    if (fenceEnd !== -1) {
      trimmed = trimmed.slice(0, fenceEnd).trim();
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return trimmed;
  }

  return trimmed.slice(start, end + 1);
}

export function parseAgentOutput(output: string): {
  summary: string;
  findings: string[];
  inlineFindingInputs: ParsedInlineFindingInput[];
} {
  try {
    const json = JSON.parse(extractJsonObject(output)) as Record<string, unknown>;
    const summary = String(json.summary ?? "").trim();
    const findings = Array.isArray(json.findings) ? json.findings.map((f) => String(f)).filter(Boolean) : [];
    const inlineFindingInputs = parseInlineFindingItems(readInlineFindingItems(json));

    if (!summary) {
      return {
        summary: "Sem resumo estruturado retornado pelo agente.",
        findings,
        inlineFindingInputs
      };
    }

    return { summary, findings, inlineFindingInputs };
  } catch {
    const fallbackFindings = output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.replace(/^- /, ""));

    return {
      summary: output.slice(0, 300).trim() || "Falha ao parsear resposta do agente.",
      findings: fallbackFindings,
      inlineFindingInputs: []
    };
  }
}
