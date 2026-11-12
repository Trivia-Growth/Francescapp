\set ON_ERROR_STOP on
-- Prova local da linha do tempo do caso (FR-007). PostgreSQL descartável; Auth, Vault e
-- assinatura são fixtures fictícias e não comprovam serviço real. Toda chamada passa pelo
-- wrapper api.*, que executa como o papel dono, então grants e políticas são exercitados.
\ir cadeia_migrations_local.sql
-- `ator_auth_id` da auditoria: a trilha de quem autentica sem perfil depende dela.
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
-- Sessão familiar sem concessão de equipe: a trilha familiar depende dela, não de uma
-- sessão de equipe disfarçada.
\ir ../migrations/20261111160000_admissao_familiar_privada.sql
-- As fontes agregadas pela linha do tempo.
\ir ../migrations/20261106220000_anamnese_versoes_privadas.sql
\ir ../migrations/20261107120000_plano_cuidado_versoes_privadas.sql
\ir ../migrations/20261111140000_tarefa_cuidado_versoes_privadas.sql
-- `acompanhamento_caso` depende do papel dono da edição de paciente, criado aqui.
\ir ../migrations/20261109100000_editar_paciente_privado.sql
\ir ../migrations/20261109110000_barreira_edicao_paciente_privada.sql
\ir ../migrations/20261109130000_edicao_paciente_composicao.sql
\ir ../migrations/20261110200000_edicao_paciente_wrappers_privados.sql
\ir ../migrations/20261113100000_acompanhamento_caso.sql
\ir ../migrations/20261117100000_encaminhamento_versoes_privadas.sql
\ir ../migrations/20261117130000_orientacao_versoes_privadas.sql
\ir ../migrations/20261117200000_saude_versoes_privadas.sql
\ir ../migrations/20261117300000_contexto_cuidado_versoes_privadas.sql
\ir ../migrations/20261117330000_rede_cuidado_versoes_privadas.sql
\ir ../migrations/20261118200000_diario_versoes_privadas.sql
\ir ../migrations/20261118300000_sinal_operacional_caso.sql
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261117410000_configuracao_sistema_operacoes_privadas.sql
\ir ../migrations/20261119110000_configuracao_sistema_opcoes.sql
\ir ../migrations/20261119320000_regras_atendimento_publicas.sql
\ir ../migrations/20261120110000_documento_caso_privado.sql
\ir ../migrations/20261120300000_linha_tempo_caso.sql
\ir ../migrations/20261120310000_linha_tempo_operacoes_privadas.sql

-- Antes do grant, nenhum papel do PostgREST alcança o wrapper nem o derivador.
do $$
declare papel text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.linha_tempo_operacao_privada(jsonb)','execute')
   or has_function_privilege(papel,'cadastro.linha_tempo_caso(uuid,uuid,boolean,timestamptz,timestamptz,text[],uuid,timestamptz,uuid,integer)','execute') then
   raise exception 'ACESSO_INDEVIDO: %', papel;
  end if;
 end loop;
 -- Nenhum dos dois owners enxerga envelope cifrado de fonte alguma, nem o nome do paciente.
 if has_column_privilege('ffcmapp_linha_tempo_owner','cadastro.diario_registro_versao','conteudo_cifrado','SELECT')
  or has_column_privilege('ffcmapp_linha_tempo_owner','cadastro.documento_caso_versao','conteudo_cifrado','SELECT')
  or has_column_privilege('ffcmapp_linha_tempo_owner','cadastro.saude_versao','conteudo_cifrado','SELECT')
  or has_column_privilege('ffcmapp_linha_tempo_owner','cadastro.tarefa_cuidado_versao','conteudo_cifrado','SELECT')
  or has_column_privilege('ffcmapp_linha_tempo_owner','cadastro.anamnese_versao','conteudo_cifrado','SELECT')
  or has_table_privilege('ffcmapp_linha_tempo_owner','cadastro.paciente','SELECT')
  or has_column_privilege('ffcmapp_linha_tempo_leitura_owner','cadastro.paciente','nome_cifrado','SELECT')
  or has_table_privilege('ffcmapp_linha_tempo_leitura_owner','cadastro.diario_registro_versao','SELECT')
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
    where r.rolname in ('ffcmapp_linha_tempo_owner','ffcmapp_linha_tempo_leitura_owner')) then
  raise exception 'OWNER_NAO_ISOLADO';
 end if;
