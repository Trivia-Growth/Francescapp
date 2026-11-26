-- Migration privada: sem EXECUTE para aplicação; requer revisão antes de aplicação.
-- Contrato privado: chamador deve autorizar e auditar reserva/reconciliação na mesma transação. Sem grants de aplicação.
-- Núcleo privado da barreira de tarefas. Não é endpoint nem autorização:
-- o chamador futuro deve verificar JWT/Auth nativo, concessão, atestado e
-- auditar a operação na mesma transação. Sem grants até revisão S-02.
create table operacao.barreira_tarefa_cuidado (
  ator_usuario_id uuid primary key references public.usuario(id),
  epoca bigint not null default 1 check (epoca > 0),
  reserva_atual uuid,
  resultado_pendente uuid
);
create table operacao.reserva_tarefa_cuidado (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario(id),
  epoca bigint not null check (epoca > 0),
  estado text not null check (estado in ('aberta','confirmada','cancelada')),
  chave_idempotencia text,
  digest_idempotencia text,
  paciente_id uuid references cadastro.paciente(id),
  tarefa_resultado_id uuid references cadastro.tarefa_cuidado(id),
  paciente_reservado_id uuid not null references cadastro.paciente(id),
  tarefa_reservada_id uuid not null,
  versao_esperada integer not null check (versao_esperada >= 0),
  check ((estado = 'confirmada') = (tarefa_resultado_id is not null)),
  check ((estado = 'confirmada' and chave_idempotencia is not null and digest_idempotencia is not null)
    or (estado <> 'confirmada' and chave_idempotencia is null and digest_idempotencia is null))
);
create table operacao.recibo_barreira_tarefa_cuidado (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario(id),
  epoca bigint not null check (epoca > 0),
  reserva_id uuid,
  resultado text not null check (resultado in ('vazia','cancelada','confirmada'))
);
alter table operacao.barreira_tarefa_cuidado enable row level security;
alter table operacao.reserva_tarefa_cuidado enable row level security;
alter table operacao.recibo_barreira_tarefa_cuidado enable row level security;
revoke all on operacao.barreira_tarefa_cuidado, operacao.reserva_tarefa_cuidado, operacao.recibo_barreira_tarefa_cuidado from public, anon, authenticated, service_role;

-- Primitivas SECURITY INVOKER, sem privilégios para aplicação. O ator deve vir
-- de auth_privado.uid() e ser autorizado pelo chamador, nunca de entrada do navegador.
create function operacao.reservar_tarefa_cuidado_privado(p_ator uuid,p_epoca bigint,p_reserva uuid,p_paciente uuid,p_tarefa uuid,p_versao integer)
returns text language plpgsql security invoker set search_path='' as $$
declare b operacao.barreira_tarefa_cuidado; r operacao.reserva_tarefa_cuidado;
begin
 if p_ator is null or p_epoca is null or p_epoca < 1 or p_reserva is null or p_paciente is null or p_tarefa is null or p_versao is null or p_versao < 0 or p_ator is distinct from auth_privado.uid() then return 'negada'; end if;
 -- Mesma ordem da gravação: paciente antes da barreira. A FK posterior não pode inverter locks.
 perform 1 from cadastro.paciente where id=p_paciente for key share;
 if not found then return 'negada'; end if;
 insert into operacao.barreira_tarefa_cuidado(ator_usuario_id) values(p_ator) on conflict do nothing;
 select * into b from operacao.barreira_tarefa_cuidado where ator_usuario_id=p_ator for update;
 select * into r from operacao.reserva_tarefa_cuidado where id=p_reserva;
 if found then
  if r.ator_usuario_id=p_ator and r.epoca=p_epoca and r.paciente_reservado_id=p_paciente and r.tarefa_reservada_id=p_tarefa and r.versao_esperada=p_versao then return r.estado; end if;
  return 'id_reutilizado';
 end if;
 if b.epoca<>p_epoca then return 'epoca_antiga'; end if;
 if b.reserva_atual is not null or b.resultado_pendente is not null then return 'bloqueada'; end if;
 insert into operacao.reserva_tarefa_cuidado(id,ator_usuario_id,epoca,estado,paciente_reservado_id,tarefa_reservada_id,versao_esperada) values(p_reserva,p_ator,p_epoca,'aberta',p_paciente,p_tarefa,p_versao) on conflict do nothing;
 if not found then return 'id_reutilizado'; end if;
 update operacao.barreira_tarefa_cuidado set reserva_atual=p_reserva where ator_usuario_id=p_ator;
 return 'aberta';
