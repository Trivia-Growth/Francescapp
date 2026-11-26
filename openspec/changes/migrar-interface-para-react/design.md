# Design — migração da interface para React

## Estado atual, medido

`web/` tem três camadas misturadas num diretório plano de 137 módulos:

| Camada | Arquivos | Linhas | Toca DOM | Destino |
| --- | --- | --- | --- | --- |
| Adaptadores HTTP (`servico-*-http.ts`) | 31 | 5.037 | não | **preservado** |
| Máquinas de estado (`ciclo-*.ts`) | 7 | 1.568 | 1 arquivo | **preservado** |
| Lógica local (`*-local.ts`) | 7 | 706 | não | **preservado** |
| Cliente de API (`api.ts`) | 1 | 974 | não | **preservado** |
| Camada de componente atual (`web/ui/`) | 6 + CSS | ~1.800 | sim | **vira especificação, depois sai** |
| Casca (`main.ts`) | 1 | 3.132 | sim | **reconstruída por último** |
| Visões (`montar*`) | ~90 | ~28.000 | sim | **reconstruídas** |

A separação já existe de fato: serviço e ciclo não sabem o que é DOM. É por isso que a
migração é viável sem reescrever regra de negócio — ela para na fronteira da visão.

## D1 — React 19 sobre o Vite existente

`pnpm run build:web` já usa Vite 8. Acrescenta-se `@vitejs/plugin-react`; o host não muda.

**Sem Next.js.** Não há conteúdo público a renderizar no servidor: toda tela exige sessão.
Next traria roteamento de servidor, convenções de arquivo e um segundo modelo de
implantação sobre o Netlify, sem resolver nenhum problema listado.

## D2 — Ilha de React dentro do contrato existente

A chave da migração incremental. O contrato atual de toda visão é:

```ts
montar(raiz: HTMLElement, …): () => void   // devolve a desmontagem
```

Um adaptador satisfaz esse mesmo contrato montando uma raiz React:

```ts
// web/ponte/ilha.ts
export function ilha(raiz: HTMLElement, elemento: ReactElement): () => void {
  const r = createRoot(raiz);
  r.render(elemento);
  return () => r.unmount();
}
```

Consequências:

- `main.ts` continua chamando `montar*(raiz)` e não sabe quem é React.
- Um módulo migra sozinho. Nada precisa migrar junto.
- Reverter uma migração é reverter um commit.
- `r.unmount()` cancela os efeitos — os seis `if (!ativa) return` de
  `concessao-equipe.ts` deixam de existir por construção, satisfazendo VIS-012.

A ilha é andaime. Sai na Fase 7, quando a casca também for React e houver uma raiz só.

## D3 — Tokens: nomes semânticos, nossas cores

Os tokens atuais em `web/styles.css` misturam papel e valor (`--panel`, `--soft`,
`--wash`, `--line`). Entram papéis que faltam, todos derivados da paleta existente —
nenhum hex novo, nenhum hex importado da referência:

```
--superficie, --superficie-2, --superficie-3     camadas (hoje improvisadas)
--borda, --borda-forte                           divisão e limite interativo
--sucesso|--aviso|--perigo + -superficie         estado com fundo tonal
--sombra-controle|--sombra-menu|--sombra-modal   vocabulário de profundidade
--controle-sm|md|lg  = 28px|36px|40px            altura de controle
--largura-sidebar, --largura-trilho              navegação
--icone-base 16px, --icone-chrome 18px           ícone
--sobreposicao                                   fundo de sobreposição
```

Preservados sem alteração: `--primary` `#475436`, `--brand-olive` `#839352`, `--ink`,
`--texto-1..6`, `--espaco-1..8`, `--mov-estado|troca|contexto`, `--curva-entrada|saida`,
as fontes Cormorant Garamond e Raleway.

**Regra do oliva.** `#839352` sobre branco dá **3,35:1** — reprova no mínimo de 4,5:1 para
texto. Serve como marca, preenchimento e borda; nunca como cor de texto. Texto usa
`--primary` `#475436`. VIS-017 trava isso por teste.

## D4 — Ponte `@theme inline`

Tailwind v4 recebe o vocabulário que os componentes shadcn esperam, apontando para os
nossos tokens. Nenhum valor literal nasce aqui:

