\set ON_ERROR_STOP on
-- Prova local das pendências do caso (FR-027/FR-028). PostgreSQL descartável; Auth, Vault e
-- assinatura são fixtures fictícias e não comprovam serviço real. Toda chamada passa pelo
-- wrapper api.*, que executa como o papel dono, então grants e políticas são exercitados.
-- A cadeia base traz `cadastro.acompanhamento_caso` e a carteira com situação, de que o
-- derivador do sinal depende; as fatias de versão abaixo são as demais fontes dele.
\ir criar_caso_atomico_local.sql
\ir ../migrations/20261107120000_plano_cuidado_versoes_privadas.sql
\ir ../migrations/20261111140000_tarefa_cuidado_versoes_privadas.sql
\ir ../migrations/20261117100000_encaminhamento_versoes_privadas.sql
\ir ../migrations/20261117130000_orientacao_versoes_privadas.sql
\ir ../migrations/20261117200000_saude_versoes_privadas.sql
\ir ../migrations/20261117300000_contexto_cuidado_versoes_privadas.sql
\ir ../migrations/20261117330000_rede_cuidado_versoes_privadas.sql
\ir ../migrations/20261118300000_sinal_operacional_caso.sql
\ir ../migrations/20261118310000_pendencia_caso_operacoes_privadas.sql

-- Antes do grant, nenhum papel do PostgREST alcança o wrapper, o derivador ou as tabelas.
do $$
declare papel text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.pendencia_operacao_privada(jsonb)','execute')
   or has_function_privilege(papel,'cadastro.sinal_operacional_caso(uuid)','execute')
   or has_table_privilege(papel,'cadastro.acordo_acompanhamento','select')
   or has_table_privilege(papel,'cadastro.pendencia_tratativa','insert') then
   raise exception 'ACESSO_INDEVIDO: %', papel;
  end if;
 end loop;
 -- O owner das pendências não enxerga nome de paciente nem conteúdo cifrado de nenhuma fatia.
 if has_column_privilege('ffcmapp_pendencia_owner','cadastro.paciente','nome_cifrado','SELECT')
  or has_table_privilege('ffcmapp_pendencia_owner','cadastro.saude_versao','SELECT')
  or has_column_privilege('ffcmapp_sinal_operacional_owner','cadastro.saude_versao','conteudo_cifrado','SELECT')
  or has_column_privilege('ffcmapp_sinal_operacional_owner','cadastro.tarefa_cuidado_versao','conteudo_cifrado','SELECT')
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
    where r.rolname in ('ffcmapp_pendencia_owner','ffcmapp_sinal_operacional_owner')) then
  raise exception 'OWNER_NAO_ISOLADO';
 end if;
end $$;

\ir ../migrations/20261118320000_grant_pendencia_teste.sql

do $$ begin
 if not has_function_privilege('authenticated','api.pendencia_operacao_privada(jsonb)','execute') then
  raise exception 'GRANT_NAO_APLICADO';
 end if;
 if has_function_privilege('anon','api.pendencia_operacao_privada(jsonb)','execute')
  or has_function_privilege('service_role','api.pendencia_operacao_privada(jsonb)','execute')
  or has_function_privilege('authenticated','cadastro.sinal_operacional_caso(uuid)','execute') then
  raise exception 'GRANT_AMPLO_DEMAIS';
 end if;
 begin
  perform api.pendencia_operacao_privada('{}'::jsonb);
  raise exception 'ENTRADA_INVALIDA_ACEITA';
 exception when insufficient_privilege then null;
 end;
end $$;

-- Identidades, sessões e segredo de atestado vêm da cadeia base. Aqui só entram o caso
-- novo desta prova e o acesso do Profissional a ele.
--   ...0001 Administrador · ...0002 Profissional com acesso ao caso
--   ...0003 Profissional ativo (alvo de atribuição) · ...0004 Profissional inativo