end $$;

create function operacao.encerrar_tarefa_cuidado_privado(p_ator uuid,p_epoca bigint,p_reserva uuid,p_comando uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare b operacao.barreira_tarefa_cuidado; r operacao.reserva_tarefa_cuidado; c operacao.recibo_barreira_tarefa_cuidado; resultado text;
begin
 if p_ator is null or p_epoca is null or p_epoca < 1 or p_comando is null or p_ator is distinct from auth_privado.uid() then return 'negada'; end if;
 insert into operacao.barreira_tarefa_cuidado(ator_usuario_id) values(p_ator) on conflict do nothing;
 select * into b from operacao.barreira_tarefa_cuidado where ator_usuario_id=p_ator for update;
 select * into c from operacao.recibo_barreira_tarefa_cuidado where id=p_comando;
 if found then
  if c.ator_usuario_id=p_ator and c.epoca=p_epoca and c.reserva_id is not distinct from p_reserva then return c.resultado; end if;
  return 'id_reutilizado';
 end if;
 if b.epoca<>p_epoca or b.reserva_atual is distinct from p_reserva or b.resultado_pendente is not null then return 'conflito'; end if;
 if p_reserva is null then resultado:='vazia';
 else
  select * into r from operacao.reserva_tarefa_cuidado where id=p_reserva and ator_usuario_id=p_ator and epoca=p_epoca for update;
  if not found or r.estado not in ('aberta','confirmada') then return 'conflito'; end if;
  resultado:=case when r.estado='aberta' then 'cancelada' else 'confirmada' end;
 end if;
 insert into operacao.recibo_barreira_tarefa_cuidado values(p_comando,p_ator,p_epoca,p_reserva,resultado) on conflict do nothing;
 if not found then return 'id_reutilizado'; end if;
 if p_reserva is not null then
  update operacao.reserva_tarefa_cuidado set estado=resultado where id=p_reserva;
 end if;
 update operacao.barreira_tarefa_cuidado set epoca=epoca+1,reserva_atual=null,
   resultado_pendente=case when p_reserva is null then null else p_comando end where ator_usuario_id=p_ator;
 return resultado;
end $$;
revoke all on function operacao.reservar_tarefa_cuidado_privado(uuid,bigint,uuid,uuid,uuid,integer), operacao.encerrar_tarefa_cuidado_privado(uuid,bigint,uuid,uuid) from public, anon, authenticated, service_role;

-- Primitivas privadas: o chamador deve validar sessão e autorização vigentes
-- na mesma transação. auth_privado.uid() identifica o ator, mas não autoriza acesso.
create function operacao.consultar_barreira_tarefa_cuidado_privado(p_request uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ator uuid:=auth_privado.uid(); b operacao.barreira_tarefa_cuidado; r operacao.reserva_tarefa_cuidado; c operacao.recibo_barreira_tarefa_cuidado; resultado jsonb;
begin
 if ator is null or p_request is null then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 -- Serializa consulta inicial com primeira reserva ainda não confirmada.
 insert into operacao.barreira_tarefa_cuidado(ator_usuario_id) values(ator) on conflict do nothing;
 select * into b from operacao.barreira_tarefa_cuidado where ator_usuario_id=ator for update;
 if not found then resultado:=jsonb_build_object('epoca',1,'reserva',null,'resultado_pendente',null);
 else
  if b.reserva_atual is not null and b.resultado_pendente is not null then raise exception 'BARREIRA_INVALIDA'; end if;
  if b.reserva_atual is not null then
   select * into strict r from operacao.reserva_tarefa_cuidado where id=b.reserva_atual and ator_usuario_id=ator and epoca=b.epoca;
  end if;
  if b.resultado_pendente is not null then
   select * into strict c from operacao.recibo_barreira_tarefa_cuidado where id=b.resultado_pendente and ator_usuario_id=ator and epoca=b.epoca-1;
   if c.reserva_id is null or c.resultado not in ('cancelada','confirmada') then raise exception 'RECIBO_INVALIDO'; end if;
   select * into strict r from operacao.reserva_tarefa_cuidado where id=c.reserva_id and ator_usuario_id=ator and epoca=c.epoca and estado=c.resultado;
  end if;
  resultado:=jsonb_build_object('epoca',b.epoca,
   'reserva',case when b.reserva_atual is null then null else jsonb_build_object('id',r.id,'estado',r.estado) end,
   'resultado_pendente',case when b.resultado_pendente is null then null else jsonb_build_object('recibo_id',c.id,'reserva_id',r.id,'resultado',c.resultado,'paciente_id',r.paciente_reservado_id,'tarefa_id',r.tarefa_reservada_id,'versao_esperada',r.versao_esperada) end);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.consultar_barreira_tarefa_cuidado','requisicao',null,'permitido',p_request);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return resultado;
end $$;

create function operacao.reconhecer_barreira_tarefa_cuidado_privado(p_recibo uuid,p_request uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare ator uuid:=auth_privado.uid(); b operacao.barreira_tarefa_cuidado; c operacao.recibo_barreira_tarefa_cuidado;
begin
 if ator is null or p_recibo is null or p_request is null then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 select * into b from operacao.barreira_tarefa_cuidado where ator_usuario_id=ator for update;
 select * into c from operacao.recibo_barreira_tarefa_cuidado where id=p_recibo and ator_usuario_id=ator and reserva_id is not null and resultado in ('cancelada','confirmada');
 if not found or b.ator_usuario_id is null or c.epoca>=b.epoca then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,'api.reconhecer_barreira_tarefa_cuidado','requisicao',null,'negado',p_request);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return 'conflito';
 end if;
 if b.resultado_pendente=p_recibo then
  update operacao.barreira_tarefa_cuidado set resultado_pendente=null where ator_usuario_id=ator;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.reconhecer_barreira_tarefa_cuidado','requisicao',p_recibo,'permitido',p_request);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return 'reconhecido';
end $$;
revoke all on function operacao.consultar_barreira_tarefa_cuidado_privado(uuid), operacao.reconhecer_barreira_tarefa_cuidado_privado(uuid,uuid) from public,anon,authenticated,service_role;




-- Somente privilégios internos ao owner da RPC; nenhum grant à aplicação.
grant select, update (epoca) on operacao.barreira_tarefa_cuidado to ffcmapp_tarefa_owner;
grant select, update (estado,chave_idempotencia,digest_idempotencia,paciente_id,tarefa_resultado_id)
 on operacao.reserva_tarefa_cuidado to ffcmapp_tarefa_owner;
create policy tarefa_barreira_select on operacao.barreira_tarefa_cuidado for select to ffcmapp_tarefa_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy tarefa_barreira_lock on operacao.barreira_tarefa_cuidado for update to ffcmapp_tarefa_owner using (ator_usuario_id=(select auth_privado.uid())) with check (false);
create policy tarefa_reserva_select on operacao.reserva_tarefa_cuidado for select to ffcmapp_tarefa_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy tarefa_reserva_update on operacao.reserva_tarefa_cuidado for update to ffcmapp_tarefa_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));