```css
@layer tokens, base, legado, components, utilities;

@theme inline {
  --color-background: var(--wash);
  --color-foreground: var(--ink);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--white);
  --color-muted-foreground: var(--muted);
  --color-border: var(--line);
  --color-ring: var(--primary);
  --font-display: var(--font-display);
  --font-sans: var(--font-body);
  --radius-control: var(--radius-control);
  /* … */
}
```

A camada `legado` fica **abaixo** de `utilities`, então uma classe utilitária sempre vence
um reset global de `web/styles.css`. Tela não migrada continua fora de camada e intocada.

## D5 — Componentes: shadcn vestido, não genérico

Copiados para `web/componentes/ui/`, versionados, vestidos com os tokens. A camada
`web/ui/` construída em 24–25/11/2026 **não é desperdício**: ela já definiu o contrato —
quais variantes de botão, quais alturas, qual comportamento de diálogo, qual contrato de
estado. Vira a especificação das variantes, e sai depois de cumprida.

Correspondência direta:

| `web/ui/` hoje | Destino |
| --- | --- |
| `basicos.ts` — `botao()` | `button.tsx`, variantes principal/secundário/ghost/destrutivo |
| `dialogo.ts` | `dialog.tsx` sobre Radix Dialog, mais `sheet.tsx` no celular |
| `selecao.ts` | `combobox.tsx` sobre Radix Popover + cmdk |
| `data.ts` | `date-field.tsx`, mantendo o parsing e a validação atuais |
| `controles.ts` | `input.tsx`, `textarea.tsx`, `select.tsx` |
| — (novo) | `tabs.tsx`, `table.tsx`, `badge.tsx`, `skeleton.tsx`, `estado-vazio.tsx`, `estado-erro.tsx` |

**O diálogo carrega a correção pedida pelo solicitante em 25/11/2026:** centralizado,
ações sempre visíveis, corpo rolável quando exceder a altura, e o mesmo comportamento no
celular.

## D6 — Ordem da migração

A ordem é pela dor do solicitante, não pela facilidade técnica.

1. **Fundação** — tokens, contrato visual testado, `DESIGN.md`. Sem dependência nova.
2. **Ponte** — React, Tailwind, ilha, camadas.
3. **Componentes base** — a biblioteca vestida.
4. **Telas reclamadas** — Administração, criação de usuário, configurações, lista de
   pacientes, lista de profissionais. **Primeira entrega visível.**
5. **Casca** — lateral recolhível, navegação de celular, busca.
6. **Ficha e plantão** — maior volume, menor risco visual.
7. **Resto e encerramento** — agenda, financeiro, auditoria, documentos; remoção do
   andaime e do CSS legado.

A Fase 4 vem antes da 5 de propósito: o solicitante vê a mudança na primeira semana, e a
casca é reconstruída já sabendo o que as telas precisam dela.

## D7 — Testes

Os 119 arquivos de teste de `web/` dividem-se em dois grupos, e o tratamento difere:

- **Comportamento** (`integracao-*.test.ts`, autorização, barreira, guarda de pendência):
  SHALL permanecer verdes. São a rede de segurança da migração. Rodam contra o componente
  novo sem alteração, ou com alteração apenas de seletor.
- **Estrutura** (teste que afirma ordem de `createElement` ou forma de nó): reescrito para
  comportamento observável. **Cada reescrita é nomeada na tarefa**, com a justificativa.
  Nenhum teste de autorização é removido por custo de migração.

Testing Library entra no jsdom já configurado. Playwright continua cobrindo celular.

## D8 — Peso do pacote

React + react-dom + Radix acrescentam peso onde hoje não há framework.

**Correção de 25/11/2026.** A primeira versão deste corte fixava limites absolutos de 180 KB
e 260 KB. Estavam errados: foram escritos antes de medir. Medido agora:

| Medida | Valor comprimido |
| --- | --- |
| Pacote atual, sem framework nenhum | **185,4 KB** |
| React 19 + react-dom isolados | **67,3 KB** |

Ou seja, a base **já nasce acima** do primeiro limite que eu havia declarado. Um corte
absoluto não diz nada aqui. O corte correto é sobre o **saldo** ao fim da migração, porque
sai peso junto com o que entra: `web/ui/` inteiro, a camada de montagem imperativa e as
regras de `web/styles.css` substituídas.

- Saldo final até **+40 KB**: segue sem discussão.
- Entre +40 KB e +70 KB: segue com divisão por rota aplicada.
- Acima de +70 KB — isto é, React não tendo pago o próprio peso: volta à coordenação.