create function public.assinar_pendencia_fixture(e jsonb, acao text, ator uuid, sessao uuid) returns jsonb language plpgsql as $$
declare entrada text:=e::text; d jsonb; texto text; mac text;
begin
 d:=jsonb_build_object('key_id','teste','usuario_id',ator,'session_id',sessao,'request_id',e->>'request_id','operacao',acao,'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto:=d::text; mac:=translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;

insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('47000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001');
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
 values (gen_random_uuid(),'47000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');

-- Sem acordo, o caso não é "em dia": é informação insuficiente, com motivo visível.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001'; paciente uuid:='47000000-0000-4000-8000-000000000001'; req uuid:=gen_random_uuid(); r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.listar_pendencias',ator,sessao));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,estado}' is distinct from 'informacao_insuficiente'
  or r#>>'{dados,acordo}' is distinct from null or r#>>'{dados,pendencias}' is distinct from '[]' then
  raise exception 'SEM_ACORDO: %',r;
 end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido' and acao='api.listar_pendencias') then
  raise exception 'AUDITORIA_AUSENTE';
 end if;
end $$;

-- Acordo gravado pelo Administrador; revisão vencida e caso sem atualização viram pendência.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000001'; sessao uuid:='20000000-0000-4000-8000-000000000001'; paciente uuid:='47000000-0000-4000-8000-000000000001'; registro uuid:=gen_random_uuid(); e jsonb; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao_esperada',0,
  'chave_idempotencia','acordo-1','digest_idempotencia',repeat('a',43),
  'dias_entre_atualizacoes',30,'dias_antecedencia_revisao',14,'dias_retorno_encaminhamento',21,
  'proxima_revisao_em',to_char(current_date-interval '3 days','YYYY-MM-DD'));
 t:=public.assinar_pendencia_fixture(e,'api.gravar_acordo_acompanhamento',ator,sessao);
 r:=api.pendencia_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r#>>'{dados,acordo,versao}' is distinct from '1'
  or r#>>'{dados,estado}' is distinct from 'atencao_operacional' then raise exception 'ACORDO: %',r; end if;
 -- Revisão vencida e "nenhuma atualização registrada" são duas pendências abertas distintas.
 if (select count(*) from jsonb_array_elements(r#>'{dados,pendencias}') p where p->>'estado'='aberta') <> 2 then
  raise exception 'PENDENCIAS_DERIVADAS: %',r#>'{dados,pendencias}';
 end if;
 -- Reenvio da mesma chave devolve o mesmo acordo, sem criar segunda versão.
 r:=api.pendencia_operacao_privada(t);
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true'
  or (select count(*) from cadastro.acordo_acompanhamento where paciente_id=paciente)<>1 then
  raise exception 'REPLAY_ACORDO: %',r;
 end if;
 -- Mesma chave com entrada diferente é conflito, nunca sobrescrita silenciosa.
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(jsonb_set(e,'{digest_idempotencia}',to_jsonb(repeat('b',43))),'api.gravar_acordo_acompanhamento',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'CONFLITO_IDEMPOTENCIA: %',r; end if;
 -- Versão esperada defasada é conflito de versão.
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(
   e||jsonb_build_object('request_id',gen_random_uuid(),'registro_id',gen_random_uuid(),'chave_idempotencia','acordo-2'),
   'api.gravar_acordo_acompanhamento',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CONFLITO_VERSAO: %',r; end if;
end $$;

-- Resolver não apaga a origem: o acordo e a data continuam lá, e a pendência volta aberta
-- assim que a origem muda.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='47000000-0000-4000-8000-000000000001'; chave text; e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),'api.listar_pendencias',ator,sessao));
 select p->>'chave_origem' into chave from jsonb_array_elements(r#>'{dados,pendencias}') p where p->>'tipo'='revisao_proxima';
 if chave is null then raise exception 'CHAVE_ORIGEM_AUSENTE: %',r; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',gen_random_uuid(),
  'chave_idempotencia','tratativa-1','digest_idempotencia',repeat('c',43),
  'tipo','revisao_proxima','chave_origem',chave,'acao','resolvida');
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(e,'api.tratar_pendencia',ator,sessao));
 if r->>'ok' is distinct from 'true' then raise exception 'TRATATIVA: %',r; end if;
 if exists(select 1 from jsonb_array_elements(r#>'{dados,pendencias}') p where p->>'tipo'='revisao_proxima' and p->>'estado'<>'resolvida') then
  raise exception 'RESOLUCAO_NAO_APLICADA: %',r#>'{dados,pendencias}';
 end if;
 -- A origem continua intacta: o acordo não foi tocado.
 if not exists(select 1 from cadastro.acordo_acompanhamento where paciente_id=paciente and proxima_revisao_em=current_date-3) then
  raise exception 'ORIGEM_APAGADA';
 end if;
 -- Atribuir exige destinatário colaborador ativo; familiar ou desconhecido é entrada inválida.
 begin
  r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(
    e||jsonb_build_object('request_id',gen_random_uuid(),'registro_id',gen_random_uuid(),'chave_idempotencia','tratativa-x','acao','atribuida','atribuido_usuario_id',gen_random_uuid()),
    'api.tratar_pendencia',ator,sessao));
  raise exception 'ATRIBUICAO_A_DESCONHECIDO_ACEITA: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 -- Atribuição a colaborador ativo passa e aparece na pendência.
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',gen_random_uuid(),
    'chave_idempotencia','tratativa-2','digest_idempotencia',repeat('d',43),
    'tipo','atualizacao_ausente','chave_origem','atualizacao:nunca','acao','atribuida',
    'atribuido_usuario_id','10000000-0000-4000-8000-000000000003'),
   'api.tratar_pendencia',ator,sessao));
 if r->>'ok' is distinct from 'true'
  or not exists(select 1 from jsonb_array_elements(r#>'{dados,pendencias}') p
    where p->>'tipo'='atualizacao_ausente' and p->>'estado'='atribuida'
      and p->>'atribuido_usuario_id'='10000000-0000-4000-8000-000000000003') then
  raise exception 'ATRIBUICAO: %',r#>'{dados,pendencias}';
 end if;
 -- Profissional não grava acordo do caso: isso é decisão de gestão do Administrador.
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',gen_random_uuid(),'versao_esperada',1,
    'chave_idempotencia','acordo-prof','digest_idempotencia',repeat('e',43),
    'dias_entre_atualizacoes',10,'dias_antecedencia_revisao',7,'dias_retorno_encaminhamento',7),
   'api.gravar_acordo_acompanhamento',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ACORDO_POR_PROFISSIONAL: %',r; end if;