-- O migrador deve assumir o owner existente antes da substituição e restaurar
-- sua membership e CREATE transitórios, preservando ACL/owner da função.
-- Preparação local fechada: revisão e provas reais são pré-requisitos para aplicação.
select set_config('ffcmapp.barreira_migrador',current_user,false);
select set_config('ffcmapp.barreira_tinha_set',pg_has_role(current_user,'ffcmapp_tarefa_owner','SET')::text,false);
select set_config('ffcmapp.barreira_tinha_create',has_schema_privilege('ffcmapp_tarefa_owner','api','CREATE')::text,false);
do $$ begin
 if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='api.tarefa_cuidado_operacao_privada(jsonb)'::regprocedure and r.rolname='ffcmapp_tarefa_owner' and p.prosecdef) then raise exception 'WRAPPER_INESPERADO'; end if;
 if current_setting('ffcmapp.barreira_tinha_set')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='ffcmapp_tarefa_owner' and u.rolname=current_user and g.rolname=current_user) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET'; end if;
  execute format('grant ffcmapp_tarefa_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
 if current_setting('ffcmapp.barreira_tinha_create')='false' then grant create on schema api to ffcmapp_tarefa_owner; end if;
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
  or e - array['request_id','paciente_id','tarefa_id','registro_id','versao_esperada','conteudo','aad','atestado','chave_idempotencia','digest_idempotencia','reserva_id','geracao_reserva'] <> '{}'::jsonb
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
  if e - array['request_id','paciente_id','atestado'] <> '{}'::jsonb then
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
  select coalesce(jsonb_agg(jsonb_build_object('registro_id',v.id,'tarefa_id',o.id,'paciente_id',o.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado) order by o.id),'[]'::jsonb)
   into resultado from cadastro.tarefa_cuidado o
   join lateral (select * from cadastro.tarefa_cuidado_versao x where x.tarefa_id=o.id order by x.versao desc limit 1) v on true
   where o.paciente_id=paciente;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req);
