\set ON_ERROR_STOP on
\ir cadeia_migrations_local.sql
-- A coluna `ator_auth_id` da auditoria vem desta migration; a fatia de transcrição a exige.
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261119120000_audio_transcricao_privado.sql
\ir ../migrations/20261119130000_audio_transcricao_operacoes_privadas.sql

-- Antes do grant, nenhum papel do PostgREST alcança o wrapper nem a tabela.
do $$
declare papel text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.transcricao_operacao_privada(jsonb)','execute')
   or has_table_privilege(papel,'cadastro.audio_transcricao','select')
   or has_table_privilege(papel,'cadastro.audio_transcricao','insert')
   or has_table_privilege(papel,'cadastro.audio_transcricao','update') then
   raise exception 'ACESSO_INDEVIDO: %', papel;
  end if;
 end loop;
 -- O owner da transcrição não enxerga o nome do paciente, não alcança outra fatia e não
 -- tem DELETE na própria tabela: o registro não é apagado, só o áudio.
 if has_column_privilege('ffcmapp_audio_transcricao_owner','cadastro.paciente','nome_cifrado','SELECT')
  or has_table_privilege('ffcmapp_audio_transcricao_owner','cadastro.audio_transcricao','DELETE')
  or has_table_privilege('ffcmapp_carteira_owner','cadastro.audio_transcricao','SELECT')
  or pg_has_role('ffcmapp_carteira_owner','ffcmapp_audio_transcricao_owner','MEMBER')
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
    join pg_roles u on u.oid=m.member where r.rolname='ffcmapp_audio_transcricao_owner') then
  raise exception 'OWNER_NAO_ISOLADO';
 end if;
 -- UPDATE existe só nas colunas do ciclo de vida: transcrição e duração são imutáveis.
 if has_column_privilege('ffcmapp_audio_transcricao_owner','cadastro.audio_transcricao','transcricao_cifrada','UPDATE')
  or has_column_privilege('ffcmapp_audio_transcricao_owner','cadastro.audio_transcricao','duracao_segundos','UPDATE')
  or has_column_privilege('ffcmapp_audio_transcricao_owner','cadastro.audio_transcricao','paciente_id','UPDATE') then
  raise exception 'UPDATE_AMPLO_DEMAIS';
 end if;
end $$;

\ir ../migrations/20261119150000_grant_audio_transcricao_teste.sql

do $$ begin
 if not has_function_privilege('authenticated','api.transcricao_operacao_privada(jsonb)','execute') then
  raise exception 'GRANT_NAO_APLICADO';
 end if;
 if has_function_privilege('anon','api.transcricao_operacao_privada(jsonb)','execute')
  or has_function_privilege('service_role','api.transcricao_operacao_privada(jsonb)','execute') then
  raise exception 'GRANT_AMPLO_DEMAIS';
 end if;
 begin
  perform api.transcricao_operacao_privada('{}'::jsonb);
  raise exception 'ENTRADA_INVALIDA_ACEITA';
 exception when insufficient_privilege then null;
 end;
end $$;

insert into vault.segredos_fixture values ('ffcmapp.atestado.teste',encode(decode(repeat('42',32),'hex'),'base64'));
insert into identidade.referencias_atestado_vault(referencia) values ('ffcmapp.atestado.teste');
insert into identidade.configuracao_auth_nativo(dominio_workspace,google_unico_oauth_confirmado) values ('example.test',true);
insert into auth.users values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000004');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000001','administrador'),('10000000-0000-4000-8000-000000000002','profissional'),('10000000-0000-4000-8000-000000000004','profissional');
insert into auth.identities select id,id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')) from auth.users;
insert into auth.sessions select replace(id::text,'10000000-','20000000-')::uuid,id,null from auth.users;
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
select replace(id::text,'10000000-','30000000-')::uuid,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}','fixture-'||id,perfil,'google_workspace','vinculada',id,'google-'||id,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',now()-interval '1 day',now() from public.usuario;
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
select replace(id::text,'10000000-','20000000-')::uuid,id,replace(id::text,'10000000-','30000000-')::uuid,1,'google_workspace' from public.usuario;

