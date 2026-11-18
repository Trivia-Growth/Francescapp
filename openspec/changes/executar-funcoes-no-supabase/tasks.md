# Tasks

Esta mudança **decide e planeja**. A execução da migração é fatia própria, posterior à V1 conectada (design D2), e não está autorizada por este pacote.

Nenhuma tarefa aqui autoriza deploy, criação de função no projeto Supabase, alteração de variável de ambiente, migração remota ou uso de dados reais.

## 0. Decisões

- [x] 0.1 (17/11/2026) DF-003 resolvido: execução de funções em Supabase Edge Functions com Deno; Netlify permanece com o site estático (design D1).
- [x] 0.2 (17/11/2026) Migração ocorre depois da V1 conectada, não agora (design D2).
- [x] 0.3 (17/11/2026) Transporte migra, protocolo de identidade não. Cookie selado, `x-sessao`, CSRF e atestado permanecem (design D4).
- [x] 0.4 (17/11/2026) Sem camada de abstração entre plataformas; a disciplina é manter rota fina (design D3).
- [x] 0.5 (17/11/2026) **Perda do deploy preview aceita.** D1 confirmada. O solicitante informou que trará Docker na semana seguinte para subir o Supabase local e executar os testes ali. Isso muda o quadro de verificação: hoje o notebook não tem Docker, o que limita teste conectado. A verificação da migração passa a depender desse ambiente local — se ele não existir, registrar bloqueio, não presumir.
- [x] 0.6 (17/11/2026) **Uma Edge Function por domínio**, 39 funções espelhando os arquivos atuais, cada uma parseando o próprio sufixo de caminho. Mantém a organização existente e contém o raio de impacto de um deploy a um domínio.
- [x] 0.7 (17/11/2026) **Supavisor em transaction mode**, sem pool próprio no isolate. É o recurso nativo que a diretriz de 01/11/2026 manda preferir. O cache de 30 segundos de `configuracao-servidor.ts` passa a viver por isolate e precisa ser reavaliado, e a partida a frio precisa ser **medida de novo** no ambiente novo — a medição de 13/11/2026 não se transpõe.
- [x] 0.8 (17/11/2026) **Netlify permanece como proxy de `/api/*`.** O cliente continua chamando a mesma origem e a Netlify encaminha para o Supabase.

  Fundamento, porque a alternativa parecia mais limpa: ir direto ao Supabase torna tudo origem cruzada, e o cookie de sessão — hoje selado e de mesma origem — passaria a exigir `SameSite=None`, reabrindo a superfície de CSRF que o desenho atual fechou com cookie selado, token CSRF e mesma origem. Isso é decidir o protocolo de sessão de novo, o acoplamento que D4 proíbe nesta fatia. Os cabeçalhos também permanecem num `netlify.toml` versionado, em vez de 39 funções com 39 chances de omitir um.

  Sobre desempenho: o acesso direto economiza um salto HTTP, mas estas rotas são dominadas pela ida e volta ao PostgreSQL. Se a latência do proxy se mostrar material, a investigação começa pelo banco, não por remover o proxy.

  **"Direto depois" não é continuação natural**: exige decidir o protocolo de sessão, e por isso seria mudança material própria, nunca efeito colateral desta migração.

## 1. Conter o acoplamento enquanto a migração não ocorre

Aplicável às fatias em andamento. Não exige trabalho de migração.

- [ ] 1.1 Garantir que `turno-e-execucao-do-cuidado` e `financeiro-despesa-e-repasse` escrevam rotas finas, com toda composição em `_shared/` ou `packages/cadastro/`, e nenhuma regra de negócio no arquivo de rota. Evidência: revisão da fatia confere o tamanho do arquivo de rota contra a mediana atual de ~55 linhas; desvio exige justificativa (design D3).
- [ ] 1.2 Garantir que nenhuma rota nova importe `@netlify/*` ou qualquer API proprietária. Hoje são zero importações desse tipo; manter assim. Evidência: verificação registrada na revisão da fatia.
- [ ] 1.3 Concentrar leitura de ambiente no adaptador existente, em vez de espalhar `process.env` por arquivo de rota novo. Evidência: revisão da fatia confere.

## 2. Aliviar as rotas que carregam composição

Pode ser feito agora, ainda na Netlify, com os testes atuais verdes. Reduz a superfície de migração e isola o risco (design — Migration Plan, passo 1).

- [ ] 2.1 Inspecionar `netlify/functions/concessoes-equipe.ts` — 449 linhas para 1 caminho declarado, a maior anomalia do conjunto — e mover a composição para `_shared/` ou `packages/cadastro/`. Evidência: testes existentes do domínio executados sem alteração de resultado; arquivo de rota reduzido.
- [ ] 2.2 Mesmo tratamento em `netlify/functions/acesso-paciente.ts` — 152 linhas para 2 caminhos. Evidência: idem.
- [ ] 2.3 Reconferir a medição por rota após 2.1 e 2.2 e atualizar o quadro de `design.md`. Evidência: quadro atualizado com a nova contagem.

## 3. Preparar a fatia de execução

Só começa quando 0.5 a 0.8 estiverem respondidas e a V1 estiver conectada.

- [ ] 3.1 Abrir a mudança OpenSpec da execução da migração, com as decisões de 0.5 a 0.8 já incorporadas e a ordem do `Migration Plan`. Evidência: mudança criada e validada.
- [ ] 3.2 Definir a matriz de autorização completa a ser reexecutada na plataforma nova — positiva e negativa, incluindo acesso direto ao servidor e ao banco, outro paciente, outro perfil, ausência de concessão e revogação. Registrar que nenhum teste do runtime antigo vale como evidência do estado migrado (design D5). Evidência: matriz escrita antes de qualquer rota migrar.
- [ ] 3.3 Definir o plano de segredos: o que sai das variáveis da Netlify, o que passa a segredo do projeto Supabase, o que permanece no Vault, e como a fronteira é conferida. Evidência: plano registrado; nenhuma credencial no repositório.
- [ ] 3.4 Definir os lotes por domínio e o período de operação em paralelo das duas plataformas. Evidência: lotes registrados com critério de corte por lote.

## Workflow follow-up

- Atualizar `docs/projeto/fundacao.md` resolvendo DF-003: a execução de funções deixa de ser ponto em aberto. Registrar que a prática atual na Netlify foi deriva, e que a decisão de 17/11/2026 a corrige, sem reescrever o histórico.
- Atualizar `docs/projeto/roteiro-especificacoes.md` com a posição desta migração entre as fatias — depois da V1, antes do piloto com dados reais.
- Esta mudança não tem delta de spec e declara `skip_specs: true`. Ao arquivar, não há sincronização com `openspec/specs/`.
