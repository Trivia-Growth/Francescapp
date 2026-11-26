# Proposal

## Why

Em 21/11/2026 o solicitante pediu um frontend bonito, com "expectativa de sistema luxuoso", transições e
animações, e destacou que **a tela de login precisa ser bonita porque é o primeiro contato da família**.

A avaliação por evidência renderizada está em
[docs/processo/avaliacao-visual-21-11-2026.md](../../../docs/processo/avaliacao-visual-21-11-2026.md): 94
capturas em 1280/1440/360/390 com dublê de API e dados fictícios. Resposta honesta à pergunta do solicitante:
**hoje não parece luxuoso.** Não por falta de polimento difuso, e sim por cinco causas concretas e citáveis —
ausência de sistema de espaçamento, escala tipográfica com 22 tamanhos, mesmos seletores redefinidos em
blocos empilhados em `web/styles.css`, quatro linguagens de aba distintas e um defeito de contraste que torna
o rótulo da aba ativa da Administração **ilegível** (`web/styles.css:1423-1427` contra `:2608-2611`).

O contexto de negócio recebido (case management de famílias em tratamento de saúde mental; diferencial na
restauração das relações familiares; slogan *"Nós ESTAMOS para que você SEJA"*; tom afetuoso que evita termo
clínico pesado; clientela de consultoria premium) define o sentido de "luxo" aqui: **contenção, não
ostentação**. Quem abre o acesso pode ser uma família em crise às duas da manhã. Espaço, silêncio visual e
tipografia que respira servem a essa pessoa; movimento decorativo, celebração e métrica de engajamento não.

## What Changes

- Introduzir uma **camada de fundamentos tokenizada** em `web/styles.css`: escala tipográfica modular única,
  escala de espaçamento, papéis de cor e tokens de movimento. Substituir as redefinições empilhadas dos mesmos
  seletores por uma declaração por componente. Não alterar HTML semântico, rótulos, ordem de foco, `aria-*`,
  contratos ou comportamento.
- Corrigir os defeitos de contraste e de estado selecionado, começando pela aba ativa da Administração.
- Unificar as **quatro linguagens de aba** em uma só, preservando papéis ARIA e navegação por teclado atuais.
- Redesenhar a composição da **tela de acesso** como primeiro contato: coluna única respirada, um caminho de
  entrada visível por vez, marca aplicada sem recorte nem transparência simulada, aviso de ambiente deslocado
  para depois do bloco de acesso, e uma única sequência de entrada em movimento.
- Definir um **vocabulário de movimento** curto e explícito (durações, curvas, gatilhos) e registrar o que
  **não** anima. Consolidar `prefers-reduced-motion` em um bloco único.
- Tratar a **densidade por audiência** sem criar duas interfaces: mesma paleta, escala e movimento; varia a
  quantidade de informação por tela e o peso dos controles de escrita.
- Dar estrutura aos **estados de carregamento, vazio e erro** (ação adjacente, âncora visual, copy em voz de
  produto) e à leitura de registros longos (Diário, Ficha de plantão).

**Fora de escopo.** Nenhuma mudança de autenticação, autorização, audiência, rotas, contratos, migração ou
integração. Nenhum framework, biblioteca de animação, fonte remota ou dependência nova. Nenhuma identidade
Trivia ou HED. Nenhuma variante de logo inventada, transparência simulada ou redesenho do símbolo. Nenhuma
remoção de rótulo, aviso de audiência, confirmação de descarte ou controle de segurança para acomodar layout.

**Pendências que limitam o que é honesto prometer:** não há logo vetorial nem PNG transparente, e não há
fontes oficiais da marca (`docs/projeto/identidade-visual.md`, seção Pendências). Cormorant Garamond e
Raleway permanecem provisórias. O acabamento final de marca depende do material do marketing da Edilaine.

## Capabilities

### Modified Capabilities

- `interface-e-navegacao`: acrescenta fundamentos tokenizados, primeiro contato, vocabulário de movimento,
  densidade por audiência, estados com ação e leitura de registros longos. Os requisitos VIS-001 a VIS-010 de
  `redesenhar-interface-ffcmapp` permanecem válidos e não são reescritos; esta change adiciona VIS-011 a
  VIS-017.

Nenhuma regra funcional de domínio é alterada. IDs FR/SC e fases Inicial/Evolução das demais capabilities
permanecem intactos. O maior FR do projeto continua **FR-088**; esta change não cria FR novo porque não
introduz requisito funcional de domínio — o contrato é de apresentação, numerado na família VIS.

## Impact

Arquivos previstos: `web/styles.css` (camada de fundamentos e consolidação), `web/index.html` (composição da
tela de acesso e ordem do aviso de ambiente), e os módulos de apresentação estritamente necessários para
densidade e estados (`web/ficha-paciente.ts`, `web/diario.ts`, `web/main.ts` na montagem de "Mais seções").
Nenhum arquivo de `supabase/`, `packages/contracts/` ou `netlify/`.

Evidência esperada por fatia: capturas antes/depois nas quatro larguras, medição de contraste das composições
alteradas, conferência com `prefers-reduced-motion` ativo, `pnpm run verificar:rapido` no diff e revisão
formal com `code-review`. Provas de autorização/RLS continuam gate de ativação e **não** são substituídas por
nenhuma evidência visual.

Bancada temporária usada no diagnóstico (`scripts/prova-celular/_avaliacao-visual.pw.ts` e
`scripts/prova-celular/_fixtures-avaliacao.ts`) deve ser removida antes de qualquer implementação; ela não
pertence a `pnpm run verificar:celular`.

Decisões não confirmadas pelo solicitante estão marcadas **SUPOSIÇÃO CONSERVADORA** em `design.md` e precisam
de confirmação antes de virar tarefa de produção.