create function public.assinar_transcricao_fixture(e jsonb, acao text, ator uuid, sessao uuid) returns jsonb language plpgsql as $$
declare entrada text:=e::text; d jsonb; texto text; mac text;
begin
 d:=jsonb_build_object('key_id','teste','usuario_id',ator,'session_id',sessao,'request_id',e->>'request_id','operacao',acao,'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=d::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;

create function public.envelope_fixture(marca text) returns jsonb language sql immutable as $$
 select jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext',marca,'tag',repeat('a',22));
$$;

insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('40000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001');

-- Caminho feliz completo: registrar, ouvir, confirmar revisão, excluir, repetir exclusão.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; registro uuid:='50000000-0000-4000-8000-000000000001';
 req uuid:=gen_random_uuid(); e jsonb; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'registro_id',registro,
  'audio',jsonb_build_array(public.envelope_fixture('YQ'),public.envelope_fixture('Yg')),
  'transcricao',public.envelope_fixture('dHh0'),'mime','audio/webm','duracao_segundos',12,
  'modelo','openai/whisper-large-v3','chave_idempotencia','chave-transcricao','digest_idempotencia',repeat('a',43),
  'aad',jsonb_build_object('tabela','cadastro.audio_transcricao','paciente_id',paciente::text,'registro_id',registro::text,'parte',0,'campo','transcricao','formato',1));
 t:=public.assinar_transcricao_fixture(e,'api.registrar_audio_transcricao',ator,sessao);
 r:=api.transcricao_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,audio_id}' is distinct from registro::text
  or r#>>'{dados,exclusao_estado}' is distinct from 'nao_solicitada'
  or r#>>'{dados,modelo}' is distinct from 'openai/whisper-large-v3' then raise exception 'REGISTRO: %',r; end if;
 -- Gravação nunca devolve o áudio: só a leitura devolve.
 if r#>'{dados,audio}' is distinct from 'null'::jsonb then raise exception 'AUDIO_VAZADO_NA_ESCRITA: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido' and acao='api.registrar_audio_transcricao') then raise exception 'AUDITORIA_AUSENTE'; end if;
 -- Expira em 30 dias (prazo do áudio abandonado).
 if not exists(select 1 from cadastro.audio_transcricao where id=registro
   and expira_em between clock_timestamp()+interval '29 days' and clock_timestamp()+interval '31 days') then
  raise exception 'PRAZO_ABANDONO_AUSENTE';
 end if;
 -- Reenvio da mesma chave devolve o mesmo registro, sem criar segundo áudio.
 r:=api.transcricao_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true'
  or r#>>'{dados,audio_id}' is distinct from registro::text then raise exception 'REPLAY: %',r; end if;
 if (select count(*) from cadastro.audio_transcricao where paciente_id=paciente) <> 1 then raise exception 'REPLAY_DUPLICOU'; end if;
 -- Mesma chave com conteúdo diferente é conflito, nunca sobrescrita silenciosa.
 r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(jsonb_set(e,'{digest_idempotencia}',to_jsonb(repeat('b',43))),'api.registrar_audio_transcricao',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'CONFLITO_IDEMPOTENCIA: %',r; end if;

 -- Leitura devolve o original para ouvir durante a revisão.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro);
 r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(e,'api.ler_audio_transcricao',ator,sessao));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,audio}') is distinct from 2
  or r#>>'{dados,revisao_confirmada_em}' is not null then raise exception 'LEITURA: %',r; end if;

 -- Excluir antes de confirmar a revisão é recusado: gerar rascunho não dispara exclusão.
 r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro),
   'api.excluir_audio_transcricao',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'EXCLUSAO_SEM_REVISAO: %',r; end if;
 if exists(select 1 from cadastro.audio_transcricao where id=registro and audio_cifrado is null) then
  raise exception 'AUDIO_APAGADO_SEM_REVISAO';
 end if;

 -- Confirmar a revisão: ato humano, deixa a exclusão pendente (nunca concluída).
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,
  'texto_revisado',public.envelope_fixture('cmV2'),'chave_idempotencia','chave-revisao','digest_idempotencia',repeat('c',43),
  'aad',jsonb_build_object('tabela','cadastro.audio_transcricao','paciente_id',paciente::text,'registro_id',registro::text,'parte',0,'campo','texto_revisado','formato',1));
 t:=public.assinar_transcricao_fixture(e,'api.confirmar_revisao_audio',ator,sessao);
 r:=api.transcricao_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,revisao_confirmada_em}' is null
  or r#>>'{dados,exclusao_estado}' is distinct from 'pendente'
  or r#>>'{dados,exclusao_em}' is not null then raise exception 'REVISAO: %',r; end if;
 -- Reenvio da mesma chave não duplica nem reescreve a revisão.
 r:=api.transcricao_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true' then raise exception 'REVISAO_REPLAY: %',r; end if;
 -- Chave nova sobre revisão já confirmada é conflito, não segunda revisão.
 r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(
   jsonb_set(jsonb_set(e,'{chave_idempotencia}','"outra-revisao"'),'{request_id}',to_jsonb(gen_random_uuid())),
   'api.confirmar_revisao_audio',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'REVISAO_DUPLA: %',r; end if;

 -- Exclusão confirmada: o áudio some, o texto revisado e a autoria ficam.
 r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro),
   'api.excluir_audio_transcricao',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,exclusao_estado}' is distinct from 'confirmada'
  or r#>>'{dados,exclusao_em}' is null or r#>'{dados,texto_revisado}' is distinct from public.envelope_fixture('cmV2') then
  raise exception 'EXCLUSAO: %',r;
 end if;
 if not exists(select 1 from cadastro.audio_transcricao where id=registro and audio_cifrado is null
   and transcricao_cifrada is not null and criado_por_usuario_id=ator) then
  raise exception 'EXCLUSAO_APAGOU_DEMAIS';
 end if;
 -- Repetir a exclusão confirmada é seguro e não apaga outro anexo.
 r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro),
   'api.excluir_audio_transcricao',ator,sessao));
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true'
  or r#>>'{dados,exclusao_estado}' is distinct from 'confirmada' then raise exception 'EXCLUSAO_REPETIDA: %',r; end if;
 -- Ler depois da exclusão não promete reprodução: o áudio vem nulo e o estado explica.
 r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro),
   'api.ler_audio_transcricao',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>'{dados,audio}' is distinct from 'null'::jsonb
  or r#>>'{dados,exclusao_estado}' is distinct from 'confirmada' then raise exception 'LEITURA_POS_EXCLUSAO: %',r; end if;
