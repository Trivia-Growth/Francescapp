-- Operação privilegiada: executar somente após autorização explícita do ambiente.
-- psql: -v lote_id=UUID -v responsavel_id=UUID -v identificacao=TEXTO
\set ON_ERROR_STOP on
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
select set_config('francescapp.lote_id', :'lote_id', true),
       set_config('francescapp.responsavel_id', :'responsavel_id', true),
       set_config('francescapp.identificacao', :'identificacao', true) \gset

-- Serializa configurações concorrentes, inclusive quando ainda não existe linha.
lock table operacao.configuracao_lote_teste in exclusive mode;
do $$
declare
  lote uuid := current_setting('francescapp.lote_id')::uuid;
  responsavel uuid := current_setting('francescapp.responsavel_id')::uuid;
  identificacao text := btrim(current_setting('francescapp.identificacao'));
begin
  if identificacao = '' then
    raise exception 'IDENTIFICACAO_LOTE_VAZIA';
  end if;
  if exists (select 1 from operacao.configuracao_lote_teste) then
    raise exception 'LOTE_JA_CONFIGURADO';
  end if;
  if not exists (select 1 from public.usuario where id = responsavel) then
    raise exception 'RESPONSAVEL_NAO_EXISTE';
  end if;
  insert into operacao.lote_teste (id, identificacao, responsavel_usuario_id)
  values (lote, identificacao, responsavel);
  insert into operacao.configuracao_lote_teste (lote_teste_id) values (lote);
end $$;
commit;
