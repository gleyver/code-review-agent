---
name: nodejs-api-creation
description: Guia para implementar endpoints REST em Node.js com validação na borda, handlers finos e integração com casos de uso hexagonais. Use ao criar API nova, adicionar recurso REST, configurar Express/Fastify/Nest, middleware de erro ou contratos HTTP.
---

# Criação de API (Node.js)

## Princípios

- Handler = **borda**: validar entrada, chamar **um** caso de uso, devolver DTO de saída ou erro mapeado.
- Domínio e application **sem** `Request`/`Response` do framework.

## Fluxo por endpoint

1. **Recurso**: substantivo plural ou singular consistente (`/password-validations`, `/users/{id}`).
2. **Método e status**: GET 200/404, POST 201/400/409, PUT/PATCH 200/404/409, DELETE 204/404.
3. **Schema na borda**: Zod (Fastify/standalone), Joi, ou DTO + `class-validator` (Nest). Validar body, query e params.
4. **Handler**: extrair input validado → `useCase.execute(input)` → `reply.status(...).send(dto)` com early return em erro conhecido.
5. **Erros**: mapear erros de domínio/aplicação para status (ex.: não encontrado → 404, conflito → 409, regra violada → 422 ou 400 conforme contrato).

## Por framework (escolher o do repo)

### Fastify

- Rota com `schema` JSON Schema ou integração Zod; `preHandler` para auth se existir.
- Plugin por contexto (`modules/<context>/interfaces/http`).

### Express

- Validar com Zod/Joi em middleware dedicado ou no início do handler; evitar lógica duplicada.
- Centralizar `error` middleware no fim da cadeia; não engolir stack em produção.

### NestJS

- `Controller` + `UsePipes(ValidationPipe)` ou Zod pipe custom; serviços injetáveis chamando use cases.
- Filtros de exceção para mapear erros de domínio → HTTP.

## Cross-cutting na borda

- Gerar ou propagar `requestId` (header ou UUID) e incluir em logs JSON.
- Timeout e body size limit na configuração do servidor.
- Health: `GET /health` (e `ready` se houver dependências assíncronas).

## Testes

- **Integração**: supertest/httptest contra app instanciado com dependências de teste; cobrir 2xx e pelo menos um 4xx por rota nova.
- Não mockar o framework inteiro se o teste for de integração; mockar **portas** atrás do use case.

## Checklist antes de encerrar

- [ ] Nenhuma regra de negócio no controller/handler
- [ ] Validação só na borda + tipos no use case quando fizer sentido
- [ ] Status e corpo de erro previsíveis (evitar 500 para erro de negócio mapeado)
- [ ] Rota registrada e documentada se o projeto usar OpenAPI
