\set ON_ERROR_STOP on
\ir cadeia_migrations_local.sql
-- A coluna `ator_auth_id` da auditoria vem desta migration; a fatia de diário a exige.
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
-- A sessão familiar (sem concessão de equipe) só existe a partir desta migration; a trilha
-- familiar do diário depende dela, não de uma sessão de equipe disfarçada.
\ir ../migrations/20261111160000_admissao_familiar_privada.sql
\ir ../migrations/20261118200000_diario_versoes_privadas.sql
\ir ../migrations/20261118210000_diario_operacoes_privadas.sql

-- Antes do grant, nenhum papel do PostgREST alcança o wrapper nem as tabelas.
do $$
declare papel text; tabela text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.diario_privado(jsonb)','execute')
   or has_function_privilege(papel,'api.diario_operacao_privada(jsonb)','execute') then
   raise exception 'ACESSO_INDEVIDO_FUNCAO: %', papel;
  end if;
  foreach tabela in array array['cadastro.diario_registro','cadastro.diario_registro_versao','cadastro.diario_consulta'] loop
   if has_table_privilege(papel,tabela,'select') or has_table_privilege(papel,tabela,'insert') then
    raise exception 'ACESSO_INDEVIDO_TABELA: % %', papel, tabela;
   end if;
  end loop;
 end loop;
 -- O owner do diário não enxerga o nome do paciente nem herda outra fatia.
 if has_column_privilege('ffcmapp_diario_owner','cadastro.paciente','nome_cifrado','SELECT')
  or has_table_privilege('ffcmapp_carteira_owner','cadastro.diario_registro_versao','SELECT')
  or pg_has_role('ffcmapp_carteira_owner','ffcmapp_diario_owner','MEMBER')
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
    where r.rolname='ffcmapp_diario_owner') then
  raise exception 'OWNER_NAO_ISOLADO';
 end if;
end $$;

\ir ../migrations/20261118220000_grant_diario_teste.sql

do $$ begin
 if not has_function_privilege('authenticated','api.diario_privado(jsonb)','execute') then
  raise exception 'GRANT_NAO_APLICADO';
 end if;
 if has_function_privilege('anon','api.diario_privado(jsonb)','execute')
  or has_function_privilege('service_role','api.diario_privado(jsonb)','execute')
  or has_function_privilege('authenticated','api.diario_operacao_privada(jsonb)','execute') then
  raise exception 'GRANT_AMPLO_DEMAIS';
 end if;
 begin
  perform api.diario_privado('{}'::jsonb);
  raise exception 'ENTRADA_INVALIDA_ACEITA';
 exception when insufficient_privilege then null;
 end;
end $$;

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
-- Sessão familiar: sem concessão de equipe, método próprio, como em 20261112040000.
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
select replace(id::text,'10000000-','20000000-')::uuid,id,null,null,'familia'
from public.usuario where perfil='familia';

insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('40000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001');
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values
 ('50000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'),
 ('50000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');

create function public.assinar_diario_fixture(e jsonb, acao text, ator uuid, sessao uuid) returns jsonb language plpgsql as $$
declare entrada text:=e::text; d jsonb; texto text; mac text;
begin
 d:=jsonb_build_object('key_id','teste','usuario_id',ator,'session_id',sessao,'request_id',e->>'request_id','operacao',acao,'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=d::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;

create function public.envelope_diario_fixture(marca text) returns jsonb language sql immutable as $$
 select jsonb_build_object('formato',1,'key_id','teste','nonce',repeat(marca,16),'ciphertext','YQ','tag',repeat(marca,22));
$$;

create function public.aad_diario_fixture(paciente uuid, diario uuid, registro uuid, versao integer, campo text) returns jsonb language sql immutable as $$
 select jsonb_build_object('tabela','cadastro.diario_registro_versao','paciente_id',paciente::text,
  'diario_registro_id',diario::text,'registro_id',registro::text,'versao',versao,'campo',campo,'formato',1);
$$;

create function public.claims_diario_fixture(ator uuid, sessao uuid, metodo text) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,
   'amr',jsonb_build_array(jsonb_build_object('method',metodo)))::text,true)::void;
$$;

-- 1. Profissional cria rascunho, confirma idempotência e publica. 2. Retifica com justificativa.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001';
 diario uuid:='60000000-0000-4000-8000-000000000001';
 registro uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); e jsonb; t jsonb; r jsonb;
