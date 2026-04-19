import type { AgentReviewPort, AgentReviewResult } from "../../domain/ports/agent-review-port.js";
import type { ReviewAgentType } from "../../domain/value-objects/review-agent-type.js";
import type { PullRequestDiff } from "../../domain/ports/pull-request-diff-port.js";
import { buildDiffUserPrompt, buildInlineFindingsForAgent, parseAgentOutput } from "./agent-review-shared.js";

type OpenAIResponse = {
  readonly output_text?: string;
};

const JSON_OUTPUT_INSTRUCTION =
  'Responda APENAS com JSON valido (sem markdown, sem blocos de codigo). Formato: {"summary":"string","findings":["string"],"inline_findings":[{"path":"string","line":number,"message":"string","title":"string opcional","severity":"string opcional"}]}. ' +
  "summary: 2 a 4 frases em portugues, sintetizando o risco geral deste PR neste tema. " +
  "findings: lista ordenada do mais critico ao menos critico; cada item uma frase objetiva (pode repetir ideias dos inline_findings em formato curto). " +
  "inline_findings: achados com ancora no codigo NOVO (lado direito do diff). Cada item: path relativo ao repo (ex: src/app.ts, sem prefixos a/ ou b/), line = numero da linha no arquivo apos o PR (conteudo adicionado ou modificado visivel no diff), message = texto curto em markdown para o comentario na linha, title e severity opcionais. " +
  "Inclua apenas linhas que existam claramente no unified diff; se nao houver ancora segura, use inline_findings: []. Maximo 12 itens.";

const PROMPT_AGENT_PERFORMANCE = [
  "Agente 1 — Especialista em performance e escalabilidade (backend e integracoes).",
  "",
  "Objetivo: identificar mudancas que possam degradar latencia, throughput, uso de CPU/memoria ou custo operacional sob carga.",
  "",
  "Analise o diff priorizando:",
  "- Complexidade algoritmica e loops aninhados em caminhos quentes; operacoes repetidas que poderiam ser bateladas ou cacheadas.",
  "- Padroes N+1 em acesso a dados, queries dentro de loops, falta de paginacao ou limites em listagens.",
  "- I/O bloqueante na thread principal (Node: operacoes sync pesadas, CPU-bound sem offload); ausencia de timeout, retry sem backoff ou tempestade de chamadas.",
  "- Memoria: buffers grandes, acumulo de arrays/strings, vazamentos provaveis (listeners, timers, caches sem TTL/eviction).",
  "- Rede: payloads grandes sem compressao/streaming, serializacao redundante, ausencia de connection pooling onde aplicavel.",
  "",
  "Evite: nitpicks de estilo; alertas genericos sem ligacao ao diff; suposicoes sobre codigo nao mostrado. Se o diff for pequeno ou so de configuracao, diga isso no summary e reduza findings.",
  "",
  JSON_OUTPUT_INSTRUCTION
].join("\n");

const PROMPT_AGENT_SECURITY = [
  "Agente 2 — Especialista em seguranca de aplicacoes (AppSec) para este stack.",
  "",
  "Objetivo: encontrar vulnerabilidades introduzidas ou agravadas por este PR, e falhas de endurecimento (hardening).",
  "",
  "Analise o diff priorizando:",
  "- Injecao (SQL, NoSQL, comando OS, LDAP, template) e construcao dinamica de queries/comandos com dados externos.",
  "- Autenticacao e autorizacao: bypass de checagens, confianca apenas em parametros do cliente, escopo de token/sessao, IDOR/BOLA.",
  "- Exposicao de dados sensiveis: logs com PII/secrets, erros verbosos, stack traces ao cliente, headers inseguros.",
  "- Secrets e credenciais hardcoded; uso inseguro de crypto (algoritmos fracos, IV fixo, comparacao nao constant-time quando relevante).",
  "- Validacao e sanitizacao de entrada na borda; path traversal; upload de arquivos sem restricao; SSRF em chamadas HTTP internas.",
  "- Dependencias: se o diff alterar versoes ou scripts, cite riscos conhecidos apenas se houver base razoavel no contexto.",
  "",
  "Evite: alarmismo sem evidencia no diff; checklist infinito; exigir ferramentas que o revisor nao tem. Indique severidade e o que validar em testes ou auditoria.",
  "",
  JSON_OUTPUT_INSTRUCTION
].join("\n");

const PROMPT_AGENT_ARCHITECTURE = [
  "Agente 3 — Especialista em arquitetura de software (hexagonal, DDD, SOLID, modularizacao).",
  "",
  "Objetivo: avaliar se o PR mantem fronteiras claras, coesao e baixo acoplamento, e se as decisoes de design escalam.",
  "",
  "Analise o diff priorizando:",
  "- Violacoes de camadas: dominio acoplado a HTTP/ORM/SDK; regras de negocio em controllers/adapters; dependencias invertidas incorretas.",
  "- DDD: agregados e invariantes; consistencia; servicos anemicos vs entidades ricas quando o diff tocar modelo de dominio.",
  "- SOLID: responsabilidades unicas, extensao sem quebrar contratos, interfaces estaveis; cheiros de God class ou feature envy.",
  "- Testabilidade: codigo dificil de testar por acoplamento estatico ou new direto de infra em dominio.",
  "- Consistencia de API/contratos e duplicacao desnecessaria de logica entre modulos.",
  "",
  "Evite: debate religioso de pastas sem impacto; refatoracoes fora do escopo do diff. Sugira mover responsabilidade ou extrair porta quando fizer sentido.",
  "",
  JSON_OUTPUT_INSTRUCTION
].join("\n");

const AGENT_INSTRUCTIONS: Record<ReviewAgentType, string> = {
  performance: PROMPT_AGENT_PERFORMANCE,
  security: PROMPT_AGENT_SECURITY,
  architecture: PROMPT_AGENT_ARCHITECTURE
};

export class OpenAIAgentReviewAdapter implements AgentReviewPort {
  public constructor(
    private readonly openAiApiKey: string,
    private readonly model: string
  ) {}

  public async runReview(input: {
    readonly agent: ReviewAgentType;
    readonly pullRequestDiff: PullRequestDiff;
  }): Promise<AgentReviewResult> {
    if (!this.openAiApiKey.trim()) {
      throw new Error(
        "OPENAI_API_KEY is not configured. Configure a chave ou defina o agente correspondente no Microsoft Foundry (AZURE_AI_PROJECT_ENDPOINT e FOUNDRY_AGENT_*)."
      );
    }

    const body = {
      model: this.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: AGENT_INSTRUCTIONS[input.agent]
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildDiffUserPrompt(input.pullRequestDiff)
            }
          ]
        }
      ]
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.openAiApiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`OpenAI review request failed (${input.agent}): ${response.status}`);
    }

    const parsed = (await response.json()) as OpenAIResponse;
    const text = parsed.output_text ?? "";
    const payload = parseAgentOutput(text);

    return {
      agent: input.agent,
      summary: payload.summary,
      findings: payload.findings,
      inlineFindings: buildInlineFindingsForAgent(input.agent, payload.inlineFindingInputs)
    };
  }
}