end $$;

\ir ../migrations/20261120320000_grant_linha_tempo_teste.sql

do $$ begin
 if not has_function_privilege('authenticated','api.linha_tempo_operacao_privada(jsonb)','execute') then
  raise exception 'GRANT_NAO_APLICADO';
 end if;
 if has_function_privilege('anon','api.linha_tempo_operacao_privada(jsonb)','execute')
  or has_function_privilege('service_role','api.linha_tempo_operacao_privada(jsonb)','execute')
  or has_function_privilege('authenticated','cadastro.linha_tempo_caso(uuid,uuid,boolean,timestamptz,timestamptz,text[],uuid,timestamptz,uuid,integer)','execute') then
  raise exception 'GRANT_AMPLO_DEMAIS';
 end if;
 begin
  perform api.linha_tempo_operacao_privada('{}'::jsonb);
  raise exception 'ENTRADA_INVALIDA_ACEITA';
 exception when insufficient_privilege then null;
 end;
end $$;

--   ...0001 Administrador · ...0002 Profissional com acesso · ...0003 Profissional sem acesso
--   ...0004 Família com acesso · ...0005 Família de outro caso
insert into vault.segredos_fixture values ('ffcmapp.atestado.teste',encode(decode(repeat('42',32),'hex'),'base64'));
insert into identidade.referencias_atestado_vault(referencia) values ('ffcmapp.atestado.teste');
insert into identidade.configuracao_auth_nativo(dominio_workspace,google_unico_oauth_confirmado) values ('example.test',true);
insert into auth.users values
 ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004'),
 ('10000000-0000-4000-8000-000000000005');
insert into public.usuario(id,perfil) values
 ('10000000-0000-4000-8000-000000000001','administrador'),
 ('10000000-0000-4000-8000-000000000002','profissional'),
 ('10000000-0000-4000-8000-000000000003','profissional'),
 ('10000000-0000-4000-8000-000000000004','familia'),
 ('10000000-0000-4000-8000-000000000005','familia');
insert into auth.identities select id,id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')) from auth.users;
insert into auth.sessions select replace(id::text,'10000000-','20000000-')::uuid,id,null from auth.users;
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
select replace(id::text,'10000000-','30000000-')::uuid,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}','fixture-'||id,perfil,'google_workspace','vinculada',id,'google-'||id,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',now()-interval '1 day',now()
from public.usuario where perfil in ('administrador','profissional');
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
select replace(id::text,'10000000-','20000000-')::uuid,id,replace(id::text,'10000000-','30000000-')::uuid,1,'google_workspace'
from public.usuario where perfil in ('administrador','profissional');
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
select replace(id::text,'10000000-','20000000-')::uuid,id,null,null,'familia'
from public.usuario where perfil='familia';

insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('40000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001');
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values
 ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'),
 ('50000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'),
 ('50000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');

create function public.assinar_linha_fixture(e jsonb, acao text, ator uuid, sessao uuid) returns jsonb language plpgsql as $$
declare entrada text:=e::text; d jsonb; texto text; mac text;
begin
 d:=jsonb_build_object('key_id','teste','usuario_id',ator,'session_id',sessao,'request_id',e->>'request_id','operacao',acao,'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=d::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;

create function public.claims_linha_fixture(ator uuid, sessao uuid, metodo text) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,
   'amr',jsonb_build_array(jsonb_build_object('method',metodo)))::text,true)::void;
$$;

create function public.envelope_linha_fixture() returns jsonb language sql immutable as $$
 select jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
$$;

create function public.ler_linha(ator uuid, sessao uuid, metodo text, filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
 perform public.claims_linha_fixture(ator,sessao,metodo);
 r:=api.linha_tempo_operacao_privada(public.assinar_linha_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001')||filtros,
   'api.ler_linha_tempo',ator,sessao));
 return r;
