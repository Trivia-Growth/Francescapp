# Tarefas

## 1. Persistência

- [x] 1.1 Tabela `identidade.configuracao_sistema` com uuid como identidade da linha, `chave` única como endereço legível, CHECK cruzando `tipo` e `jsonb_typeof(valor)`, RLS ligada e `revoke all from public, anon, authenticated, service_role`.
  Evidência: `supabase/migrations/20261117400000_configuracao_sistema.sql`. Semeadas duas chaves (`ffcm.contato.ativo`, `ffcm.campo_extra_plano.ativo`) com o mesmo valor que a variável de ambiente já tinha, para a troca de leitura não mudar comportamento. `atualizado_por_usuario_id` nasce nulo: ninguém editou ainda, e atribuir autoria a quem não agiu falsearia a trilha.
- [x] 1.2 Operação privada Administrador-only com atestado, auditoria em todo caminho, idempotência e owner dedicado.
  Evidência: `supabase/migrations/20261117410000_configuracao_sistema_operacoes_privadas.sql`. O bloco de autorização é o mesmo de `campo_extra_plano`, sem alteração de lógica. A trava da linha (`for update`) acontece ANTES do recibo de idempotência, porque o recibo precisa do uuid da linha e porque o replay tem de ser reconhecido antes da checagem de versão — senão o segundo envio da mesma chave bateria em `conflito` em vez de devolver o resultado anterior.
  Limitação: `grant select, update (…)` só nas colunas de valor. `chave`, `tipo`, `rotulo`, `descricao` e `exposicao` ficam fora do alcance do owner, então nem um defeito na função renomearia chave ou mudaria tipo.
- [x] 1.3 Leitor do servidor com cadeia de papéis própria.
  Evidência: `supabase/migrations/20261117420000_configuracao_sistema_leitor_servidor.sql`. `ffcmapp_configuracao_leitor_owner` (NOBYPASSRLS) tem policy `using (exposicao = 'servidor')` e grant de coluna só no que a consulta usa; `ffcmapp_configuracao_leitor_executor` só tem EXECUTE.
  Pendência operacional: a membership do papel LOGIN no executor é passo fora de migration (igual ao Vault), documentado no fim do arquivo.
- [x] 1.4 Migration de ativação no padrão `SET ROLE <owner>`, com verificação prévia do wrapper e da ACL.
  Evidência: `supabase/migrations/20261117430000_grant_configuracao_sistema_teste.sql`. O leitor do servidor NÃO é liberado por ela.

## 2. Contratos e servidor

- [x] 2.1 `packages/contracts/src/configuracao-sistema.ts` e as rotas `listarConfiguracaoSistema`/`gravarConfiguracaoSistema` em `rotas.ts`.
- [x] 2.2 Camada HTTP em quatro arquivos, espelhando o conjunto de `campo-extra-plano`: `netlify/functions/configuracao-sistema.ts` e `_shared/{entrada,compor,executor}-configuracao-sistema-nativ*.ts` mais o núcleo `configuracao-sistema-nativo.ts`.
- [x] 2.3 Leitor com janela curta de cache em `netlify/functions/_shared/configuracao-servidor.ts`: uma leitura em voo por processo, 30s de janela, e o padrão do ambiente vencendo sempre que o banco não responde ou não traz a chave no tipo certo.

## 3. Interface

- [x] 3.1 Tela de administração em `web/configuracao-sistema.ts` com editor por tipo (interruptor, texto, número, lista uma-por-linha), estados de carregando/vazio/erro/sucesso, `role="status"` com `aria-live`, rótulo ligado por `for`/`id`, ajuda por `aria-describedby`, e a autoria da última alteração ("Última alteração por … em …" ou "Ainda no valor original").
  Estilos em `web/styles.css` usando os tokens existentes, com ajuste para telas estreitas.
- [ ] 3.2 Fiação na navegação (`web/index.html` e `web/main.ts`) — NÃO feita nesta passagem por decisão de coordenação: quatro frentes mexeriam no mesmo arquivo em paralelo. O trecho exato a colar foi entregue no relatório da frente.

## 4. Migração de rotas

- [x] 4.1 `netlify/functions/contato.ts` e `netlify/functions/campo-extra-plano.ts` leem o interruptor pelo banco (`ffcm.contato.ativo`, `ffcm.campo_extra_plano.ativo`), com a variável de ambiente como padrão.
- [ ] 4.2 Os seis interruptores `= false` em código seguem como estão. Ver "Pendências explícitas" em `proposal.md`: migrar cada um exige a prova de ponta a ponta correspondente antes, senão a tela passaria a ligar caminho nunca exercitado.

## 5. Provas

- [x] 5.1 Teste SQL local: `supabase/tests/configuracao_sistema_local.sql`, executado por `scripts/testar-configuracao-sistema-local.sh` (porta 55447, banco `ffcm_cadeia_local`). Passou.
  Cobre: execução direta negada a `anon`/`authenticated`/`service_role` nas três funções; listagem; gravação com autoria e auditoria `permitido`; replay idempotente sem incrementar versão; mesma chave com digest diferente dando `conflito_idempotencia`; versão desatualizada dando `conflito` sem alterar valor e sem deixar recibo; chave inexistente dando `conflito` sem criar linha; valor de tipo errado e texto vazio dando `ENTRADA_INVALIDA`; `versao_esperada = 0` recusada; campo fora da lista branca dando `SEM_PERMISSAO`; profissional e família negados na leitura e na escrita, com auditoria `negado`; sessão encerrada negada mesmo com atestado válido; leitor do servidor enxergando só `exposicao = 'servidor'` e não conseguindo ler a tabela direto; e a migration de ativação abrindo o wrapper só para `authenticated`.
- [x] 5.2 Teste integrado handler + executor + atestado + PostgreSQL descartável: `netlify/functions/_shared/configuracao-sistema-postgres-local.test.ts`, por `scripts/testar-configuracao-sistema-integrada-local.sh` (porta 55448). Passou (1/1).
  Cobre também a semântica do leitor: banco vence o ambiente depois da gravação; chave ausente cai no padrão do ambiente nos dois sentidos; e pool inalcançável devolve o padrão do ambiente — nunca liga um serviço que estava desligado.
- [x] 5.3 `pnpm run verificar:rapido`: typecheck passou inteiro.
  Limitação registrada: o `lint` do repositório falha em dois arquivos de OUTRAS frentes em andamento (`netlify/functions/_shared/encaminhamento-postgres-local.test.ts`, formatação; `netlify/functions/_shared/entrada-documento-paciente-nativa.ts`, `lint/style/useImportType`). Todos os arquivos desta frente passam no Biome.
- [ ] 5.4 Revisão independente de dois eixos (padrões do projeto e aderência à especificação) — pendente.
- [ ] 5.5 Provas positivas e negativas de autorização em ambiente real, depois do passo operacional da membership do leitor — pendente. Nenhuma migration remota foi aplicada nesta passagem.