end $$;

-- Uma atualização nova muda a chave de origem: a pendência de atualização desaparece.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='47000000-0000-4000-8000-000000000001'; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 insert into cadastro.saude_versao(id,paciente_id,versao,conteudo_cifrado,criado_por_usuario_id)
  values(gen_random_uuid(),paciente,1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',ator);
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),'api.listar_pendencias',ator,sessao));
 if exists(select 1 from jsonb_array_elements(r#>'{dados,pendencias}') p where p->>'tipo'='atualizacao_ausente' and p->>'chave_origem'='atualizacao:nunca' and p->>'estado'<>'atribuida') then
  raise exception 'CHAVE_NAO_MUDOU: %',r#>'{dados,pendencias}';
 end if;
 if r#>>'{dados,ultima_atualizacao_em}' is null then raise exception 'ULTIMA_ATUALIZACAO_AUSENTE: %',r; end if;
end $$;

-- Encaminhamento parado em 'retorno_pendente' além do acordado vira pendência operacional.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='47000000-0000-4000-8000-000000000001'; enc uuid:=gen_random_uuid(); r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 insert into cadastro.encaminhamento(id,paciente_id) values(enc,paciente);
 insert into cadastro.encaminhamento_versao(id,encaminhamento_id,versao,etapa,conteudo_cifrado,criado_por_usuario_id,criado_em)
  values(gen_random_uuid(),enc,1,'retorno_pendente','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',ator,clock_timestamp()-interval '40 days');
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),'api.listar_pendencias',ator,sessao));
 if not exists(select 1 from jsonb_array_elements(r#>'{dados,pendencias}') p
   where p->>'tipo'='encaminhamento_sem_retorno' and p->>'chave_origem'='encaminhamento:'||enc::text and p->>'estado'='aberta') then
  raise exception 'ENCAMINHAMENTO_SEM_RETORNO: %',r#>'{dados,pendencias}';
 end if;
end $$;

-- Negativos de autorização: sessão encerrada, concessão revogada, outro perfil, caso sem acesso.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='47000000-0000-4000-8000-000000000001'; e jsonb; t jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente);
 t:=public.assinar_pendencia_fixture(e,'api.listar_pendencias',ator,sessao);
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.listar_pendencias',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ENCERRADA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 update public.usuario set perfil='familia' where id=ator;
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.listar_pendencias',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA: %',r; end if;
 update public.usuario set perfil='profissional' where id=ator;
 -- Profissional sem acesso ao caso não lê a pendência daquele caso.
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(), revogado_por_usuario_id='10000000-0000-4000-8000-000000000001', motivo_revogacao_cifrado=motivo_concessao_cifrado where usuario_id=ator and paciente_id=paciente;
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'api.listar_pendencias',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ACESSO_REVOGADO: %',r; end if;
 update cadastro.acesso_paciente set revogada_em=null, revogado_por_usuario_id=null, motivo_revogacao_cifrado=null where usuario_id=ator and paciente_id=paciente;
 -- Atestado assinado com outra chave é recusado antes de qualquer leitura.
 begin
  r:=api.pendencia_operacao_privada(jsonb_set(t,'{entrada,atestado,mac}',to_jsonb(repeat('A',43))));
  raise exception 'MAC_FALSO_ACEITO: %',r;
 exception when insufficient_privilege then null;
 end;
