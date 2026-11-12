\set ON_ERROR_STOP on
-- Reaproveita a cadeia e as fixtures da configuração (usuários, sessões e o assinador).
\ir configuracao_sistema_local.sql
\ir ../migrations/20261119110000_configuracao_sistema_opcoes.sql
\ir ../migrations/20261119140000_configuracao_transcricao.sql

-- O catálogo de opções é do banco: nem o owner da operação administrativa pode mexer nele.
do $$ begin
 if has_column_privilege('ffcmapp_configuracao_sistema_owner','identidade.configuracao_sistema','opcoes','UPDATE') then
  raise exception 'OPCOES_EDITAVEIS_PELA_OPERACAO';
 end if;
 -- O leitor do servidor continua restrito às colunas de que precisa.
 if has_column_privilege('ffcmapp_configuracao_leitor_owner','identidade.configuracao_sistema','opcoes','SELECT') then
  raise exception 'LEITOR_SERVIDOR_AMPLO_DEMAIS';
 end if;
 -- Semente da transcrição: desligada, com modelo escolhido numa lista e teto de duração.
 if not exists(select 1 from identidade.configuracao_sistema
   where chave='ffcm.transcricao.ativa' and valor='false'::jsonb and exposicao='servidor') then
  raise exception 'TRANSCRICAO_NASCE_LIGADA_OU_AUSENTE';
 end if;
 if not exists(select 1 from identidade.configuracao_sistema
   where chave='ffcm.transcricao.modelo' and tipo='texto'
     and jsonb_array_length(opcoes) >= 2 and opcoes @> jsonb_build_array(valor)) then
  raise exception 'MODELO_SEM_CATALOGO';
 end if;
end $$;

do $$
#variable_conflict use_variable
declare
 administrador uuid := '10000000-0000-4000-8000-000000000001';
 sessao_admin uuid := '20000000-0000-4000-8000-000000000001';
 alvo uuid; versao_modelo integer; versao_duracao integer; e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select c.id,c.versao into alvo,versao_modelo from identidade.configuracao_sistema c where c.chave='ffcm.transcricao.modelo';

 -- A listagem entrega o catálogo de opções para a tela montar a escolha.
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_configuracao_sistema',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' then raise exception 'LISTAGEM: %',r; end if;
 if not exists(select 1 from jsonb_array_elements(r->'dados') item
   where item->>'chave'='ffcm.transcricao.modelo' and jsonb_array_length(item->'opcoes') >= 2) then
  raise exception 'OPCOES_AUSENTES_NA_LISTAGEM: %',r;
 end if;
 if not exists(select 1 from jsonb_array_elements(r->'dados') item
   where item->>'chave'='ffcm.contato.ativo' and item->'opcoes'='null'::jsonb) then
  raise exception 'OPCOES_INVENTADAS_PARA_CHAVE_LIVRE: %',r;
 end if;

 -- Valor do catálogo é aceito.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.transcricao.modelo',
  'valor','groq/whisper-large-v3','versao_esperada',versao_modelo,
  'chave_idempotencia','modelo-groq','digest_idempotencia',repeat('a',43),'auditoria_id',gen_random_uuid());
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(e,'api.gravar_configuracao_sistema',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,valor}' is distinct from 'groq/whisper-large-v3' then
  raise exception 'VALOR_DO_CATALOGO_RECUSADO: %',r;
 end if;

 -- Valor fora do catálogo é recusado: a tela escolhe, não inventa identificador de modelo.
 begin
  r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(
    jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.transcricao.modelo',
     'valor','modelo-que-nao-existe','versao_esperada',versao_modelo+1,
     'chave_idempotencia','modelo-invalido','digest_idempotencia',repeat('b',43),'auditoria_id',gen_random_uuid()),
    'api.gravar_configuracao_sistema',administrador,sessao_admin));
  raise exception 'VALOR_FORA_DO_CATALOGO_ACEITO: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;

 -- Chave sem catálogo continua livre.
 select c.versao into versao_duracao from identidade.configuracao_sistema c where c.chave='ffcm.transcricao.duracao_maxima_segundos';
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.transcricao.duracao_maxima_segundos',
    'valor',45,'versao_esperada',versao_duracao,
    'chave_idempotencia','duracao-45','digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid()),
   'api.gravar_configuracao_sistema',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,valor}' is distinct from '45' then
  raise exception 'CHAVE_LIVRE_RECUSADA: %',r;
 end if;
end $$;

-- A restrição vale no banco, não só na função: escrita direta fora do catálogo é recusada.
do $$ begin
 begin
  update identidade.configuracao_sistema set valor='"outro-modelo"'::jsonb where chave='ffcm.transcricao.modelo';
  raise exception 'CHECK_DO_BANCO_AUSENTE';
 exception when check_violation then null;
 end;
 begin
  update identidade.configuracao_sistema set opcoes='["  "]'::jsonb where chave='ffcm.transcricao.modelo';
  raise exception 'OPCAO_VAZIA_ACEITA';
 exception when check_violation then null;
 end;
end $$;
