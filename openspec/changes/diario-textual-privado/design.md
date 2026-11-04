# Design

## Context

O contrato de conteúdo já valida FR-008. `cadastro.acesso_paciente` representa concessão revogável; identidade e sessão familiares ainda não estão disponíveis. A audiência inicial publicada é autor e coordenação, sem divulgação adicional implícita.

## Goals / Non-Goals

**Goals:** preparar estrutura local cifrada e fechada por padrão.

**Non-Goals:** conceder acesso, definir plano de crise ou retorno, implementar publicação ou afirmar integração funcional.

## Decisions

- Reutilizar vínculo existente, em vez de duplicar identidade por parentesco. A existência de vínculo não substitui autenticação nem audiência.
- Armazenar envelope cifrado com identificadores de paciente e autor; conteúdo e data do acontecimento ficam dentro do envelope. O formato segue cadastro existente. RLS forçada e ausência de políticas e privilégios de aplicação bloqueiam acesso, inclusive direto. Papel proprietário e superusuários exigem proteção operacional própria.
- Não fornecer RPC ou política permissiva enquanto sessão familiar e prova de revogação não existirem. A estrutura é preparação, não autorização ou jornada.

## Risks / Trade-offs

- Rascunho ainda não utilizável: operações e controles reais são pré-condições. Mudanças de audiência, publicação e retificação exigem desenho e revisão próprios.
- Autoridade de migração pode acessar dados: não usar dados reais nesta etapa.

## Migration Plan

Somente migração local; nenhuma aplicação remota autorizada. Desfazer removendo a tabela apenas antes de qualquer dado persistente e mediante procedimento aprovado.
