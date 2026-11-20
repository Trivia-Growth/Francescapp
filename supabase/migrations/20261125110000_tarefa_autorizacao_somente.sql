-- Extensão local de leitura, sem novas RPCs/grants/tabelas. Não aplicar remotamente.
-- Campo interno atestado autorizacao_somente:true reaproveita integralmente Auth,
-- concessão, vínculo, locks e auditoria da listagem. False/null/outros tipos são inválidos.
-- Sem o campo: listagem anterior preservada. Não muda autorização nem permite escrita.
-- CREATE OR REPLACE preserva owner/ACL/assinatura; não altera wrapper público/verificador.
select set_config('ffcmapp.tarefa_autorizacao_migrador',current_user,false);
select set_config('ffcmapp.tarefa_autorizacao_tinha_set',pg_has_role(current_user,'ffcmapp_tarefa_owner','SET')::text,false);
-- ACL direta, não privilégio herdado: preservar CREATE preexistente e seu concedente.
select set_config('ffcmapp.tarefa_autorizacao_tinha_create',exists(
 select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
 where n.nspname='api' and a.grantee='ffcmapp_tarefa_owner'::regrole and a.privilege_type='CREATE')::text,false);
do $$ begin
 if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
  where p.oid='api.tarefa_cuidado_operacao_privada(jsonb)'::regprocedure and r.rolname='ffcmapp_tarefa_owner'
  and p.prosecdef and p.prorettype='jsonb'::regtype and p.pronargs=1 and p.proargtypes[0]='jsonb'::regtype
  and 'search_path=""'=any(p.proconfig) and 'row_security=on'=any(p.proconfig)
  and not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin) then raise exception 'WRAPPER_INESPERADO'; end if;
 if current_setting('ffcmapp.tarefa_autorizacao_tinha_set')='false' then
  if exists(select 1 from pg_auth_members m where m.roleid='ffcmapp_tarefa_owner'::regrole and m.member=current_user::regrole and m.grantor=current_user::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET'; end if;
  execute format('grant ffcmapp_tarefa_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
 if current_setting('ffcmapp.tarefa_autorizacao_tinha_create')='false' then grant create on schema api to ffcmapp_tarefa_owner; end if;
end $$;
set role ffcmapp_tarefa_owner;
create or replace function api.tarefa_cuidado_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; tarefa uuid; registro uuid; esperada integer; atual integer; inicio timestamptz; fim timestamptz;
 concessao uuid; perfil text; sujeito text; google record; dominio text; autorizado boolean:=false;
 acao text; resultado jsonb; envelope jsonb; reserva uuid; geracao bigint; b operacao.barreira_tarefa_cuidado; reserva_atual operacao.reserva_tarefa_cuidado; anterior operacao.requisicao%rowtype; novo boolean;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','tarefa_id','registro_id','versao_esperada','conteudo','aad','atestado','chave_idempotencia','digest_idempotencia','reserva_id','geracao_reserva','autorizacao_somente'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao='api.gravar_tarefa_cuidado' then
   reserva:=(e->>'reserva_id')::uuid; geracao:=(e->>'geracao_reserva')::bigint; tarefa:=(e->>'tarefa_id')::uuid; registro:=(e->>'registro_id')::uuid; esperada:=(e->>'versao_esperada')::integer;
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if e ? 'autorizacao_somente' and (acao is distinct from 'api.ler_tarefas_cuidado' or e->'autorizacao_somente' is distinct from 'true'::jsonb) then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_tarefas_cuidado','api.gravar_tarefa_cuidado') or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil = 'profissional' and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
       and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 perform 1 from cadastro.acesso_paciente ap where ap.paciente_id=paciente and ap.usuario_id=ator and ap.revogada_em is null for share;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.ler_tarefas_cuidado' then
  if e - array['request_id','paciente_id','atestado','autorizacao_somente'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or reserva is null or geracao is null or geracao<1 or jsonb_typeof(e->'geracao_reserva') is distinct from 'number' or coalesce(e->>'geracao_reserva','') !~ '^[1-9][0-9]*$'
   or tarefa is null or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.tarefa_cuidado_versao','paciente_id',paciente::text,'tarefa_id',tarefa::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  envelope:=e->'conteudo';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao='api.gravar_tarefa_cuidado' then
  -- A mesma ordem da reserva: paciente antes da barreira. Ambos os caminhos
  -- mantêm o bloqueio até commit, impedindo escrita após encerramento.
  select * into b from operacao.barreira_tarefa_cuidado where ator_usuario_id=ator for update;
  select * into reserva_atual from operacao.reserva_tarefa_cuidado re where re.id=reserva and re.ator_usuario_id=ator
   and re.epoca=geracao and re.paciente_reservado_id=paciente and re.tarefa_reservada_id=tarefa
   and re.versao_esperada=esperada for update;
  if not found or b.epoca is distinct from geracao or b.reserva_atual is distinct from reserva
   or b.resultado_pendente is not null or reserva_atual.estado not in ('aberta','confirmada') then
   raise exception using errcode='42501',message='RESERVA_INVALIDA';
  end if;
  if reserva_atual.estado='confirmada' and (reserva_atual.chave_idempotencia is distinct from e->>'chave_idempotencia'
   or reserva_atual.digest_idempotencia is distinct from e->>'digest_idempotencia' or reserva_atual.tarefa_resultado_id is distinct from tarefa) then
   raise exception using errcode='42501',message='RESERVA_INVALIDA';
  end if;
  insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
   values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,esperada+1)
   on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
  novo:=found;
  if not novo then
   select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
    or anterior.resultado_versao is distinct from esperada+1
    or not exists(select 1 from cadastro.tarefa_cuidado_versao v join cadastro.tarefa_cuidado t on t.id=v.tarefa_id
      where v.id=anterior.resultado_id and v.tarefa_id=tarefa and t.paciente_id=paciente and v.versao=esperada+1) then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
   end if;
   registro:=anterior.resultado_id;
  else
  select v.versao into atual from cadastro.tarefa_cuidado_versao v where v.tarefa_id=tarefa order by v.versao desc limit 1;
  if coalesce(atual,0)<>esperada or (esperada=0 and exists(select 1 from cadastro.tarefa_cuidado o where o.id=tarefa))
   or (esperada>0 and not exists(select 1 from cadastro.tarefa_cuidado o where o.id=tarefa and o.paciente_id=paciente)) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   delete from operacao.requisicao where id=anterior.id;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
  end if;
  if esperada=0 then insert into cadastro.tarefa_cuidado(id,paciente_id) values(tarefa,paciente); end if;
  insert into cadastro.tarefa_cuidado_versao(id,tarefa_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id)
   values(registro,tarefa,esperada+1,nullif(esperada,0),envelope,ator);
  end if;
  if reserva_atual.estado='aberta' then
   update operacao.reserva_tarefa_cuidado set estado='confirmada', chave_idempotencia=e->>'chave_idempotencia',
    digest_idempotencia=e->>'digest_idempotencia', paciente_id=paciente, tarefa_resultado_id=tarefa where id=reserva;
   if not found then raise exception using errcode='P0002',message='RESERVA_NAO_CONFIRMADA'; end if;
  end if;
  select jsonb_build_object('registro_id',v.id,'tarefa_id',v.tarefa_id,'paciente_id',paciente,'versao',v.versao,'conteudo',v.conteudo_cifrado)
   into resultado from cadastro.tarefa_cuidado_versao v where v.id=registro;
 else
  if e->'autorizacao_somente'='true'::jsonb then
   -- Prova de autorização: não seleciona tarefa nem envelope clínico. A auditoria
   -- obrigatória e a revalidação final de sessão abaixo são as mesmas da listagem.
   resultado:='[]'::jsonb;
  else
  select coalesce(jsonb_agg(jsonb_build_object('registro_id',v.id,'tarefa_id',o.id,'paciente_id',o.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado) order by o.id),'[]'::jsonb)
   into resultado from cadastro.tarefa_cuidado o
   join lateral (select * from cadastro.tarefa_cuidado_versao x where x.tarefa_id=o.id order by x.versao desc limit 1) v on true
   where o.paciente_id=paciente;
  end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req);
end $$;
select set_config('role',current_setting('ffcmapp.tarefa_autorizacao_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.tarefa_autorizacao_tinha_create')='false' then revoke create on schema api from ffcmapp_tarefa_owner; end if;
 if current_setting('ffcmapp.tarefa_autorizacao_tinha_set')='false' then execute format('revoke ffcmapp_tarefa_owner from %I granted by %I',current_user,current_user); end if;
end $$;
