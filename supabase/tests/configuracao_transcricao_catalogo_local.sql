\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261117410000_configuracao_sistema_operacoes_privadas.sql
\ir ../migrations/20261119110000_configuracao_sistema_opcoes.sql
\ir ../migrations/20261119140000_configuracao_transcricao.sql
create temporary table migration_catalogo_fixture as select pg_read_file(:'migration_path') as sql;
do $$
declare antes jsonb; depois jsonb; original jsonb; publicadas jsonb:='["openai/whisper-large-v3","openai/whisper-large-v3-turbo"]'; modelo text;
begin
 select opcoes into original from identidade.configuracao_sistema where chave='ffcm.transcricao.modelo';
 -- Os dois modelos publicados preservam escolha, autoria, versão, timestamps e flags.
 foreach modelo in array array['openai/whisper-large-v3','openai/whisper-large-v3-turbo'] loop
  update identidade.configuracao_sistema set opcoes=original,valor=to_jsonb(modelo) where chave='ffcm.transcricao.modelo';
  select jsonb_agg(to_jsonb(c) order by chave) into antes from identidade.configuracao_sistema c;
  execute (select sql from migration_catalogo_fixture);
  select jsonb_agg(case when chave='ffcm.transcricao.modelo' then to_jsonb(c)||jsonb_build_object('opcoes',original) else to_jsonb(c) end order by chave) into depois from identidade.configuracao_sistema c;
  if antes is distinct from depois or (select opcoes from identidade.configuracao_sistema where chave='ffcm.transcricao.modelo') is distinct from publicadas then
   raise exception 'POSITIVO_ALTEROU_ESTADO_INDEVIDO';
  end if;
 end loop;
 -- Escolha legada não é corrigida silenciosamente: execução inteira aborta sem mutação.
 update identidade.configuracao_sistema set opcoes=original,valor='"groq/whisper-large-v3"'::jsonb where chave='ffcm.transcricao.modelo';
 select jsonb_agg(to_jsonb(c) order by chave) into antes from identidade.configuracao_sistema c;
 begin
  execute (select sql from migration_catalogo_fixture);
  raise exception 'MODELO_LEGADO_ACEITO';
 exception when raise_exception then
  if sqlerrm <> 'MODELO_TRANSCRICAO_NAO_PUBLICADO' then raise; end if;
 end;
 select jsonb_agg(to_jsonb(c) order by chave) into depois from identidade.configuracao_sistema c;
 if antes is distinct from depois then raise exception 'ABORT_LEGADO_ALTEROU_ESTADO'; end if;
 -- Catálogo divergente mesmo com escolha publicada exige revisão em vez de sobrescrita.
 update identidade.configuracao_sistema set opcoes=publicadas,valor='"openai/whisper-large-v3"'::jsonb where chave='ffcm.transcricao.modelo';
 select jsonb_agg(to_jsonb(c) order by chave) into antes from identidade.configuracao_sistema c;
 begin
  execute (select sql from migration_catalogo_fixture);
  raise exception 'CATALOGO_DIVERGENTE_ACEITO';
 exception when raise_exception then
  if sqlerrm <> 'CATALOGO_TRANSCRICAO_DIVERGENTE' then raise; end if;
 end;
 select jsonb_agg(to_jsonb(c) order by chave) into depois from identidade.configuracao_sistema c;
 if antes is distinct from depois then raise exception 'ABORT_DIVERGENCIA_ALTEROU_ESTADO'; end if;
 raise notice 'CATALOGO_TRANSCRICAO_OK: dois positivos, legado e divergencia preservados';
end $$;
