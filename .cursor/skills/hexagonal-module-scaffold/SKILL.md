---
name: hexagonal-module-scaffold
description: Guia passo a passo para criar ou estender um módulo em arquitetura hexagonal com DDD em Node.js. Use ao adicionar novo bounded context, feature vertical ou ao pedir "criar módulo", "estrutura de pasta" ou "ports and adapters".
---

# Novo módulo (hexagonal + DDD)

## Ordem de criação (dependências corretas)

1. **Domain**
   - Entidades e value objects (regras invariantes aqui).
   - Interfaces de repositório e gateways (portas de saída).
   - Erros de domínio específicos do contexto.

2. **Application**
   - Casos de uso (um fluxo por classe/função coesa).
   - DTOs de entrada/saída do caso de uso (não confundir com DTO HTTP).
   - Orquestrar domínio + portas; sem detalhe de transporte.

3. **Infrastructure**
   - Implementações de repositório (ORM/driver).
   - Clientes HTTP/fila/email.
   - Mapeadores entre persistência e domínio se necessário.

4. **Interfaces (borda)**
   - Controllers/handlers: validar → chamar caso de uso → mapear resposta HTTP.
   - Registro de rotas e injeção de dependências do módulo.

## Checklist de pastas

```
modules/<context>/
  domain/
  application/
  infrastructure/
  interfaces/
```

## Regras de import

- `domain` → não importa de `application`, `infrastructure`, `interfaces`.
- `application` → importa `domain` e interfaces definidas no domain.
- `infrastructure` → implementa interfaces do `domain`.
- `interfaces` → importa `application` (e tipos de apresentação), nunca o contrário para regras de negócio.

## Testes

1. Testes unitários dos value objects e entidades (domínio).
2. Testes de caso de uso com portas falsas (in-memory).
3. Teste(s) de integração do endpoint + DB (ou container) para o fluxo feliz e um erro de negócio.

## Conclusão

Antes de encerrar a tarefa, confirmar que nenhum arquivo em `domain` referencia framework e que validação HTTP está só na borda.
