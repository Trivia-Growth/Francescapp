begin;
-- DIVERGÊNCIA DE TAMANHO CORRIGIDA (achado de auditoria, 20/11/2026).
--
-- `cadastro.papel_declarado_catalogo.nome` aceitava 1..120 caracteres
-- (`20261127130000_papel_declarado_catalogo.sql:12`), mas a ficha de plantão aceita papel de
-- no máximo 80 (`20261127200000_ficha_plantao.sql:133` no CHECK da tabela e `:411` na RPC).
-- Um papel com 81..120 caracteres aparecia no select da tela e a publicação falhava no parse
-- do cliente, virando `FalhaApi('servico_indisponivel')` — mensagem enganosa para o
-- profissional, que perdia a ficha sem saber o motivo.
--
-- Decisão da coordenação: alinhar o CATÁLOGO em 80. O limite da ficha está no CHECK do banco
-- e dentro da RPC canônica; estreitar o catálogo é a ponta barata e não reescreve
-- `20261127130000` nem `20261127200000`, que já foram aplicadas.
--
-- PostgreSQL não "estreita" um CHECK: o constraint é descoberto pelo seu DEFINIÇÃO (nunca
-- pelo nome suposto), conferido palavra por palavra, e só então trocado. Qualquer divergência
-- falha fechada. Nenhuma linha existente pode violar o limite novo — se violar, a migração
-- para e o caso vai à coordenação, porque truncar nome é perda de dado.
-- Rollback: alter table ... drop constraint papel_declarado_catalogo_nome_chk, depois
-- recriar o CHECK de 120 com o nome original.
do $$
declare nome_constraint text; definicao text; quantos integer; violam bigint;
begin
  select count(*) into quantos from pg_constraint
   where conrelid = 'cadastro.papel_declarado_catalogo'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%char_length%nome%';
  if quantos <> 1 then raise exception 'CHECK_NOME_PAPEL_INESPERADO: % constraints', quantos; end if;
  select conname, pg_get_constraintdef(oid) into nome_constraint, definicao from pg_constraint
   where conrelid = 'cadastro.papel_declarado_catalogo'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%char_length%nome%';
  if definicao !~ '120' or definicao ~ '\m80\M' then
    raise exception 'CHECK_NOME_PAPEL_DIVERGENTE: %', definicao;
  end if;
  select count(*) into violam from cadastro.papel_declarado_catalogo
   where char_length(btrim(nome)) > 80;
  if violam > 0 then raise exception 'PAPEL_EXISTENTE_ACIMA_DE_80: % linhas', violam; end if;
  execute format('alter table cadastro.papel_declarado_catalogo drop constraint %I', nome_constraint);
  alter table cadastro.papel_declarado_catalogo
    add constraint papel_declarado_catalogo_nome_chk
    check (char_length(btrim(nome)) between 1 and 80);
end $$;

-- LIMITAÇÃO REGISTRADA, não omissão: a pré-validação DENTRO de
-- `operacao.papel_declarado_operacao_privada` continua dizendo `between 1 and 120`, e ela
-- mora em `20261127130000`, fora da faixa desta frente. As duas pontas que o usuário alcança
-- já dizem 80 (contrato zod em `packages/contracts/src/papel-declarado.ts` e a pré-validação
-- da rota em `netlify/functions/_shared/papel-declarado-nativo.ts`), então um nome de 81..120
-- é recusado antes de chegar ao banco. Quem chamasse a RPC direto, por fora da rota, passaria
-- pela pré-validação e seria barrado pelo CHECK acima — recusa correta, mensagem pior
-- (`servico_indisponivel` em vez de `entrada_invalida`). Alinhar também a pré-validação exige
-- reescrever uma função de outra faixa de migrações e fica para a coordenação.

do $$
declare definicao text;
begin
  select pg_get_constraintdef(oid) into definicao from pg_constraint
   where conrelid = 'cadastro.papel_declarado_catalogo'::regclass
     and conname = 'papel_declarado_catalogo_nome_chk';
  if definicao is null or definicao !~ '\m80\M' or definicao ~ '120' then
    raise exception 'LIMITE_80_NAO_APLICADO: %', coalesce(definicao, '(ausente)');
  end if;
  -- O teto da ficha não pode ter mudado por baixo: os dois precisam continuar iguais.
  if (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = 'cadastro.turno_plantao_versao'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) like '%papel_declarado%') !~ '\m80\M' then
    raise exception 'TETO_DA_FICHA_DIVERGIU_DE_80';
  end if;
end $$;
commit;
