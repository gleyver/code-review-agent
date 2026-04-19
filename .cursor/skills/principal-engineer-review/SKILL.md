---
name: principal-engineer-review
description: Executa revisão de código com o rigor de principal engineer em projetos Node.js backend. Use quando o usuário solicitar review de PR, diff, arquivo ou pasta; ou quando precisar de parecer antes de merge.
---

# Code review (principal engineer)

## Antes de começar

1. Identificar escopo: arquivo(s), PR inteiro ou módulo.
2. Se o repositório tiver testes, considerar o diff de testes parte obrigatória da revisão.

## Checklist (marque mentalmente)

- [ ] Domínio sem imports de Express/Fastify/Nest, ORM ou HTTP client
- [ ] Casos de uso na application sem SQL/SDK direto
- [ ] Validação de entrada na borda com schema
- [ ] Nomes REST substantivos; status e métodos coerentes
- [ ] Sem lógica de negócio em controller
- [ ] Testes unitários sem DB/rede; integração cobre fluxo principal e falha

## Template de comentário por achado

```markdown
### [Arquivo:linha ou símbolo]

**Problema:** [o que viola: camada, princípio, REST, teste]

**Por que importa:** [efeito em manutenção, testes, evolução]

**Direção correta:** [onde a lógica deve morar / qual abstração]

**Sugestão:** [snippet ou pseudocódigo curto]
```

## Severidade

- **Bloqueante:** domínio acoplado a framework; negócio no controller; DB fora de repositório
- **Alta:** ausência de validação na borda; teste de unidade com I/O real
- **Média:** violação leve de calisthenics/SOLID corrigível no PR
- **Baixa:** nomenclatura, estilo, nit

## Referência compacta

- Hexagonal: domínio no centro; adaptadores na periferia
- DDD: agregados consistentes; value objects para conceitos sem identidade própria
- Mocks: apenas implementações de portas, não entidades de domínio