end $$;

-- AAD de outro campo não é aceito: a cifra fica presa ao campo e à parte.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; registro uuid:=gen_random_uuid(); e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,
  'audio',jsonb_build_array(public.envelope_fixture('YQ')),'transcricao',public.envelope_fixture('dHh0'),
  'mime','audio/webm','duracao_segundos',5,'modelo','openai/whisper-large-v3',
  'chave_idempotencia','aad-trocado','digest_idempotencia',repeat('d',43),
  'aad',jsonb_build_object('tabela','cadastro.audio_transcricao','paciente_id',paciente::text,'registro_id',registro::text,'parte',0,'campo','texto_revisado','formato',1));
 begin
  r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(e,'api.registrar_audio_transcricao',ator,sessao));
  raise exception 'AAD_TROCADO_ACEITO: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
end $$;

-- Duração acima do teto absoluto e mime desconhecido não entram.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; registro uuid:=gen_random_uuid(); base jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 base:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,
  'audio',jsonb_build_array(public.envelope_fixture('YQ')),'transcricao',public.envelope_fixture('dHh0'),
  'mime','audio/webm','duracao_segundos',5,'modelo','openai/whisper-large-v3',
  'chave_idempotencia','limites','digest_idempotencia',repeat('e',43),
  'aad',jsonb_build_object('tabela','cadastro.audio_transcricao','paciente_id',paciente::text,'registro_id',registro::text,'parte',0,'campo','transcricao','formato',1));
 begin
  r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(jsonb_set(base,'{duracao_segundos}','301'),'api.registrar_audio_transcricao',ator,sessao));
  raise exception 'DURACAO_ACIMA_DO_TETO_ACEITA: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 begin
  r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(jsonb_set(base,'{mime}','"audio/aiff"'),'api.registrar_audio_transcricao',ator,sessao));
  raise exception 'MIME_DESCONHECIDO_ACEITO: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 begin
  r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(jsonb_set(base,'{audio}','[]'),'api.registrar_audio_transcricao',ator,sessao));
  raise exception 'AUDIO_VAZIO_ACEITO: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
end $$;

-- Outro profissional vinculado ao caso NÃO alcança o áudio alheio.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000004'; sessao uuid:='20000000-0000-4000-8000-000000000004';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; registro uuid:='50000000-0000-4000-8000-000000000001'; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro),
   'api.ler_audio_transcricao',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'nao_encontrado' then raise exception 'AUDIO_ALHEIO_ALCANCADO: %',r; end if;
end $$;

