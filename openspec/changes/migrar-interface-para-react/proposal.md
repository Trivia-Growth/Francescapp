# Migrar a interface para React, Tailwind e componentes acessíveis prontos

## Por que

Avaliação do solicitante em 25/11/2026, nas palavras dele: *"Não usamos react? Por isso
está ficando horrível, estar 'recriando a roda', e vai ficar impossível de sustentar.
Ninguém desenvolve nada hoje sem usar framework."*

A avaliação anterior, de 24/11/2026, registrada em `interface-digna-do-cliente`, já havia
concluído que a apresentação entrega menos do que o produto por baixo dela faz. Esta
mudança trata da causa estrutural que aquela não tocou: a interface é construída à mão,
em DOM imperativo, sem biblioteca de componentes.

## Fatos medidos

Números do código em 25/11/2026, não impressão:

| Medida | Valor |
| --- | --- |
| Módulos de aplicação em `web/` (fora testes) | 137 |
| Linhas de aplicação em `web/` | 37.224 |
| Arquivos de teste em `web/` | 119 |
| Linhas de teste em `web/` | 20.108 |
| `web/main.ts` — casca, navegação e roteamento | 3.132 linhas |
| `web/styles.css` | 3.338 linhas |
| Módulos que chamam `document.createElement` | 127 |
| Funções `montar*` exportadas | 77 |
| Módulos já livres de DOM (`servico-*`, `ciclo-*`, `*-local`) | 38 (~7.300 linhas) |

Dois fatos mudam o tamanho do trabalho:

1. **Um terço do `web/` já é agnóstico de framework.** Os 31 `servico-*-http.ts` (5.037
   linhas) não tocam em `document` nenhuma vez. Os `ciclo-*.ts` são máquinas de estado
   puras — só um toca o DOM. Somados a `api.ts` e aos `*-local.ts`, são ~8.300 linhas que
   **não migram**: são consumidas igual por React.
2. **A superfície real da migração são ~90 módulos de visão, ~28.000 linhas.**

## O que o trabalho manual custa hoje

**O contrato de montagem.** Todo módulo de visão é `montar*(raiz, …)` devolvendo a função
de desmontagem, com uma flag `ativa` conferida à mão. Em `web/concessao-equipe.ts`
há **seis** `if (!ativa) return` protegendo escritas em DOM já desmontado. Cada ocorrência
esquecida é uma escrita em nó morto, e nenhuma ferramenta avisa. É vigilância humana
permanente sobre um problema que o ciclo de vida de componente resolve por construção.

**Os componentes acessíveis.** Diálogo com armadilha de foco, combobox com teclado, abas
com setas/Home/End, popover posicionado — `web/ui/` (707 linhas de CSS mais `dialogo.ts`,
`selecao.ts`, `basicos.ts`, `data.ts`) está escrevendo à mão o que Radix já resolveu e
testou. Esta é a roda cara: acessibilidade de sobreposição e de seleção é difícil de
acertar e fácil de quebrar sem notar.

**A sustentação.** 3.132 linhas de casca imperativa que ninguém além desta equipe lê.

## O que esta mudança não promete

**React não deixa uma tela bonita.** O que deixa é token semântico, superfície plana por
padrão, hierarquia por tamanho e espaço, e contrato de estados — o conteúdo de
`linguagem-visual-ffcm` e de `interface-digna-do-cliente`. Migrar esperando que o
framework resolva a aparência resulta em interface feia escrita em React.

Por isso as duas frentes são **um trabalho só**: as telas que o solicitante reclamou já
nascem em React, com a linguagem visual aplicada. Não há etapa de migração silenciosa sem
entrega visível.

## Escopo

**Entra:** React 19, Vite como host, Tailwind v4, componentes shadcn/Radix vestidos com os
tokens da Francescato; ponte `@theme inline` apontando para as variáveis existentes; o
`DESIGN.md` reescrito; um contrato visual testado; migração dos ~90 módulos de visão,
tela por tela; a casca e a navegação por último.

**Não entra:** nenhuma alteração de autenticação, autorização, contrato de API, rota,
migração de banco ou regra de domínio. Nenhuma mudança de paleta. Nenhuma troca de
fontes. Nenhuma renomeação de vocabulário de negócio.

**Preservado sem alteração:** `packages/contracts`, `netlify/functions`,
`supabase/`, `web/api.ts`, os 31 `servico-*-http.ts`, os `ciclo-*.ts` e os `*-local.ts`.

## Decisões

- **D1. React 19 + Vite.** O Vite já é o empacotador (`pnpm run build:web`). Sem Next.js:
  não há necessidade de renderização no servidor, e a aplicação é privada por sessão.
- **D2. Tailwind v4 com `@theme inline`.** Nenhum valor literal nasce no tema; toda cor,
  raio, sombra e fonte aponta para os tokens da marca.
- **D3. shadcn/Radix, copiado para o repositório.** Componente é código nosso, versionado,
  não dependência opaca. Permite vesti-lo com nossos tokens sem fork.
- **D4. Migração por ilhas, não big bang.** Um adaptador monta React dentro do contrato
  `montar*(raiz) => desmontar` existente. Cada módulo migra sozinho, e cada migração é
  reversível por reversão de um commit.
- **D5. A paleta não muda.** Restrição dura do solicitante, repetida em 25/11/2026.
- **D6. Sem tema escuro nesta mudança.** Os tokens são nomeados de forma a acomodá-lo por
  `:root[data-tema="escuro"]` depois; nada é construído agora.

## Hipóteses a confirmar

- **H1.** O peso adicional de React + Radix no pacote é aceitável para uso em celular.
  A medição é tarefa desta mudança, com corte declarado antes de medir.
- **H2.** Os 119 arquivos de teste de `web/` sobrevivem à migração quando testam
  comportamento. Os que testam estrutura de DOM imperativo serão reescritos, e cada
  reescrita será nomeada — nunca apagada em silêncio.

## Pendências

- **P1.** Aprovação explícita para instalar as dependências novas (Fase 1). Até lá, só a
  Fase 0 executa, e ela não adiciona dependência nenhuma.

## Relação com mudanças existentes

- `interface-digna-do-cliente`: continua válida. Os defeitos que ela cataloga são
  corrigidos **durante** esta migração, não antes nem depois.
- `linguagem-visual-ffcm`: a direção visual aprovada em 25/11/2026 é o insumo da Fase 0.
- `refinamento-visual-ffcmapp`: VIS-001 a VIS-010 permanecem. Esta mudança acrescenta.