A medição de referência fica registrada aqui para que a comparação final seja contra um
número real, não contra memória. Medir de novo no fim da Fase 2 e no fim da Fase 7.

**Medição do fim da Fase 2**, com a camada de componente pronta:

| Medida | Valor comprimido |
| --- | --- |
| React + Radix + cmdk + toda a camada `web/componentes/ui/` | **113,7 KB** |
| Camada `web/ui/` atual, que sai | **5,2 KB** |

O que entra é muito maior do que a camada que sai, e isso era esperado: `web/ui/` é fina,
porque o custo do jeito atual não está nela — está espalhado pelos ~90 módulos de visão,
que montam o próprio DOM à mão. A economia tem de vir de lá.

Projeção, declarada antes de a migração acontecer para poder ser cobrada depois: os módulos
de visão são cerca de três quartos do pacote atual, isto é, algo perto de 140 KB. Código
React é tipicamente 30% a 50% menor que a construção imperativa equivalente. Com 35% de
redução, saem ~49 KB, e o saldo fica perto de **+60 KB**.

Isso cai na faixa do meio da régua acima: segue, **com divisão por rota aplicada**. Ou seja,
a divisão por rota deixa de ser otimização opcional e passa a ser requisito da Fase 7. Se ao
fim da Fase 6 a redução medida nos módulos de visão for muito menor que 35%, o saldo
ultrapassa +70 KB e a decisão volta à coordenação, como a régua manda.

**Medição intermediária da Fase 3**, com quatro módulos migrados e NADA removido ainda:

| Medida | Comprimido |
| --- | --- |
| JavaScript, antes de tudo | 185,4 KB |
| JavaScript, agora | **282,7 KB** |
| Saldo parcial | **+97,3 KB** |
| CSS, antes / agora | 12,5 KB / 16,6 KB |

O saldo parcial **já ultrapassa o limite de +70 KB** que esta régua declarou. Pela regra,
isso volta à coordenação — e voltou, em 25/11/2026, sem esperar a Fase 7.

Leitura honesta do número, com o que ele ainda não diz:

- Os 67,3 KB de React são piso fixo, pagos uma vez. Já estão dentro destes 97,3 KB.
- Radix e cmdk entraram inteiros por causa de quatro telas. Diálogo, popover, abas e busca
  com filtro são usados em dezenas de telas ainda por migrar, então o custo está
  concentrado no começo e não cresce na mesma proporção daqui para frente.
- **Nada foi removido.** `web/ui/`, a camada imperativa das 86 telas restantes e as regras
  substituídas de `web/styles.css` continuam todas no pacote. A economia projetada só
  aparece quando as telas saírem, não antes.
- Não há divisão por rota nenhuma: é um pacote único de 1 MB não comprimido, e o próprio
  empacotador avisa isso a cada build.

Conclusão operacional: a divisão por rota sai da Fase 7 e passa a ser **requisito da Fase
4**, junto com a casca — que é onde as rotas passam a existir de verdade e onde a divisão
é barata. Medir de novo ao fim da Fase 4 e ao fim da Fase 6; se o saldo não cair, a decisão
de continuar é do solicitante, não minha.

## D9 — Riscos

| Risco | Mitigação |
| --- | --- |
| Comportamento sensível perdido na reconstrução (barreira, revalidação, guarda) | Migrar um módulo por vez com os testes de comportamento existentes verdes; VIS-018 |
| Migração longa sem entrega visível | Fase 4 antes da 5; cada fase fecha demonstrável |
| Dois sistemas visuais convivendo e divergindo | Camada `legado` abaixo de `utilities`; token é fonte única; VIS-017 trava |
| Paleta se perder na tradução para o vocabulário shadcn | `@theme inline` sem valor literal; teste de contraste |
| Pacote pesado no celular | Corte de D8 declarado antes da medição |
| Agentes em paralelo colidindo no mesmo arquivo | Arquivos exclusivos por frente, declarados na tarefa; `main.ts` e os tokens ficam com a coordenação |

## D10 — Paralelismo

Teto operacional observado nesta ferramenta: **duas frentes simultâneas**. Cada frente
recebe arquivos exclusivos, o contrato dos componentes e a evidência esperada — não a
investigação inteira. `web/main.ts`, os tokens e a ponte permanecem com a coordenação:
são os pontos de colisão. O teto sobe se as duas primeiras frentes fecharem sem conflito.