end $$;

-- Fontes do caso, gravadas direto nas tabelas: o alvo desta prova é o derivador e a
-- audiência, não a escrita de cada fatia, que tem prova própria.
insert into cadastro.anamnese_versao(id,paciente_id,versao,conteudo_cifrado,criado_por_usuario_id,criado_em)
 values (gen_random_uuid(),'40000000-0000-4000-8000-000000000001',1,public.envelope_linha_fixture(),'10000000-0000-4000-8000-000000000002',now()-interval '10 days');
insert into cadastro.saude_versao(id,paciente_id,versao,conteudo_cifrado,criado_por_usuario_id,criado_em)
 values (gen_random_uuid(),'40000000-0000-4000-8000-000000000001',1,public.envelope_linha_fixture(),'10000000-0000-4000-8000-000000000003',now()-interval '9 days');

-- Diário: rascunho do profissional 2, publicado só para equipe, publicado para família,
-- e uma retificação do publicado para família.
insert into cadastro.diario_registro(id,paciente_id,tipo,autor_usuario_id,criado_em) values
 ('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','evolucao_profissional','10000000-0000-4000-8000-000000000002',now()-interval '8 days'),
 ('60000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','evolucao_profissional','10000000-0000-4000-8000-000000000002',now()-interval '7 days'),
 ('60000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','evolucao_profissional','10000000-0000-4000-8000-000000000002',now()-interval '6 days'),
 ('60000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','relato_familiar','10000000-0000-4000-8000-000000000004',now()-interval '5 days');