-- Autorização: sessão encerrada, perfil familiar, concessão revogada e MAC forjado.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; registro uuid:='50000000-0000-4000-8000-000000000001'; e jsonb; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro);
 t:=public.assinar_transcricao_fixture(e,'api.ler_audio_transcricao',ator,sessao);
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.ler_audio_transcricao',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ENCERRADA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 update public.usuario set perfil='familia' where id=ator;
 r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.ler_audio_transcricao',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA: %',r; end if;
 update public.usuario set perfil='profissional' where id=ator;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=ator;
 r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.ler_audio_transcricao',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'CONCESSAO_REVOGADA: %',r; end if;
 update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=ator;
 begin
  r:=api.transcricao_operacao_privada(jsonb_set(t,'{entrada,atestado,mac}',to_jsonb(repeat('A',43))));
  raise exception 'MAC_FALSO_ACEITO: %',r;
 exception when insufficient_privilege then null;
 end;
end $$;

-- Identidade Auth sem perfil fica auditada sem criar usuário no cadastro.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000003'; sessao uuid:='20000000-0000-4000-8000-000000000003'; req uuid:=gen_random_uuid(); r jsonb;
begin
 insert into auth.users values (ator);
 insert into auth.sessions values (sessao,ator,null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.transcricao_operacao_privada(public.assinar_transcricao_fixture(
   jsonb_build_object('request_id',req,'paciente_id','40000000-0000-4000-8000-000000000001','registro_id','50000000-0000-4000-8000-000000000001'),
   'api.ler_audio_transcricao',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'AUTH_SEM_PERFIL: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=ator and ator_usuario_id is null and resultado='negado') then
  raise exception 'AUDITORIA_AUTH_AUSENTE';
 end if;
 if exists(select 1 from public.usuario where id=ator) then raise exception 'USUARIO_CRIADO_INDEVIDAMENTE'; end if;
end $$;

-- O trigger protege o registro mesmo de quem escreve direto na tabela.
do $$
declare registro uuid:='50000000-0000-4000-8000-000000000001';
begin
 begin
  delete from cadastro.audio_transcricao where id=registro;
  raise exception 'DELETE_ACEITO';
 exception when raise_exception then
  if sqlerrm not like '%não é apagado%' then raise; end if;
 end;
 begin
  update cadastro.audio_transcricao set audio_cifrado=jsonb_build_array(public.envelope_fixture('YQ')) where id=registro;
  raise exception 'AUDIO_RESSUSCITADO';
 exception when raise_exception then
  if sqlerrm not like '%não retorna%' then raise; end if;
 end;
 begin
  update cadastro.audio_transcricao set duracao_segundos=99 where id=registro;
  raise exception 'IMUTAVEL_ALTERADO';
 exception when raise_exception then
  if sqlerrm not like '%imutáveis%' then raise; end if;
 end;
 begin
  update cadastro.audio_transcricao set exclusao_estado='pendente',exclusao_em=null where id=registro;
  raise exception 'EXCLUSAO_REVERTIDA';
 exception when raise_exception or check_violation then
  if sqlerrm not like '%não é revertida%' and sqlerrm not like '%audio_transcricao_exclusao%' then raise; end if;
 end;
end $$;

-- Auditoria obrigatória: se a evidência não grava, nada é persistido.
create function public.falhar_auditoria_transcricao_fixture() returns trigger language plpgsql as $$
begin
 if current_setting('fixture.falhar_auditoria',true)='sim' then raise exception 'FALHA_AUDITORIA_FIXTURE'; end if;
 return new;
end $$;
create trigger transcricao_auditoria_fixture before insert on auditoria.evento for each row execute function public.falhar_auditoria_transcricao_fixture();
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('40000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001');
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000002'; registro uuid:=gen_random_uuid(); e jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 perform set_config('fixture.falhar_auditoria','sim',true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,
  'audio',jsonb_build_array(public.envelope_fixture('YQ')),'transcricao',public.envelope_fixture('dHh0'),
  'mime','audio/webm','duracao_segundos',7,'modelo','openai/whisper-large-v3',
  'chave_idempotencia','falha-auditoria','digest_idempotencia',repeat('f',43),
  'aad',jsonb_build_object('tabela','cadastro.audio_transcricao','paciente_id',paciente::text,'registro_id',registro::text,'parte',0,'campo','transcricao','formato',1));
 begin
  perform api.transcricao_operacao_privada(public.assinar_transcricao_fixture(e,'api.registrar_audio_transcricao',ator,sessao));
  raise exception 'FALHA_AUDITORIA_NAO_PROPAGADA';
 exception when raise_exception then
  if sqlerrm <> 'FALHA_AUDITORIA_FIXTURE' then raise; end if;
 end;
 if exists(select 1 from operacao.requisicao where chave_idempotencia='falha-auditoria')
  or exists(select 1 from cadastro.audio_transcricao where paciente_id=paciente) then
  raise exception 'GRAVACAO_PARCIAL_APOS_FALHA_AUDITORIA';
 end if;
end $$;