end $$;

select set_config('role',current_setting('ffcmapp.barreira_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.barreira_tinha_create')='false' then revoke create on schema api from ffcmapp_tarefa_owner; end if;
 if current_setting('ffcmapp.barreira_tinha_set')='false' then execute format('revoke ffcmapp_tarefa_owner from %I granted by %I',current_user,current_user); end if;
end $$;

create function operacao.tarefa_barreira_composicao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid:=auth_privado.uid();
 sessao uuid; req uuid; reserva uuid; comando uuid; paciente uuid; tarefa uuid; versao integer; epoca bigint;
 inicio timestamptz; fim timestamptz; dominio text; sujeito text; concessao uuid;
 google record; acao text; resposta text; dados jsonb; pacientes_antes uuid[]; pacientes_depois uuid[]; paciente_alvo uuid; autorizado boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(a) is distinct from 'object'
  or e - array['request_id','operacao','epoca','reserva_id','comando_id','paciente_id','tarefa_id','versao_esperada','atestado'] <> '{}'::jsonb then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  sessao:=(auth_privado.jwt()->>'session_id')::uuid; req:=(e->>'request_id')::uuid;
  epoca:=(e->>'epoca')::bigint; reserva:=(e->>'reserva_id')::uuid; comando:=(e->>'comando_id')::uuid; paciente:=(e->>'paciente_id')::uuid; tarefa:=(e->>'tarefa_id')::uuid; versao:=(e->>'versao_esperada')::integer;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 acao:=e->>'operacao';
 if ator is null or sessao is null or req is null or inicio is null or fim is null
  or acao not in ('api.reservar_tarefa_cuidado','api.encerrar_tarefa_cuidado','api.consultar_barreira_tarefa_cuidado','api.reconhecer_barreira_tarefa_cuidado')
  or acao is null or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text or a->>'operacao' is distinct from acao
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if (acao='api.reservar_tarefa_cuidado' and (epoca is null or epoca<1 or reserva is null or comando is not null or paciente is null or tarefa is null or versao is null or versao<0))
  or (acao='api.encerrar_tarefa_cuidado' and (epoca is null or epoca<1 or comando is null or paciente is not null))
  or (acao='api.consultar_barreira_tarefa_cuidado' and (epoca is not null or reserva is not null or comando is not null or paciente is not null))
  or (acao='api.reconhecer_barreira_tarefa_cuidado' and (epoca is not null or reserva is not null or comando is null or paciente is not null)) then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true' and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.subject_google into concessao,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' and c.perfil='profissional' for share;
   if found and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='profissional' for share;
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
    values(gen_random_uuid(),ator,acao,'requisicao',null,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'requisicao',null,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 -- Reserva bloqueia paciente antes da barreira, como a criação de contato.
 if acao='api.reservar_tarefa_cuidado' then
  perform 1 from cadastro.acesso_paciente ap where ap.paciente_id=paciente and ap.usuario_id=ator and ap.revogada_em is null for share;
  if not found then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'requisicao',null,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for key share;
 end if;
 -- Descobre vínculos sem lock da barreira; trava vínculos em ordem estável
 -- antes da barreira e revalida a lista após o lock, sem inverter a ordem.
 if acao<>'api.reservar_tarefa_cuidado' then
  select coalesce(array_agg(distinct r.paciente_reservado_id order by r.paciente_reservado_id),'{}'::uuid[])
   from operacao.reserva_tarefa_cuidado r
   where r.ator_usuario_id=ator and (
    (acao='api.encerrar_tarefa_cuidado' and r.id=reserva)
    or (acao in ('api.encerrar_tarefa_cuidado','api.reconhecer_barreira_tarefa_cuidado') and r.id in
     (select c.reserva_id from operacao.recibo_barreira_tarefa_cuidado c where c.id=comando and c.ator_usuario_id=ator))
    or (acao='api.consultar_barreira_tarefa_cuidado' and r.id in
     (select b.reserva_atual from operacao.barreira_tarefa_cuidado b where b.ator_usuario_id=ator
      union all
      select c.reserva_id from operacao.barreira_tarefa_cuidado b join operacao.recibo_barreira_tarefa_cuidado c on c.id=b.resultado_pendente where b.ator_usuario_id=ator))
   ) into pacientes_antes;
  foreach paciente_alvo in array pacientes_antes loop
   perform 1 from cadastro.acesso_paciente ap where ap.paciente_id=paciente_alvo and ap.usuario_id=ator and ap.revogada_em is null for share;
   if not found then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'requisicao',null,'negado',req);
    if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
   end if;
  end loop;
 end if;
 -- A espera pelo bloqueio não pode estender a validade do atestado.
 insert into operacao.barreira_tarefa_cuidado(ator_usuario_id) values(ator) on conflict do nothing;
 perform 1 from operacao.barreira_tarefa_cuidado where ator_usuario_id=ator for update;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao<>'api.reservar_tarefa_cuidado' then
  select coalesce(array_agg(distinct r.paciente_reservado_id order by r.paciente_reservado_id),'{}'::uuid[])
   from operacao.reserva_tarefa_cuidado r
   where r.ator_usuario_id=ator and (
    (acao='api.encerrar_tarefa_cuidado' and r.id=reserva)
    or (acao in ('api.encerrar_tarefa_cuidado','api.reconhecer_barreira_tarefa_cuidado') and r.id in
     (select c.reserva_id from operacao.recibo_barreira_tarefa_cuidado c where c.id=comando and c.ator_usuario_id=ator))
    or (acao='api.consultar_barreira_tarefa_cuidado' and r.id in
     (select b.reserva_atual from operacao.barreira_tarefa_cuidado b where b.ator_usuario_id=ator
      union all
      select c.reserva_id from operacao.barreira_tarefa_cuidado b join operacao.recibo_barreira_tarefa_cuidado c on c.id=b.resultado_pendente where b.ator_usuario_id=ator))
   ) into pacientes_depois;
  if pacientes_depois is distinct from pacientes_antes then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'requisicao',null,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
 end if;
 if acao='api.consultar_barreira_tarefa_cuidado' then
  dados:=operacao.consultar_barreira_tarefa_cuidado_privado(req);
 elsif acao='api.reconhecer_barreira_tarefa_cuidado' then
  resposta:=operacao.reconhecer_barreira_tarefa_cuidado_privado(comando,req);
 elsif acao='api.reservar_tarefa_cuidado' then
  resposta:=operacao.reservar_tarefa_cuidado_privado(ator,epoca,reserva,paciente,tarefa,versao);
 else
  resposta:=operacao.encerrar_tarefa_cuidado_privado(ator,epoca,reserva,comando);
 end if;
 if acao in ('api.reservar_tarefa_cuidado','api.encerrar_tarefa_cuidado') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'requisicao',null,case when resposta in ('aberta','confirmada','cancelada','vazia') then 'permitido' else 'negado' end,req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',coalesce(dados,jsonb_build_object('estado',resposta)),'request_id',req);
end $$;
revoke all on function operacao.tarefa_barreira_composicao_privada(jsonb) from public,anon,authenticated,service_role;

-- Wrapper invoker permanece inacessível até revisão de privilégios e provas reais.
create function api.tarefa_barreira_composicao(p_transporte jsonb) returns jsonb
language sql security invoker set search_path='' set row_security=on as $$
 select operacao.tarefa_barreira_composicao_privada(p_transporte)
$$;
revoke all on function api.tarefa_barreira_composicao(jsonb) from public,anon,authenticated,service_role;


-- Preparação local: wrapper permanece inacessível à aplicação até S-02 e provas reais.
create role ffcmapp_tarefa_barreira_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_tarefa_barreira_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_tarefa_barreira_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_tarefa_barreira_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid,uuid) to ffcmapp_tarefa_barreira_owner;
select set_config('ffcmapp.tarefa_barreira_migrador',current_user,false);
select set_config('ffcmapp.tarefa_barreira_tinha_verificador',pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET')::text,false);
do $$ begin
 if current_setting('ffcmapp.tarefa_barreira_tinha_verificador')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
   where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
   raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_tarefa_barreira_owner;
reset role;
select set_config('role',current_setting('ffcmapp.tarefa_barreira_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.tarefa_barreira_tinha_verificador')='false' then
  execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;
grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_tarefa_barreira_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_tarefa_barreira_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo), update (versao) on identidade.concessao_equipe to ffcmapp_tarefa_barreira_owner;
grant select (session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_tarefa_barreira_owner;
grant select (usuario_id,concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_tarefa_barreira_owner;
grant insert (id,ator_usuario_id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_tarefa_barreira_owner;

create policy tarefa_barreira_config on identidade.configuracao_auth_nativo for select to ffcmapp_tarefa_barreira_owner using (true);
create policy tarefa_barreira_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_tarefa_barreira_owner using (true) with check (false);
create policy tarefa_barreira_usuario on public.usuario for select to ffcmapp_tarefa_barreira_owner using (id=(select auth_privado.uid()));
create policy tarefa_barreira_usuario_lock on public.usuario for update to ffcmapp_tarefa_barreira_owner using (id=(select auth_privado.uid())) with check (false);
create policy tarefa_barreira_concessao on identidade.concessao_equipe for select to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy tarefa_barreira_concessao_lock on identidade.concessao_equipe for update to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy tarefa_barreira_sessao on identidade.sessao for select to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy tarefa_barreira_sessao_lock on identidade.sessao for update to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy tarefa_barreira_excecao on identidade.excecao_tecnica for select to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy tarefa_barreira_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy tarefa_barreira_auditoria on auditoria.evento for insert to ffcmapp_tarefa_barreira_owner with check ((ator_usuario_id=(select auth_privado.uid()) and ator_auth_id is null) or (ator_usuario_id is null and ator_auth_id=(select auth_privado.uid())));

grant select (paciente_id,usuario_id,revogada_em), update (versao) on cadastro.acesso_paciente to ffcmapp_tarefa_barreira_owner;
create policy tarefa_barreira_acesso on cadastro.acesso_paciente for select to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy tarefa_barreira_acesso_lock on cadastro.acesso_paciente for update to ffcmapp_tarefa_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);

-- SELECT FOR KEY SHARE exige UPDATE; WITH CHECK impede alteração do paciente.
grant select (id), update (id) on cadastro.paciente to ffcmapp_tarefa_barreira_owner;
create policy tarefa_barreira_paciente_select on cadastro.paciente for select to ffcmapp_tarefa_barreira_owner using (true);
create policy tarefa_barreira_paciente_lock on cadastro.paciente for update to ffcmapp_tarefa_barreira_owner using (true) with check (false);

grant select, insert (ator_usuario_id), update (epoca,reserva_atual,resultado_pendente)
 on operacao.barreira_tarefa_cuidado to ffcmapp_tarefa_barreira_owner;
grant select, insert (id,ator_usuario_id,epoca,estado,paciente_reservado_id,tarefa_reservada_id,versao_esperada), update (estado)
 on operacao.reserva_tarefa_cuidado to ffcmapp_tarefa_barreira_owner;
grant select, insert (id,ator_usuario_id,epoca,reserva_id,resultado)
 on operacao.recibo_barreira_tarefa_cuidado to ffcmapp_tarefa_barreira_owner;
create policy composicao_barreira_select on operacao.barreira_tarefa_cuidado for select to ffcmapp_tarefa_barreira_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_barreira_insert on operacao.barreira_tarefa_cuidado for insert to ffcmapp_tarefa_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_barreira_update on operacao.barreira_tarefa_cuidado for update to ffcmapp_tarefa_barreira_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_reserva_select on operacao.reserva_tarefa_cuidado for select to ffcmapp_tarefa_barreira_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_reserva_insert on operacao.reserva_tarefa_cuidado for insert to ffcmapp_tarefa_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_reserva_update on operacao.reserva_tarefa_cuidado for update to ffcmapp_tarefa_barreira_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_recibo_select on operacao.recibo_barreira_tarefa_cuidado for select to ffcmapp_tarefa_barreira_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy composicao_recibo_insert on operacao.recibo_barreira_tarefa_cuidado for insert to ffcmapp_tarefa_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));

grant execute on function operacao.tarefa_barreira_composicao_privada(jsonb),
 operacao.reservar_tarefa_cuidado_privado(uuid,bigint,uuid,uuid,uuid,integer),
 operacao.encerrar_tarefa_cuidado_privado(uuid,bigint,uuid,uuid),
 operacao.consultar_barreira_tarefa_cuidado_privado(uuid),
 operacao.reconhecer_barreira_tarefa_cuidado_privado(uuid,uuid) to ffcmapp_tarefa_barreira_owner;

alter function api.tarefa_barreira_composicao(jsonb) owner to ffcmapp_tarefa_barreira_owner;
set role ffcmapp_tarefa_barreira_owner;
alter function api.tarefa_barreira_composicao(jsonb) security definer;
revoke all on function api.tarefa_barreira_composicao(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.tarefa_barreira_migrador'),false);
revoke create on schema api from ffcmapp_tarefa_barreira_owner;
revoke ffcmapp_tarefa_barreira_owner from current_user;