begin
 perform public.claims_diario_fixture(ator,sessao,'oauth');
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'diario_registro_id',diario,
  'registro_id',registro,'versao_esperada',0,'tipo','evolucao_profissional','estado','rascunho',
  'audiencia','equipe','atencao',false,'retorno_solicitado',false,'origem_conteudo','texto',
  'chave_idempotencia','diario-rascunho','digest_idempotencia',repeat('a',43),
  'conteudo',public.envelope_diario_fixture('a'),
  'aad',public.aad_diario_fixture(paciente,diario,registro,1,'conteudo'));
 t:=public.assinar_diario_fixture(e,'api.gravar_diario',ator,sessao);
 r:=api.diario_privado(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1'
  or r#>>'{dados,estado}' is distinct from 'rascunho' then raise exception 'RASCUNHO: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido' and acao='api.gravar_diario') then
  raise exception 'AUDITORIA_AUSENTE';
 end if;
 -- Reenvio da mesma chave devolve o mesmo registro, sem criar segunda versão.
 r:=api.diario_privado(t);
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true'
  or r#>>'{dados,registro_id}' is distinct from registro::text then raise exception 'REPLAY: %',r; end if;
 -- Mesma chave com conteúdo diferente é conflito, nunca sobrescrita silenciosa.
 r:=api.diario_privado(public.assinar_diario_fixture(jsonb_set(e,'{digest_idempotencia}',to_jsonb(repeat('b',43))),'api.gravar_diario',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'CONFLITO_IDEMPOTENCIA: %',r; end if;
 -- AAD de outra tabela não é aceito: a cifra fica presa ao registro do diário.
 begin
  r:=api.diario_privado(public.assinar_diario_fixture(
    jsonb_set(e,'{aad,tabela}',to_jsonb('cadastro.saude_versao'::text)),'api.gravar_diario',ator,sessao));
  raise exception 'AAD_TROCADO_ACEITO: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 -- Publicação: rascunho vira publicado na versão seguinte.
 registro:=gen_random_uuid();
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'diario_registro_id',diario,
  'registro_id',registro,'versao_esperada',1,'tipo','evolucao_profissional','estado','publicado',
  'audiencia','equipe','atencao',false,'retorno_solicitado',false,'origem_conteudo','texto',
  'chave_idempotencia','diario-publicar','digest_idempotencia',repeat('c',43),
  'conteudo',public.envelope_diario_fixture('b'),
  'aad',public.aad_diario_fixture(paciente,diario,registro,2,'conteudo'));
 r:=api.diario_privado(public.assinar_diario_fixture(e,'api.gravar_diario',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,estado}' is distinct from 'publicado' then
  raise exception 'PUBLICACAO: %',r;
 end if;
 -- FR-012: publicado não volta a rascunho nem é reescrito sem retificação justificada.
 registro:=gen_random_uuid();
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'diario_registro_id',diario,
  'registro_id',registro,'versao_esperada',2,'tipo','evolucao_profissional','estado','publicado',
  'audiencia','equipe','atencao',false,'retorno_solicitado',false,'origem_conteudo','texto',
  'chave_idempotencia','diario-reescrever','digest_idempotencia',repeat('d',43),
  'conteudo',public.envelope_diario_fixture('c'),
  'aad',public.aad_diario_fixture(paciente,diario,registro,3,'conteudo'));
 r:=api.diario_privado(public.assinar_diario_fixture(e,'api.gravar_diario',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'REESCRITA_SEM_RETIFICACAO: %',r; end if;
 -- Retificar sem justificativa é entrada inválida.
 begin
  r:=api.diario_privado(public.assinar_diario_fixture(
    jsonb_set(e,'{estado}',to_jsonb('retificado'::text)),'api.gravar_diario',ator,sessao));
  raise exception 'RETIFICACAO_SEM_JUSTIFICATIVA_ACEITA: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 -- Retificar com justificativa grava nova versão; a anterior continua na tabela.
 e:=e||jsonb_build_object('estado','retificado','chave_idempotencia','diario-retificar',
  'justificativa',public.envelope_diario_fixture('d'),
  'aad_justificativa',public.aad_diario_fixture(paciente,diario,registro,3,'justificativa'));
 r:=api.diario_privado(public.assinar_diario_fixture(e,'api.gravar_diario',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,estado}' is distinct from 'retificado'
  or r#>>'{dados,versao}' is distinct from '3' then raise exception 'RETIFICACAO: %',r; end if;
 if (select count(*) from cadastro.diario_registro_versao v where v.diario_registro_id=diario) <> 3 then
  raise exception 'HISTORICO_PERDIDO';
 end if;
end $$;

-- 3. Outro profissional não reescreve registro alheio; quem responde cria o próprio registro.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000003'; sessao uuid:='20000000-0000-4000-8000-000000000003';
 paciente uuid:='40000000-0000-4000-8000-000000000001';
 diario uuid:='60000000-0000-4000-8000-000000000001'; registro uuid:=gen_random_uuid(); r jsonb;
begin
 perform public.claims_diario_fixture(ator,sessao,'oauth');
 r:=api.diario_privado(public.assinar_diario_fixture(jsonb_build_object(
   'request_id',gen_random_uuid(),'paciente_id',paciente,'diario_registro_id',diario,
   'registro_id',registro,'versao_esperada',3,'tipo','evolucao_profissional','estado','retificado',
   'audiencia','equipe','atencao',false,'retorno_solicitado',false,'origem_conteudo','texto',
   'chave_idempotencia','diario-invasao','digest_idempotencia',repeat('e',43),
   'conteudo',public.envelope_diario_fixture('e'),
   'aad',public.aad_diario_fixture(paciente,diario,registro,4,'conteudo'),
   'justificativa',public.envelope_diario_fixture('f'),
   'aad_justificativa',public.aad_diario_fixture(paciente,diario,registro,4,'justificativa')),
  'api.gravar_diario',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'REESCRITA_DE_OUTRO_AUTOR: %',r; end if;
 if exists(select 1 from cadastro.diario_registro_versao v where v.id=registro) then
  raise exception 'VERSAO_ALHEIA_GRAVADA';
 end if;
end $$;

-- 4. Familiar registra relato próprio; não publica evolução nem amplia audiência.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000004'; sessao uuid:='20000000-0000-4000-8000-000000000004';
 paciente uuid:='40000000-0000-4000-8000-000000000001';
 diario uuid:='60000000-0000-4000-8000-000000000002'; registro uuid:=gen_random_uuid();
 e jsonb; r jsonb;
begin
 perform public.claims_diario_fixture(ator,sessao,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'diario_registro_id',diario,
  'registro_id',registro,'versao_esperada',0,'tipo','relato_familiar','estado','publicado',
  'audiencia','equipe','atencao',false,'retorno_solicitado',true,'origem_conteudo','texto',
  'chave_idempotencia','relato-familia','digest_idempotencia',repeat('f',43),
  'conteudo',public.envelope_diario_fixture('g'),
  'aad',public.aad_diario_fixture(paciente,diario,registro,1,'conteudo'));
 r:=api.diario_privado(public.assinar_diario_fixture(e,'api.gravar_diario',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,tipo}' is distinct from 'relato_familiar'
  or r#>>'{dados,retorno_solicitado}' is distinct from 'true' then raise exception 'RELATO: %',r; end if;
 -- Família não publica evolução profissional.
 begin
  r:=api.diario_privado(public.assinar_diario_fixture(
    jsonb_set(jsonb_set(e,'{tipo}',to_jsonb('evolucao_profissional'::text)),
      '{chave_idempotencia}',to_jsonb('relato-evolucao'::text)),'api.gravar_diario',ator,sessao));
  raise exception 'FAMILIA_PUBLICOU_EVOLUCAO: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 -- Família não amplia a audiência do próprio relato.
 begin
  r:=api.diario_privado(public.assinar_diario_fixture(
    jsonb_set(jsonb_set(e,'{audiencia}',to_jsonb('equipe_e_familia'::text)),
      '{chave_idempotencia}',to_jsonb('relato-audiencia'::text)),'api.gravar_diario',ator,sessao));
  raise exception 'FAMILIA_AMPLIOU_AUDIENCIA: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
end $$;

-- 5. Audiência na leitura: família vê o próprio relato, nunca a evolução interna da equipe.
do $$
#variable_conflict use_variable
declare
 familia uuid:='10000000-0000-4000-8000-000000000004'; sessao_familia uuid:='20000000-0000-4000-8000-000000000004';
 outra_familia uuid:='10000000-0000-4000-8000-000000000005'; sessao_outra uuid:='20000000-0000-4000-8000-000000000005';
 profissional uuid:='10000000-0000-4000-8000-000000000002'; sessao_prof uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; r jsonb;
begin
 perform public.claims_diario_fixture(familia,sessao_familia,'password');
 r:=api.diario_privado(public.assinar_diario_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),'api.ler_diario',familia,sessao_familia));
 if r->>'ok' is distinct from 'true' then raise exception 'LEITURA_FAMILIA: %',r; end if;
 if jsonb_array_length(r->'dados') <> 1 or r#>>'{dados,0,tipo}' is distinct from 'relato_familiar' then
  raise exception 'FAMILIA_VIU_EVOLUCAO_INTERNA: %',r;
 end if;
 -- A outra família vinculada ao mesmo paciente não vê o relato alheio.
 perform public.claims_diario_fixture(outra_familia,sessao_outra,'password');
 r:=api.diario_privado(public.assinar_diario_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),'api.ler_diario',outra_familia,sessao_outra));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'dados') <> 0 then
  raise exception 'RELATO_DE_OUTRA_FAMILIA_VISIVEL: %',r;
 end if;
 -- O profissional vê o relato publicado e a própria evolução; o rascunho alheio não existe aqui.
 perform public.claims_diario_fixture(profissional,sessao_prof,'oauth');
 r:=api.diario_privado(public.assinar_diario_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),'api.ler_diario',profissional,sessao_prof));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'dados') <> 2 then
  raise exception 'LEITURA_PROFISSIONAL: %',r;
 end if;
 -- FR-013: a leitura do profissional marca consulta no relato da família, uma vez só.
 if (select count(*) from cadastro.diario_consulta c where c.usuario_id=profissional) <> 1 then
  raise exception 'CONSULTA_NAO_MARCADA';
 end if;
 r:=api.diario_privado(public.assinar_diario_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),'api.ler_diario',profissional,sessao_prof));
 if (select count(*) from cadastro.diario_consulta c where c.usuario_id=profissional) <> 1 then
  raise exception 'CONSULTA_DUPLICADA';
 end if;
