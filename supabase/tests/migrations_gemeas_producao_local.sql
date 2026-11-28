\set ON_ERROR_STOP on
-- Executar com: scripts/ensaiar-esquema-producao-local.sh ensaiar <dump> supabase/tests/migrations_gemeas_producao_local.sql
-- Parte do esquema de produção restaurado e do histórico de produção.
create temp table arquivo(nome text);
\copy arquivo from program 'ls /repo/supabase/migrations'
create temp table local_versao as select left(nome,14) versao, substr(nome,16,length(nome)-19) nome from arquivo where nome ~ '^[0-9]{14}_.*\.sql$';

-- 1. Nenhuma versão repetida no repositório.
do $$ begin
 if exists(select versao from local_versao group by versao having count(*)>1) then
  raise exception 'VERSAO_REPETIDA: %', (select string_agg(versao,',') from (select versao from local_versao group by versao having count(*)>1) d);
 end if;
 raise notice 'SEM_VERSAO_REPETIDA_OK';
end $$;

-- 2. Contraprova: sem o efeito no banco, o registro recusa (não mente sobre o estado).
\c - supabase_admin
begin;
revoke execute on function api.equipe_barreira_composicao(jsonb) from authenticated cascade;
set local role postgres;
\set ON_ERROR_STOP off
\i /repo/scripts/registrar-migrations-gemeas.sql
\set ON_ERROR_STOP on
rollback;
do $$ begin
 if exists(select 1 from supabase_migrations.schema_migrations where version in ('20261125030001','20261125040001')) then raise exception 'REGISTROU_SEM_EFEITO'; end if;
 if not has_function_privilege('authenticated','api.equipe_barreira_composicao(jsonb)','execute') then raise exception 'CONTRAPROVA_NAO_REVERTIDA'; end if;
 raise notice 'CONTRAPROVA_EFEITO_AUSENTE_OK';
end $$;

-- 3. Registro como postgres sobre o estado real de produção.
\c - postgres
\i /repo/scripts/registrar-migrations-gemeas.sql
-- Repetir recusa.
\set ON_ERROR_STOP off
\i /repo/scripts/registrar-migrations-gemeas.sql
\set ON_ERROR_STOP on

-- 4. Pendentes que o CLI enxergaria (versão local sem par no histórico): sem as gêmeas.
create temp table arquivo(nome text);
\copy arquivo from program 'ls /repo/supabase/migrations'
create temp table local_versao as select left(nome,14) versao, substr(nome,16,length(nome)-19) nome from arquivo where nome ~ '^[0-9]{14}_.*\.sql$';
do $$ declare pendentes text; begin
 select string_agg(l.versao||'_'||l.nome,', ' order by l.versao) into pendentes from local_versao l
  where not exists(select 1 from supabase_migrations.schema_migrations h where h.version=l.versao);
 if pendentes ~ '2026112503000|2026112504000' then raise exception 'GEMEA_PENDENTE: %', pendentes; end if;
 if exists(select 1 from local_versao l join supabase_migrations.schema_migrations h on h.version=l.versao where h.name is distinct from l.nome) then
  raise exception 'NOME_DIVERGENTE: %', (select string_agg(l.versao||':'||l.nome||'<>'||h.name,', ') from local_versao l join supabase_migrations.schema_migrations h on h.version=l.versao where h.name is distinct from l.nome);
 end if;
 raise notice 'HISTORICO_SEM_GEMEAS_OK (pendentes restantes: %)', coalesce(pendentes,'nenhuma');
end $$;
