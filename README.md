# Code Review Service

Serviço HTTP em **Node.js** (Express) que, ao receber um **webhook** de **Pull Request / Merge Request** de **GitHub**, **GitLab**, **Bitbucket Cloud** ou **Azure DevOps**, ou uma chamada **`POST /reviews/pull-request`** (mesmo contrato para **pipelines** de qualquer provedor), busca o **diff** na API do SCM, executa **três revisões em paralelo** com LLM (performance, segurança, arquitetura) e devolve um JSON agregado. Opcionalmente publica **resumo** e **comentários inline** na PR/MR.

Arquitetura alinhada a **hexagonal + DDD**: domínio sem framework, casos de uso na aplicação, integrações SCM e LLM na infraestrutura, contratos HTTP na camada de interfaces.

---

## Sumário

- [Requisitos](#requisitos)
- [Stack](#stack)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Fluxo de execução](#fluxo-de-execução)
- [Instalação e comandos](#instalação-e-comandos)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [HTTP: rotas e contratos](#http-rotas-e-contratos)
- [Pipelines CI/CD](#pipelines-cicd)
- [Webhooks por provedor](#webhooks-por-provedor)
- [Resposta JSON (sucesso)](#resposta-json-sucesso)
- [Códigos HTTP e erros](#códigos-http-e-erros)
- [Exemplos `curl`](#exemplos-curl)
- [Tokens e permissões nos SCMs](#tokens-e-permissões-nos-scms)
- [LLM: OpenAI e Microsoft Foundry](#llm-openai-e-microsoft-foundry)
- [Configurar webhooks nos provedores](#configurar-webhooks-nos-provedores)

---

## Requisitos

- **Node.js** `>= 20` (conforme `package.json` → `engines`)
- Acesso de rede às APIs do SCM que você usar e ao provedor de LLM (OpenAI e/ou Azure)

---

## Stack

| Tecnologia | Uso |
|------------|-----|
| **Express 5** | Servidor HTTP, JSON body, `rawBody` para assinatura GitHub |
| **Zod** | Validação de payload na borda (webhooks e `env`) |
| **Pino** / **pino-http** | Logs estruturados |
| **diff** | Manipulação de diff onde aplicável |
| **OpenAI** (HTTP) | Agentes quando não há binding Foundry para o papel |
| **@azure/ai-projects** + **@azure/identity** | Invocação de agentes no Microsoft Foundry |
| **tsx** | Desenvolvimento com `watch` |
| **TypeScript** | Build para `dist/` |

---

## Estrutura do repositório

```
src/
  app.ts                 # Express: json + rawBody, /health, router code review, erro 500
  server.ts              # listen(PORT)
  shared/
    config/env.ts        # Schema Zod de todas as variáveis de ambiente
    logger/              # Logger Pino
  modules/codeReview/
    domain/              # Entidades, VOs, portas (diff, agentes, comentário PR)
    application/         # RunPullRequestReviewUseCase, utilitários de resumo/inline
    infrastructure/      # Adapters SCM, composite, agentes (OpenAI, Foundry) em agents/
    interfaces/http/     # Router, controller, schemas Zod por webhook, URLs derivadas
```

O router monta as rotas **na raiz** do app (sem prefixo `/api`): por exemplo `POST /webhooks/github` e `POST /reviews/pull-request`.

---

## Fluxo de execução

1. **Autenticação opcional**: se `REVIEW_SERVICE_TOKEN` estiver definido, as rotas `POST /webhooks/*` e **`POST /reviews/pull-request`** exigem `Authorization: Bearer <token>`.
2. **Filtro por provedor** (somente webhooks): cabeçalhos e campos do JSON definem se o evento é aceito ou **ignorado** (`202`). O endpoint de **pipeline** não usa esses cabeçalhos; o corpo traz `provider` e identificadores da PR/MR.
3. **Segredos de webhook** (somente `POST /webhooks/*`, quando configurados): GitHub (`x-hub-signature-256`), GitLab (`x-gitlab-token`), Azure DevOps (`x-azure-webhook-token`). Bitbucket não valida segredo no código atual.
4. **Parse e validação Zod** do corpo; em falha → `400`.
5. **Caso de uso**: obtém diff + `headSha` via adapter do SCM; em seguida chama os três agentes em **paralelo** (`Promise.all`).
6. **Resposta `200`**: JSON com reviews, `headSha`, etc.
7. **Pós-processamento** (se `POST_REVIEW_PR_COMMENT` não for desligado): tenta publicar resumo e findings inline na PR/MR. Falha ao comentar **não** altera o status HTTP do review (apenas campos `commentPostError` / `inlineCommentsPostError` na resposta).

O **SHA do head** não precisa vir no webhook: vem do resultado do adapter de diff.

---

## Instalação e comandos

```bash
npm install
```

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Sobe o servidor com `tsx watch src/server.ts` (reload ao editar) |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Executa `node dist/server.js` (rode `build` antes) |
| `npm run check` | `tsc --noEmit` (tipos apenas) |

Por padrão o processo escuta em **`PORT`** (default `3000`). Exemplo: `http://localhost:3000`.

---

## Variáveis de ambiente

Valores padrão e comentários estão em **`.env.example`**. Copie para `.env` e preencha.

### Servidor e logs

| Variável | Obrigatória | Default | Descrição |
|----------|-------------|---------|-----------|
| `PORT` | Não | `3000` | Porta HTTP |
| `LOG_LEVEL` | Não | `info` | Nível Pino (`debug`, `info`, `warn`, …) |

### Proteção das rotas de webhook e de pipeline

| Variável | Descrição |
|----------|-----------|
| `REVIEW_SERVICE_TOKEN` | Se definida, exige `Authorization: Bearer <mesmo valor>` em **todas** as rotas `POST /webhooks/*` e em **`POST /reviews/pull-request`**. |

### GitHub

| Variável | Descrição |
|----------|-----------|
| `GITHUB_TOKEN` | PAT para API REST (diff + comentários/review). Obrigatório ao processar webhook GitHub. |
| `GITHUB_WEBHOOK_SECRET` | Se definido, exige cabeçalho `x-hub-signature-256: sha256=<HMAC-SHA256 do corpo bruto com este segredo>`. |

### GitLab

| Variável | Descrição |
|----------|-----------|
| `GITLAB_TOKEN` | Token de API. Obrigatório ao processar webhook GitLab. |
| `GITLAB_BASE_URL` | Base da API REST. Default `https://gitlab.com/api/v4`. Em self-managed, aponte para `https://<host>/api/v4`. Usada também para derivar a **URL web** da MR quando `object_attributes.url` não vier no payload (remove sufixo `/api/v4`). |
| `GITLAB_WEBHOOK_SECRET` | Se definido, o cabeçalho `x-gitlab-token` deve ser idêntico. |

### Bitbucket Cloud

| Variável | Descrição |
|----------|-----------|
| `BITBUCKET_USERNAME` | Usuário Bitbucket. |
| `BITBUCKET_APP_PASSWORD` | App password com escopo ao repositório. Ambos obrigatórios ao processar webhook Bitbucket. |

### Azure DevOps

| Variável | Descrição |
|----------|-----------|
| `AZURE_DEVOPS_PAT` | PAT com permissões de leitura de código/repositório e para comentar no PR. |
| `AZURE_DEVOPS_WEBHOOK_SECRET` | Se definido, exige `x-azure-webhook-token` igual. |
| `AZURE_DEVOPS_ORGANIZATION` | Fallback de organização se a URL do repositório no payload não trouxer org. |
| `AZURE_DEVOPS_PROJECT` | Fallback de projeto. |

### Comportamento do review e erros

| Variável | Default | Descrição |
|----------|---------|-----------|
| `POST_REVIEW_PR_COMMENT` | ligado (`true` se vazio) | `false` / `0` / `no` desliga publicação de comentários na PR/MR. |
| `EXPOSE_REVIEW_ERROR_DETAIL` | `false` | `true` / `1` / `yes`: em erro `500` do review, inclui campo `detail` com a mensagem. **Evite em produção exposta.** |

### OpenAI

| Variável | Default | Descrição |
|----------|---------|-----------|
| `OPENAI_API_KEY` | — | Usada pelos agentes que **não** estiverem configurados no Foundry. |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Modelo chat usado pelo adapter OpenAI. |

### Microsoft Foundry (Azure AI Projects)

| Variável | Descrição |
|----------|-----------|
| `AZURE_AI_PROJECT_ENDPOINT` | URL do projeto (obrigatória se qualquer `FOUNDRY_AGENT_*_NAME` estiver definido). |
| `AZURE_AI_PROJECT_API_KEY` | Opcional; se vazio, usa `DefaultAzureCredential` (Azure CLI, Managed Identity, etc.). |
| `FOUNDRY_AGENT_PERFORMANCE_NAME` / `FOUNDRY_AGENT_PERFORMANCE_VERSION` | Agente **performance** (nome + versão publicados no portal). |
| `FOUNDRY_AGENT_SECURITY_NAME` / `FOUNDRY_AGENT_SECURITY_VERSION` | Agente **security**. |
| `FOUNDRY_AGENT_ARCHITECTURE_NAME` / `FOUNDRY_AGENT_ARCHITECTURE_VERSION` | Agente **architecture**. |

Regra de validação: para cada papel, **nome e versão vêm juntos** ou ambos vazios. Pode **misturar** Foundry e OpenAI por papel.

---

## HTTP: rotas e contratos

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/health` | Liveness: `{"status":"ok"}`. Sem autenticação. |
| `POST` | `/webhooks/github` | Webhook estilo GitHub (`pull_request` / `opened`). |
| `POST` | `/webhooks/gitlab` | Webhook estilo GitLab (`Merge Request Hook` / `open`). |
| `POST` | `/webhooks/bitbucket` | Webhook estilo Bitbucket (`pullrequest:created`). |
| `POST` | `/webhooks/azure-devops` | Service hook estilo Azure (`git.pullrequest.created`). |
| `POST` | `/reviews/pull-request` | **Pipelines**: mesmo review que os webhooks, com JSON único discriminado por `provider` (sem cabeçalhos de evento de webhook). |

Corpo das rotas `POST`: **JSON** (`Content-Type: application/json`). O Express guarda o corpo bruto em `rawBody` para validar a assinatura do GitHub **somente** nas rotas `/webhooks/github`.

---

## Pipelines CI/CD

A forma **mais simples** de integrar **GitHub Actions**, **GitLab CI/CD**, **Azure Pipelines** e **Bitbucket Pipelines** ao mesmo serviço é um único **`POST /reviews/pull-request`** com:

- **`Content-Type: application/json`**
- **`Authorization: Bearer <REVIEW_SERVICE_TOKEN>`** quando o servidor tiver `REVIEW_SERVICE_TOKEN` definido (recomendado em produção)
- Corpo com campo **`provider`** e os identificadores mínimos listados abaixo (opcionalmente `pullRequestUrl` quando quiser forçar a URL exibida no review)

O mesmo caso de uso dos webhooks roda por baixo (diff, três agentes, comentário na PR se configurado).

### Corpos JSON por `provider`

**GitHub**

```json
{
  "provider": "github",
  "repositoryFullName": "org/repo",
  "pullRequestNumber": 42,
  "pullRequestUrl": "https://github.com/org/repo/pull/42"
}
```

`pullRequestUrl` é opcional (monta-se a partir de `repositoryFullName` + `pullRequestNumber`).

**GitLab**

```json
{
  "provider": "gitlab",
  "projectId": 12345,
  "mergeRequestIid": 7,
  "pathWithNamespace": "group/sub/repo",
  "pullRequestUrl": "https://gitlab.com/group/sub/repo/-/merge_requests/7"
}
```

`pullRequestUrl` e `pathWithNamespace` são opcionais; sem URL, a MR é inferida com `GITLAB_BASE_URL` (como nos webhooks).

**Bitbucket Cloud**

```json
{
  "provider": "bitbucket",
  "repositoryFullName": "workspace/repo-slug",
  "pullRequestId": 3,
  "pullRequestUrl": "https://bitbucket.org/workspace/repo-slug/pull-requests/3"
}
```

`pullRequestUrl` é opcional.

**Azure DevOps**

```json
{
  "provider": "azure_devops",
  "organization": "minha-org",
  "project": "meu-projeto",
  "repositoryId": "nome-do-repo-ou-guid",
  "pullRequestId": 12,
  "pullRequestUrl": "https://dev.azure.com/minha-org/meu-projeto/_git/nome-do-repo-ou-guid/pullrequest/12"
}
```

`pullRequestUrl` é opcional (monta-se a partir de org/projeto/repo/ID).

### Servidor vs pipeline (o que é cada nome)

| Onde | Variável | Função |
|------|----------|--------|
| **Serviço** (`.env` do code-review-service) | `REVIEW_SERVICE_TOKEN` | Se preenchida, o servidor exige `Authorization: Bearer <esse texto exato>` nas rotas protegidas. |
| **Pipeline** (GitHub/GitLab/Azure/Bitbucket) | `CODE_REVIEW_SERVICE_TOKEN` (nome **só sugerido** neste README) | Deve guardar o **mesmo valor** que `REVIEW_SERVICE_TOKEN` no servidor. O job repassa no header `Authorization: Bearer ...`. |

Você pode chamar o secret no CI de `REVIEW_SERVICE_TOKEN` ou `MY_CR_TOKEN`; o importante é o **valor** coincidir com o do servidor e o YAML referenciar o nome que você cadastrou.

Mesma lógica para a URL base do serviço: no README usamos `CODE_REVIEW_SERVICE_URL` (ex. `https://meu-host:3000` **sem** barra no final); no `curl` monta-se `"${URL}/reviews/pull-request"`.

### Onde cadastrar `CODE_REVIEW_SERVICE_TOKEN` e `CODE_REVIEW_SERVICE_URL`

| Plataforma | Onde clicar | Detalhe |
|------------|-------------|---------|
| **GitHub Actions** | Repositório → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** | Crie dois secrets: `CODE_REVIEW_SERVICE_URL` e `CODE_REVIEW_SERVICE_TOKEN`. No YAML use `${{ secrets.NOME }}`. Repositórios da organização podem usar **Organization secrets** (mesmo caminho na org). |
| **GitLab** | Projeto → **Settings** → **CI/CD** → **Variables** → **Add variable** | Key = `CODE_REVIEW_SERVICE_TOKEN`, Value = token. Marque **Mask variable** (e **Protect variable** se só quiser em branches protegidas). Opcional: variáveis no **grupo** herdam para vários projetos. |
| **Azure DevOps** | **Pipelines** → edite o YAML → **Variables** → **New variable** (cadeado = secreto) ou **Library** → **Variable groups** (associar ao pipeline) | Nomes `CODE_REVIEW_SERVICE_URL` e `CODE_REVIEW_SERVICE_TOKEN`. No YAML use `$(CODE_REVIEW_SERVICE_TOKEN)`. |
| **Bitbucket Cloud** | Repositório → **Repository settings** → **Repository variables** | Crie as variáveis; marque **Secured** para o token (valor não aparece nos logs). No `bitbucket-pipelines.yml` use `$CODE_REVIEW_SERVICE_TOKEN`. |

No Azure Pipelines, além disso cadastre **`ADO_ORG`** (não secreto) com o nome da organização em `dev.azure.com/<org>/`, conforme os exemplos abaixo.

### Exemplos mínimos nas pipelines

Defina `CODE_REVIEW_SERVICE_URL` e `CODE_REVIEW_SERVICE_TOKEN` conforme a tabela acima (valores alinhados a `REVIEW_SERVICE_TOKEN` e à URL pública/interna do seu serviço).

**GitHub Actions** (`on: pull_request`)

```yaml
jobs:
  code-review:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - name: Chamar code review service
        env:
          URL: ${{ secrets.CODE_REVIEW_SERVICE_URL }}
          TOKEN: ${{ secrets.CODE_REVIEW_SERVICE_TOKEN }}
        run: |
          curl -sS -X POST "${URL}/reviews/pull-request" \
            -H "Authorization: Bearer ${TOKEN}" \
            -H "Content-Type: application/json" \
            -d "{\"provider\":\"github\",\"repositoryFullName\":\"${{ github.repository }}\",\"pullRequestNumber\":${{ github.event.pull_request.number }}}"
```

**GitLab** (job em merge request)

```yaml
code-review:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - |
      curl -sS -X POST "${CODE_REVIEW_SERVICE_URL}/reviews/pull-request" \
        -H "Authorization: Bearer ${CODE_REVIEW_SERVICE_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"provider\":\"gitlab\",\"projectId\":${CI_PROJECT_ID},\"mergeRequestIid\":${CI_MERGE_REQUEST_IID},\"pathWithNamespace\":\"${CI_PROJECT_PATH}\"}"
```

**Azure Pipelines** (YAML com PR trigger; variável `ADO_ORG` definida na pipeline ou library)

```yaml
steps:
  - bash: |
      curl -sS -X POST "$(CODE_REVIEW_SERVICE_URL)/reviews/pull-request" \
        -H "Authorization: Bearer $(CODE_REVIEW_SERVICE_TOKEN)" \
        -H "Content-Type: application/json" \
        -d "{\"provider\":\"azure_devops\",\"organization\":\"$(ADO_ORG)\",\"project\":\"$(System.TeamProject)\",\"repositoryId\":\"$(Build.Repository.Name)\",\"pullRequestId\":$(System.PullRequest.PullRequestId)}"
    condition: and(succeeded(), eq(variables['Build.Reason'], 'PullRequest'))
```

**Bitbucket Pipelines**

```yaml
pipelines:
  pull-requests:
    '**':
      - step:
          name: Code review service
          script:
            - |
              curl -sS -X POST "${CODE_REVIEW_SERVICE_URL}/reviews/pull-request" \
                -H "Authorization: Bearer ${CODE_REVIEW_SERVICE_TOKEN}" \
                -H "Content-Type: application/json" \
                -d "{\"provider\":\"bitbucket\",\"repositoryFullName\":\"${BITBUCKET_REPO_FULL_NAME}\",\"pullRequestId\":${BITBUCKET_PR_ID}}"
```

Webhooks nativos continuam disponíveis se preferir disparar o review na abertura da PR sem passar pela pipeline.

---

## Webhooks por provedor

### GitHub — `POST /webhooks/github`

| Cabeçalho | Valor esperado |
|-----------|----------------|
| `x-github-event` | `pull_request` |
| `x-hub-signature-256` | Obrigatório **somente se** `GITHUB_WEBHOOK_SECRET` estiver definido: `sha256=` + hex do HMAC-SHA256 do **corpo bruto** com o segredo. |
| `Authorization` | `Bearer <REVIEW_SERVICE_TOKEN>` se a variável estiver definida. |

**Ações**: somente `action === "opened"` executa review; outras ações → `202` com `ignored`.

**JSON validado (mínimo útil)**:

- `action` (string)
- `repository.full_name`
- `pull_request.number` (inteiro positivo)
- Opcionais: `pull_request.html_url` (se ausente, monta-se `https://github.com/{full_name}/pull/{number}`), `pull_request.head.sha`

### GitLab — `POST /webhooks/gitlab`

| Cabeçalho | Valor esperado |
|-----------|----------------|
| `x-gitlab-event` | `Merge Request Hook` |
| `x-gitlab-token` | Igual a `GITLAB_WEBHOOK_SECRET` quando esta estiver definida. |
| `Authorization` | Bearer, se `REVIEW_SERVICE_TOKEN` estiver definido. |

**Ações**: somente `object_attributes.action === "open"`.

**JSON (campos relevantes)**:

- `object_attributes.iid`, `object_attributes.action`
- `project.id` (número ou string)
- Opcionais: `object_attributes.url`, `project.path_with_namespace`, `object_attributes.last_commit`, etc.

Sem `object_attributes.url`, a URL da MR é montada com `GITLAB_BASE_URL` (derivando a raiz web) + `path_with_namespace` + `/-/merge_requests/{iid}`, ou `/-/project/{id}/merge_requests/{iid}`.

### Bitbucket Cloud — `POST /webhooks/bitbucket`

| Cabeçalho | Valor esperado |
|-----------|----------------|
| `x-event-key` | `pullrequest:created` |
| `Authorization` | Bearer, se token de serviço configurado. |

**JSON**:

- `repository.full_name`
- `pullrequest.id`
- Opcionais: `pullrequest.links.html.href`, `pullrequest.source.commit.hash`

Sem link HTML, usa-se `https://bitbucket.org/{full_name}/pull-requests/{id}`.

### Azure DevOps — `POST /webhooks/azure-devops`

| Cabeçalho | Valor esperado |
|-----------|----------------|
| `x-azure-webhook-token` | Igual a `AZURE_DEVOPS_WEBHOOK_SECRET` quando definida. |
| `Authorization` | Bearer, se token de serviço configurado. |

**JSON**:

- `eventType` — apenas `git.pullrequest.created` executa review
- `resource.pullRequestId`
- `resource.repository` com **`id` ou `url`** (URL do **repositório** no formato `https://dev.azure.com/{org}/{projeto}/_git/{repo}`)
- Opcionais: `resource.url` (URL da PR), `resource.lastMergeSourceCommit`

---

## Resposta JSON (sucesso)

Em **`200`**, o corpo inclui (entre outros) campos do caso de uso e do pós-comentário:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `provider` | string | `github` \| `gitlab` \| `bitbucket` \| `azure_devops` |
| `repositoryLabel` | string | Rótulo amigável do repositório |
| `pullRequestNumber` | number | Número/IID/ID conforme o provedor |
| `headSha` | string | Commit no topo do branch da PR/MR (vindo do diff) |
| `pullRequestUrl` | string | URL usada para contexto/comentários |
| `reviews` | array | Três itens, ordem dos agentes fixa no código: `performance`, `security`, `architecture` |
| `reviews[].agent` | string | Um dos três tipos acima |
| `reviews[].summary` | string | Resumo em texto |
| `reviews[].findings` | string[] | Lista de achados gerais |
| `reviews[].inlineFindings` | array | Achados para comentário inline: objetos com `path`, `line`, `message`, opcionalmente `title`, `severity`, `agent` |
| `commentPosted` | boolean | Se o resumo foi publicado na PR/MR |
| `commentPostError` | string | Presente se a publicação do resumo falhou |
| `inlineCommentsPosted` | number | Quantidade de comentários inline publicados |
| `inlineCommentsPostError` | string | Presente se a publicação inline falhou de forma agregada |

Eventos ignorados: **`202`** com JSON `{ "ignored": true, "reason": "..." }`.

---

## Códigos HTTP e erros

| Status | Situação |
|--------|----------|
| `200` | Review executado (comentários na PR podem ter falhado; ver flags na resposta). |
| `202` | Evento ou ação não suportada (`ignored`). |
| `400` | JSON inválido ou regras de negócio na borda (ex.: Azure sem `repository.url`/`id` parseável). |
| `401` | `REVIEW_SERVICE_TOKEN` incorreto/ausente, ou assinatura/token de webhook inválido. |
| `500` | Falha no review. Com `EXPOSE_REVIEW_ERROR_DETAIL=true`, inclui `detail`. |
| `503` | Token do SCM não configurado para aquele provedor (mensagem contém `not configured`). |

---

## Exemplos `curl`

Substitua `BASE=http://localhost:3000` e ajuste JSON de exemplo (números, nomes de repositório) aos seus dados reais.

Se **`REVIEW_SERVICE_TOKEN`** estiver definido no `.env`, acrescente em todo `POST` de webhook **e** em **`POST /reviews/pull-request`**:

`-H "Authorization: Bearer <o mesmo valor de REVIEW_SERVICE_TOKEN>"`

Nos exemplos, `AUTH=()` pode ser trocado por `AUTH=( -H "Authorization: Bearer SEU_TOKEN" )` e inclua `"${AUTH[@]}"` nas chamadas `curl` (array vazio não adiciona cabeçalhos).

### Health

```bash
BASE=http://localhost:3000
curl -sS "$BASE/health"
```

Resposta esperada: `{"status":"ok"}`.

### Pipeline — `POST /reviews/pull-request` (GitHub)

```bash
BASE=http://localhost:3000
AUTH=()

curl -sS -X POST "$BASE/reviews/pull-request" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  --data-binary '{"provider":"github","repositoryFullName":"acme/app","pullRequestNumber":42}'
```

### GitHub (sem `GITHUB_WEBHOOK_SECRET`)

Com segredo **vazio**, a assinatura não é exigida (útil para testes locais).

```bash
BASE=http://localhost:3000
AUTH=()

curl -sS -X POST "$BASE/webhooks/github" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -H "x-github-event: pull_request" \
  --data-binary @- <<'JSON'
{
  "action": "opened",
  "repository": { "full_name": "acme/app" },
  "pull_request": { "number": 42 }
}
JSON
```

Com `html_url` opcional:

```bash
AUTH=()
curl -sS -X POST "$BASE/webhooks/github" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -H "x-github-event: pull_request" \
  --data-binary @- <<'JSON'
{
  "action": "opened",
  "repository": { "full_name": "acme/app" },
  "pull_request": {
    "number": 42,
    "html_url": "https://github.com/acme/app/pull/42"
  }
}
JSON
```

### GitHub (com `GITHUB_WEBHOOK_SECRET`)

O HMAC deve ser calculado sobre os **mesmos bytes** enviados no corpo. Exemplo gravando o JSON em arquivo:

```bash
BASE=http://localhost:3000
AUTH=()
SECRET="seu_segredo_github"
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

cat > "$BODY_FILE" <<'JSON'
{"action":"opened","repository":{"full_name":"acme/app"},"pull_request":{"number":42}}
JSON

SIG_HEX=$(openssl dgst -sha256 -hmac "$SECRET" "$BODY_FILE" | awk '{print $NF}')

curl -sS -X POST "$BASE/webhooks/github" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -H "x-github-event: pull_request" \
  -H "x-hub-signature-256: sha256=$SIG_HEX" \
  --data-binary @"$BODY_FILE"
```

### GitLab

```bash
BASE=http://localhost:3000
AUTH=()

curl -sS -X POST "$BASE/webhooks/gitlab" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -H "x-gitlab-event: Merge Request Hook" \
  -H "x-gitlab-token: SEU_GITLAB_WEBHOOK_SECRET" \
  --data-binary @- <<'JSON'
{
  "object_attributes": {
    "iid": 7,
    "action": "open",
    "url": "https://gitlab.com/acme/app/-/merge_requests/7"
  },
  "project": {
    "id": 12345,
    "path_with_namespace": "acme/app"
  }
}
JSON
```

Se `GITLAB_WEBHOOK_SECRET` **não** estiver definido, omita `x-gitlab-token`.

Payload mínimo sem `object_attributes.url` (depende de `GITLAB_BASE_URL` correta, ex. `https://gitlab.com/api/v4`):

```bash
AUTH=()
curl -sS -X POST "$BASE/webhooks/gitlab" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -H "x-gitlab-event: Merge Request Hook" \
  --data-binary @- <<'JSON'
{
  "object_attributes": { "iid": 7, "action": "open" },
  "project": { "id": 12345, "path_with_namespace": "acme/app" }
}
JSON
```

### Bitbucket Cloud

```bash
BASE=http://localhost:3000
AUTH=()

curl -sS -X POST "$BASE/webhooks/bitbucket" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -H "x-event-key: pullrequest:created" \
  --data-binary @- <<'JSON'
{
  "repository": { "full_name": "acme-workspace/app-repo" },
  "pullrequest": { "id": 3 }
}
JSON
```

### Azure DevOps

```bash
BASE=http://localhost:3000
AUTH=()

curl -sS -X POST "$BASE/webhooks/azure-devops" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -H "x-azure-webhook-token: SEU_AZURE_DEVOPS_WEBHOOK_SECRET" \
  --data-binary @- <<'JSON'
{
  "eventType": "git.pullrequest.created",
  "resource": {
    "pullRequestId": 12,
    "repository": {
      "url": "https://dev.azure.com/acme-org/acme-project/_git/app-repo"
    }
  }
}
JSON
```

Se `AZURE_DEVOPS_WEBHOOK_SECRET` estiver vazio, omita `x-azure-webhook-token`.

---

## Tokens e permissões nos SCMs

- **GitHub**: PAT precisa permitir leitura do repositório para diff; para **review** `COMMENT` e comentários, escopos de escrita em pull requests (e possivelmente issues, conforme o adapter). PAT fine-grained costuma exigir permissões explícitas de **Pull requests** (read/write).
- **GitLab**: token de API com escopo adequado ao projeto (API + repositório conforme sua política).
- **Bitbucket**: App password com acesso ao repositório (leitura PR + escrita de comentários se quiser publicar o resumo).
- **Azure DevOps**: PAT com **Code (Read)** no mínimo para diff; permissões adicionais para comentar threads no PR.

Se o token do provedor do webhook não estiver configurado, a rota tende a responder **`503`** com mensagem contendo `not configured`.

---

## LLM: OpenAI e Microsoft Foundry

- Cada um dos três papéis (`performance`, `security`, `architecture`) é resolvido pelo **HybridAgentReviewAdapter**: se existir binding Foundry (nome + versão + endpoint), usa-se o agente no projeto Azure AI; caso contrário usa-se **OpenAI** com `OPENAI_API_KEY` e `OPENAI_MODEL`.
- Se um papel não tiver Foundry **e** não houver chave OpenAI, a chamada desse agente falha com mensagem orientando a configurar chave ou Foundry.

---

## Configurar webhooks nos provedores

| Provedor | Onde configurar | URL sugerida |
|----------|-----------------|--------------|
| GitHub | Settings → Webhooks → Add | `https://<seu-host>/webhooks/github` — evento **Pull requests**, JSON |
| GitLab | Project → Settings → Webhooks | `https://<seu-host>/webhooks/gitlab` — **Merge request events** |
| Bitbucket | Repository settings → Webhooks | `https://<seu-host>/webhooks/bitbucket` — **Pull request: Created** |
| Azure DevOps | Project → Service hooks | `https://<seu-host>/webhooks/azure-devops` — código Git, **Pull request created** |

Em pipelines CI que não repassem o payload nativo, você pode disparar os mesmos `POST` com JSON no formato validado pelos schemas deste repositório (como nos exemplos `curl`).

---

## Segurança em produção

- Defina **`REVIEW_SERVICE_TOKEN`** se o endpoint for exposto à internet.
- Configure os **segredos de webhook** por provedor.
- Mantenha **`EXPOSE_REVIEW_ERROR_DETAIL`** desligado em ambientes públicos para não vazar mensagens de erro internas.
