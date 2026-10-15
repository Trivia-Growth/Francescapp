# Francescapp

Sistema de coordenação do cuidado da Francescato. Projeto aprovado, em preparação para desenvolvimento de produção. O repositório contém a demonstração navegável e os requisitos; a aplicação conectada ainda não foi implementada.

## Desenvolvimento com IA

O processo ativo é **OpenSpec**, desde 14/10/2026, com diretrizes em [AGENTS.md](AGENTS.md). O Spec Kit foi preservado apenas como histórico.

- [Requisitos por capacidade](openspec/specs)
- [Contexto e decisões pendentes](docs/projeto/fundacao.md)
- [Jornadas, metas e regras de negócio](docs/projeto/contexto-negocio.md)
- [Referência de código Atendimento](docs/projeto/referencia-atendimento.md)
- [Registro da migração e rastreabilidade](docs/processo/migracao-openspec.md)
- [Produto](PRODUCT.md) e [contexto visual](DESIGN.md)
- [Especificações de features e regras de negócio para João](docs/projeto/especificacoes-para-joao.md) e PDF correspondente em `output/pdf/especificacoes-francescapp-joao.pdf`.

## Fluxo

1. Explorar pendências com `openspec-explore`.
2. Propor uma mudança com `openspec-propose`: proposta, specs, decisões técnicas e tarefas, sem implementar na mesma etapa.
3. Revisar com o solicitante; implementar com `openspec-apply-change` após autorização.
4. Validar critérios de aceite, testes afetados e gates proporcionais ao risco; registrar evidências.
5. Revisar deltas com `openspec-update-change`; sincronizar/arquivar quando solicitado e validado.

Codex usa skills; Claude usa os comandos `opsx` equivalentes. São seis fluxos: explore, propose, update, apply, sync e archive. Não é necessário escolher ou trocar um modelo automaticamente. Novas skills ficam disponíveis no próximo turno; se a interface não atualizar, reabra a sessão.

```sh
openspec list --json
openspec validate --all --strict --no-interactive
```

Validação do OpenSpec verifica artefatos, não comprova que o produto existe ou que seus testes passaram.

## Mockup e proposta

- [Instruções do mockup](mockup/README.md)
- [Proposta HTML](output/proposta-edilaine.html)
- PDFs em `output/pdf/`.

Não usar dados reais na demonstração. Não provisionar contas, executar migrações remotas ou publicar sem autorização.