end $$;

-- 6. FR-013: retorno a relato familiar é obrigado a alcançar quem escreveu.
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001';
 relato uuid:='60000000-0000-4000-8000-000000000002';
 diario uuid:='60000000-0000-4000-8000-000000000003'; registro uuid:=gen_random_uuid();
 familia uuid:='10000000-0000-4000-8000-000000000004'; sessao_familia uuid:='20000000-0000-4000-8000-000000000004';
 outra_familia uuid:='10000000-0000-4000-8000-000000000005'; sessao_outra uuid:='20000000-0000-4000-8000-000000000005';
 e jsonb; r jsonb;
begin
 perform public.claims_diario_fixture(ator,sessao,'oauth');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'diario_registro_id',diario,
  'registro_id',registro,'versao_esperada',0,'tipo','evolucao_profissional','estado','publicado',
  'audiencia','equipe','atencao',true,'retorno_solicitado',false,'origem_conteudo','texto',
  'responde_registro_id',relato,'tarefa_id',gen_random_uuid(),
  'chave_idempotencia','retorno-restrito','digest_idempotencia',repeat('g',43),
  'conteudo',public.envelope_diario_fixture('h'),
  'aad',public.aad_diario_fixture(paciente,diario,registro,1,'conteudo'));
 r:=api.diario_privado(public.assinar_diario_fixture(e,'api.gravar_diario',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'RETORNO_SEM_ALCANCE_ACEITO: %',r; end if;
 e:=e||jsonb_build_object('audiencia','equipe_e_familia','chave_idempotencia','retorno-familia');
 r:=api.diario_privado(public.assinar_diario_fixture(e,'api.gravar_diario',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,atencao}' is distinct from 'true'
  or r#>>'{dados,responde_registro_id}' is distinct from relato::text then
  raise exception 'RETORNO: %',r;
 end if;
 -- Quem escreveu o relato enxerga o retorno; a outra família continua sem enxergar nada.
 perform public.claims_diario_fixture(familia,sessao_familia,'password');
 r:=api.diario_privado(public.assinar_diario_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),'api.ler_diario',familia,sessao_familia));
 if jsonb_array_length(r->'dados') <> 2 then raise exception 'AUTOR_SEM_RETORNO: %',r; end if;
 perform public.claims_diario_fixture(outra_familia,sessao_outra,'password');
 r:=api.diario_privado(public.assinar_diario_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),'api.ler_diario',outra_familia,sessao_outra));
 if jsonb_array_length(r->'dados') <> 0 then raise exception 'RETORNO_VAZOU_PARA_OUTRA_FAMILIA: %',r; end if;