end $$;

-- Identidade Auth sem perfil fica auditada sem criar usuário no cadastro.
do $$
#variable_conflict use_variable
declare ator uuid:='19000000-0000-4000-8000-000000000009'; sessao uuid:='29000000-0000-4000-8000-000000000009'; req uuid:=gen_random_uuid(); r jsonb;
begin
 insert into auth.users values (ator);
 insert into auth.sessions values (sessao,ator,null);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.pendencia_operacao_privada(public.assinar_pendencia_fixture(
   jsonb_build_object('request_id',req,'paciente_id','47000000-0000-4000-8000-000000000001'),'api.listar_pendencias',ator,sessao));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'AUTH_SEM_PERFIL: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=ator and ator_usuario_id is null and resultado='negado') then
  raise exception 'AUDITORIA_AUTH_AUSENTE';
 end if;
 if exists(select 1 from public.usuario where id=ator) then raise exception 'USUARIO_CRIADO_INDEVIDAMENTE'; end if;
end $$;

-- A tratativa é append-only: nem o próprio migrador altera ou apaga o histórico.
do $$
begin
 begin
  update cadastro.pendencia_tratativa set acao='resolvida';
  raise exception 'TRATATIVA_ALTERADA';
 exception when insufficient_privilege then
  if sqlerrm <> 'REGISTRO_IMUTAVEL' then raise; end if;
 end;
end $$;
do $$
begin
 begin
  delete from cadastro.acordo_acompanhamento;
  raise exception 'ACORDO_APAGADO';
 exception when insufficient_privilege then
  if sqlerrm <> 'REGISTRO_IMUTAVEL' then raise; end if;
 end;
end $$;
