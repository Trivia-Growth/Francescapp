-- Elo isolado porque a ordem importa: `20261120370000` substitui a assinatura do derivador
-- e apaga a antiga, que `20261120340000` (exportação) ainda concede. Quem encadeia as duas
-- fatias precisa aplicar na ordem numérica real, e é por isso que este trecho não vive
-- dentro do teste da linha do tempo.
\ir ../migrations/20261120370000_linha_tempo_area_acontecimento.sql
\ir ../migrations/20261120380000_linha_tempo_filtros_area_objetivo.sql

-- A assinatura antiga some e a nova continua fora do alcance do PostgREST; o wrapper
-- segue sendo o único caminho.
do $$
declare papel text;
begin
 if to_regprocedure('cadastro.linha_tempo_caso(uuid,uuid,boolean,timestamptz,timestamptz,text[],uuid,timestamptz,uuid,integer)') is not null then
  raise exception 'ASSINATURA_ANTIGA_SOBREVIVEU';
 end if;
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'cadastro.linha_tempo_caso(uuid,uuid,boolean,timestamptz,timestamptz,text[],uuid,timestamptz,uuid,integer,text[],uuid)','execute') then
   raise exception 'DERIVADOR_EXPOSTO: %', papel;
  end if;
 end loop;
 if not has_function_privilege('authenticated','api.linha_tempo_operacao_privada(jsonb)','execute') then
  raise exception 'WRAPPER_PERDEU_GRANT';
 end if;
end $$;