insert into cadastro.diario_registro_versao(id,diario_registro_id,versao,versao_esperada,estado,audiencia,conteudo_cifrado,justificativa_cifrada,criado_por_usuario_id,criado_em) values
 ('61000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1,null,'rascunho','equipe',public.envelope_linha_fixture(),null,'10000000-0000-4000-8000-000000000002',now()-interval '8 days'),
 ('61000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',1,null,'publicado','equipe',public.envelope_linha_fixture(),null,'10000000-0000-4000-8000-000000000002',now()-interval '7 days'),
 ('61000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000003',1,null,'publicado','equipe_e_familia',public.envelope_linha_fixture(),null,'10000000-0000-4000-8000-000000000002',now()-interval '6 days'),
 ('61000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000003',2,1,'retificado','equipe_e_familia',public.envelope_linha_fixture(),public.envelope_linha_fixture(),'10000000-0000-4000-8000-000000000002',now()-interval '4 days'),
 ('61000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000004',1,null,'publicado','equipe',public.envelope_linha_fixture(),null,'10000000-0000-4000-8000-000000000004',now()-interval '5 days');

-- Documentos: um para equipe, um para família, um removido.
insert into cadastro.documento_caso(id,paciente_id,criado_por_usuario_id,criado_em) values
 ('70000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',now()-interval '3 days'),
 ('70000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',now()-interval '3 days'),
 ('70000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',now()-interval '3 days');
insert into cadastro.documento_caso_versao(id,documento_id,paciente_id,versao,versao_esperada,categoria,origem,data_documento,audiencia,estado,conteudo_cifrado,criado_por_usuario_id,criado_em) values
 ('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,null,'laudos','Clinica X',current_date-40,'equipe','disponivel',public.envelope_linha_fixture(),'10000000-0000-4000-8000-000000000002',now()-interval '3 days'),
 ('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',1,null,'termos',null,current_date-30,'equipe_e_familia','indisponivel',public.envelope_linha_fixture(),'10000000-0000-4000-8000-000000000002',now()-interval '2 days'),
 ('71000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001',1,null,'exames',null,current_date-20,'equipe_e_familia','removido',public.envelope_linha_fixture(),'10000000-0000-4000-8000-000000000002',now()-interval '1 day');

-- 1. Profissional com acesso vê todas as fontes, e cada tipo de evento é distinguido.
do $$
#variable_conflict use_variable
declare r jsonb; itens jsonb;
begin
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth');
 if r->>'ok' is distinct from 'true' then raise exception 'PROFISSIONAL_NEGADO: %',r; end if;
 itens:=r#>'{dados,itens}';
 -- 2 fatias versionadas + 5 versões de diário + 2 documentos visíveis (o removido sai).
 if jsonb_array_length(itens) <> 9 then raise exception 'TOTAL_INESPERADO: %',itens; end if;
 if exists(select 1 from jsonb_array_elements(itens) i where i->>'id'='71000000-0000-4000-8000-000000000003') then
  raise exception 'DOCUMENTO_REMOVIDO_VISIVEL';
 end if;
 -- FR-007: acontecimento, registro e retificação distinguidos.
 if (select i->>'tipo_evento' from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000001') is distinct from 'rascunho'
  or (select i->>'tipo_evento' from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000003') is distinct from 'registro'
  or (select i->>'tipo_evento' from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000004') is distinct from 'retificacao' then
  raise exception 'TIPO_EVENTO: %',itens;
 end if;
 -- A versão anterior continua na linha do tempo depois da retificação (FR-012).
 if not exists(select 1 from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000003') then
  raise exception 'VERSAO_ANTERIOR_APAGADA';
 end if;
 -- Acontecimento em claro só onde a fatia o pôs em claro.
 if (select i->>'aconteceu_em' from jsonb_array_elements(itens) i where i->>'id'='71000000-0000-4000-8000-000000000001') is distinct from to_char(current_date-40,'YYYY-MM-DD')
  or (select i->>'aconteceu_em' from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000003') is not null then
  raise exception 'ACONTECIMENTO: %',itens;
 end if;
 -- Indisponibilidade é identificada, não escondida (FR-029/SC-010).
 if (select i#>>'{detalhe,estado}' from jsonb_array_elements(itens) i where i->>'id'='71000000-0000-4000-8000-000000000002') is distinct from 'indisponivel' then
  raise exception 'INDISPONIVEL_NAO_MARCADO: %',itens;
 end if;
 -- Ordem decrescente por registro.
 if (select i->>'id' from jsonb_array_elements(itens) i limit 1) is distinct from '71000000-0000-4000-8000-000000000002' then
  raise exception 'ORDEM: %',itens;
 end if;
 if not exists(select 1 from auditoria.evento where acao='api.ler_linha_tempo' and resultado='permitido') then
  raise exception 'AUDITORIA_AUSENTE';
 end if;
end $$;

-- 2. Rascunho é privado do autor: outro profissional não o vê, nem como metadado.
do $$
#variable_conflict use_variable
declare r jsonb;
begin
 insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
  values (gen_random_uuid(),'40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
 r:=public.ler_linha('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','oauth');
 if r->>'ok' is distinct from 'true' then raise exception 'OUTRO_PROFISSIONAL_NEGADO: %',r; end if;
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'id'='61000000-0000-4000-8000-000000000001') then
  raise exception 'RASCUNHO_ALHEIO_VISIVEL';
 end if;
 if jsonb_array_length(r#>'{dados,itens}') <> 8 then raise exception 'TOTAL_OUTRO: %',r#>'{dados,itens}'; end if;
end $$;

-- 3. Família: só diário 'equipe_e_familia' publicado/retificado, o que ela escreveu, e
-- documento 'equipe_e_familia'. Nenhuma outra fatia aparece NEM COMO METADADO.
do $$
#variable_conflict use_variable
declare r jsonb; itens jsonb;
begin
 r:=public.ler_linha('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','password');
 if r->>'ok' is distinct from 'true' then raise exception 'FAMILIA_NEGADA: %',r; end if;
 itens:=r#>'{dados,itens}';
 if r#>>'{dados,papel}' is distinct from 'familia' then raise exception 'PAPEL: %',r; end if;
 -- 2 versões do registro equipe_e_familia + o próprio relato + 1 documento = 4.
 if jsonb_array_length(itens) <> 4 then raise exception 'FAMILIA_TOTAL: %',itens; end if;
 if exists(select 1 from jsonb_array_elements(itens) i where i->>'fonte' not in ('diario','documento')) then
  raise exception 'FAMILIA_VE_OUTRA_FONTE: %',itens;
 end if;
 if exists(select 1 from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000002') then
  raise exception 'FAMILIA_VE_DIARIO_DE_EQUIPE';
 end if;
 if exists(select 1 from jsonb_array_elements(itens) i where i->>'id'='71000000-0000-4000-8000-000000000001') then
  raise exception 'FAMILIA_VE_DOCUMENTO_DE_EQUIPE';
 end if;
 if exists(select 1 from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000001') then
  raise exception 'FAMILIA_VE_RASCUNHO';
 end if;
end $$;

-- 4. Família de outro caso: negada, com auditoria de negativa e nenhum dado.
do $$
#variable_conflict use_variable
declare r jsonb; req uuid:=gen_random_uuid();
begin
 perform public.claims_linha_fixture('10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','password');
 r:=api.linha_tempo_operacao_privada(public.assinar_linha_fixture(
   jsonb_build_object('request_id',req,'paciente_id','40000000-0000-4000-8000-000000000001'),
   'api.ler_linha_tempo','10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005'));
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then
  raise exception 'OUTRA_FAMILIA_ALCANCOU: %',r;
 end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='negado' and acao='api.ler_linha_tempo') then
  raise exception 'AUDITORIA_NEGATIVA_AUSENTE';
 end if;
end $$;

-- 5. Filtros: período, fonte e autor.
do $$
#variable_conflict use_variable
declare r jsonb; corte text;
begin
 -- O corte sai do próprio dado, não de `now()`: as fontes foram gravadas em transações
 -- anteriores e comparar com um `now()` novo tornaria a asserção instável.
 select to_char(v.criado_em - interval '1 second','YYYY-MM-DD"T"HH24:MI:SS.USOF') into corte
  from cadastro.documento_caso_versao v where v.id='71000000-0000-4000-8000-000000000002';
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
   jsonb_build_object('fontes',jsonb_build_array('documento')));
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'fonte'<>'documento')
  or jsonb_array_length(r#>'{dados,itens}')<>2 then raise exception 'FILTRO_FONTE: %',r#>'{dados,itens}'; end if;
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
   jsonb_build_object('autor_usuario_id','10000000-0000-4000-8000-000000000003'));
 if jsonb_array_length(r#>'{dados,itens}')<>1
  or (r#>>'{dados,itens,0,fonte}') is distinct from 'saude' then raise exception 'FILTRO_AUTOR: %',r#>'{dados,itens}'; end if;
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
   jsonb_build_object('de',corte));
 -- Nada antes do corte, e o que está depois continua lá: o filtro recorta, não esvazia.
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where (i->>'registrado_em')::timestamptz < corte::timestamptz) then
  raise exception 'FILTRO_PERIODO: %',r#>'{dados,itens}';
 end if;
 if not exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'id'='71000000-0000-4000-8000-000000000002') then
  raise exception 'FILTRO_PERIODO_CORTOU_DEMAIS: %',r#>'{dados,itens}';
 end if;
 -- Fonte inexistente é entrada inválida, não lista vazia silenciosa.
 begin
  r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
    jsonb_build_object('fontes',jsonb_build_array('inventada')));
  raise exception 'FONTE_INVALIDA_ACEITA';
 exception when invalid_parameter_value then null;
 end;
 -- Período invertido é entrada inválida.
 begin
  r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
    jsonb_build_object('de',to_char(now(),'YYYY-MM-DD"T"HH24:MI:SSOF'),'ate',to_char(now()-interval '1 day','YYYY-MM-DD"T"HH24:MI:SSOF')));
  raise exception 'PERIODO_INVERTIDO_ACEITO';
 exception when invalid_parameter_value then null;
 end;
end $$;

-- 6. Paginação: o cursor devolve a página seguinte sem repetir nem pular item.
do $$
#variable_conflict use_variable
declare r jsonb; cursor_em text; cursor_id text; primeiros jsonb; segundos jsonb;
begin
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
   jsonb_build_object('limite',4));
 primeiros:=r#>'{dados,itens}';
 if jsonb_array_length(primeiros)<>4 or r#>>'{dados,proximo_cursor}' is null then
  raise exception 'PAGINA_1: %',r#>'{dados}';
 end if;
 cursor_em:=r#>>'{dados,proximo_cursor,registrado_em}'; cursor_id:=r#>>'{dados,proximo_cursor,id}';
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
   jsonb_build_object('limite',4,'cursor_em',cursor_em,'cursor_id',cursor_id));
 segundos:=r#>'{dados,itens}';
 if jsonb_array_length(segundos)<>4 then raise exception 'PAGINA_2: %',segundos; end if;
 if exists(select 1 from jsonb_array_elements(primeiros) a join jsonb_array_elements(segundos) b on a->>'id'=b->>'id') then
  raise exception 'PAGINA_REPETIDA';
 end if;
end $$;

-- 7. Revogação do acesso fecha a linha do tempo na hora.
do $$
#variable_conflict use_variable
declare r jsonb;
begin
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),
   revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',
   motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'
  where usuario_id='10000000-0000-4000-8000-000000000002' and paciente_id='40000000-0000-4000-8000-000000000001';
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth');
 if r->>'ok' is distinct from 'false' or r ? 'dados' then raise exception 'REVOGACAO_IGNORADA: %',r; end if;
 update cadastro.acesso_paciente set revogada_em=null, revogado_por_usuario_id=null, motivo_revogacao_cifrado=null
  where usuario_id='10000000-0000-4000-8000-000000000002' and paciente_id='40000000-0000-4000-8000-000000000001';
end $$;

-- 8. Sessão encerrada, MAC falso e perfil sem vínculo são recusados.
do $$
#variable_conflict use_variable
declare r jsonb; t jsonb;
begin
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id='20000000-0000-4000-8000-000000000002';
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth');
 if r->>'ok' is distinct from 'false' then raise exception 'SESSAO_ENCERRADA_ACEITA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id='20000000-0000-4000-8000-000000000002';
 perform public.claims_linha_fixture('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth');
 t:=public.assinar_linha_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001'),
   'api.ler_linha_tempo','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
 begin
  perform api.linha_tempo_operacao_privada(jsonb_set(t,'{entrada,atestado,mac}',to_jsonb(repeat('z',43))));
  raise exception 'MAC_FALSO_ACEITO';
 exception when insufficient_privilege then null;
 end;
 -- Administrador sem acesso individual alcança o caso (exceção aprovada da carteira completa).
 r:=public.ler_linha('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','oauth');
 if r->>'ok' is distinct from 'true' then raise exception 'ADMINISTRADOR_NEGADO: %',r; end if;
end $$;

-- 9. Quem autentica sem perfil é auditado por `ator_auth_id`, sem criar usuário.
do $$
#variable_conflict use_variable
declare r jsonb; req uuid:=gen_random_uuid(); sem_perfil uuid:='10000000-0000-4000-8000-00000000000f';
begin
 insert into auth.users values (sem_perfil);
 insert into auth.sessions values ('20000000-0000-4000-8000-00000000000f',sem_perfil,null);
 perform public.claims_linha_fixture(sem_perfil,'20000000-0000-4000-8000-00000000000f','oauth');
 r:=api.linha_tempo_operacao_privada(public.assinar_linha_fixture(
   jsonb_build_object('request_id',req,'paciente_id','40000000-0000-4000-8000-000000000001'),
   'api.ler_linha_tempo',sem_perfil,'20000000-0000-4000-8000-00000000000f'));
 if r->>'ok' is distinct from 'false' then raise exception 'SEM_PERFIL_ACEITO: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=sem_perfil and resultado='negado') then
  raise exception 'AUDITORIA_AUTH_AUSENTE';
 end if;
 if exists(select 1 from public.usuario where id=sem_perfil) then raise exception 'USUARIO_CRIADO'; end if;
end $$;

do $$ begin raise notice 'LINHA_TEMPO_OK'; end $$;