end $$;

-- 7. Revogação e sessão: cada prova derruba o acesso sozinha, mesmo com atestado recém-emitido.
do $$
#variable_conflict use_variable
declare
 prof uuid:='10000000-0000-4000-8000-000000000002'; sessao_prof uuid:='20000000-0000-4000-8000-000000000002';
 familia uuid:='10000000-0000-4000-8000-000000000004'; sessao_familia uuid:='20000000-0000-4000-8000-000000000004';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; e jsonb; t jsonb; r jsonb;
begin
 perform public.claims_diario_fixture(prof,sessao_prof,'oauth');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente);
 t:=public.assinar_diario_fixture(e,'api.ler_diario',prof,sessao_prof);
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao_prof;
 r:=api.diario_privado(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ENCERRADA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao_prof;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=prof,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=prof;
 r:=api.diario_privado(public.assinar_diario_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.ler_diario',prof,sessao_prof));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'CONCESSAO_REVOGADA: %',r; end if;
 update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=prof;
 -- Atestado assinado com outra chave é recusado antes de qualquer leitura.
 begin
  r:=api.diario_privado(jsonb_set(t,'{entrada,atestado,mac}',to_jsonb(repeat('A',43))));
  raise exception 'MAC_FALSO_ACEITO: %',r;
 exception when insufficient_privilege then null;
 end;
 -- Acesso familiar revogado derruba o familiar, mesmo com sessão viva.
 perform public.claims_diario_fixture(familia,sessao_familia,'password');
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=prof,motivo_revogacao_cifrado=motivo_concessao_cifrado where usuario_id=familia;
 r:=api.diario_privado(public.assinar_diario_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.ler_diario',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ACESSO_FAMILIAR_REVOGADO: %',r; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=familia;
 -- Familiar com sessão de equipe (amr errado) não passa pela trilha familiar.
 perform public.claims_diario_fixture(familia,sessao_familia,'oauth');
 r:=api.diario_privado(public.assinar_diario_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.ler_diario',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'AMR_TROCADO_ACEITO: %',r; end if;
end $$;

-- 8. Identidade Auth sem perfil fica auditada sem criar usuário no cadastro.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000009'; sessao uuid:='20000000-0000-4000-8000-000000000009'; req uuid:=gen_random_uuid(); r jsonb;
begin
 insert into auth.users values (ator);
 insert into auth.sessions values (sessao,ator,null);
 perform public.claims_diario_fixture(ator,sessao,'oauth');
 r:=api.diario_privado(public.assinar_diario_fixture(
   jsonb_build_object('request_id',req,'paciente_id','40000000-0000-4000-8000-000000000001'),'api.ler_diario',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'AUTH_SEM_PERFIL: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=ator and ator_usuario_id is null and resultado='negado') then
  raise exception 'AUDITORIA_AUTH_AUSENTE';
 end if;
 if exists(select 1 from public.usuario where id=ator) then raise exception 'USUARIO_CRIADO_INDEVIDAMENTE'; end if;
end $$;

-- 9. Auditoria obrigatória: se a evidência não grava, nada é persistido.
create function public.falhar_auditoria_diario_fixture() returns trigger language plpgsql as $$
begin
 if current_setting('fixture.falhar_auditoria',true)='sim' then raise exception 'FALHA_AUDITORIA_FIXTURE'; end if;
 return new;
end $$;
create trigger diario_auditoria_fixture before insert on auditoria.evento for each row execute function public.falhar_auditoria_diario_fixture();
do $$
#variable_conflict use_variable
declare
 ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002';
 paciente uuid:='40000000-0000-4000-8000-000000000001';
 diario uuid:='60000000-0000-4000-8000-000000000009'; registro uuid:=gen_random_uuid(); e jsonb;
begin
 perform public.claims_diario_fixture(ator,sessao,'oauth');
 perform set_config('fixture.falhar_auditoria','sim',true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'diario_registro_id',diario,
  'registro_id',registro,'versao_esperada',0,'tipo','evolucao_profissional','estado','publicado',
  'audiencia','equipe','atencao',false,'retorno_solicitado',false,'origem_conteudo','texto',
  'chave_idempotencia','falha-auditoria','digest_idempotencia',repeat('h',43),
  'conteudo',public.envelope_diario_fixture('i'),
  'aad',public.aad_diario_fixture(paciente,diario,registro,1,'conteudo'));
 begin
  perform api.diario_privado(public.assinar_diario_fixture(e,'api.gravar_diario',ator,sessao));
  raise exception 'FALHA_AUDITORIA_NAO_PROPAGADA';
 exception when raise_exception then
  if sqlerrm <> 'FALHA_AUDITORIA_FIXTURE' then raise; end if;
 end;
 if exists(select 1 from operacao.requisicao where chave_idempotencia='falha-auditoria')
  or exists(select 1 from cadastro.diario_registro where id=diario) then
  raise exception 'GRAVACAO_PARCIAL_APOS_FALHA_AUDITORIA';
 end if;
end $$;
