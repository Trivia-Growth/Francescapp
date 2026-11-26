-- RASCUNHO: composição e escrita privadas sem grants de aplicação. Não aplicar nem ativar antes de revisão e provas integradas.
-- Preparação privada: contratos, autorização e provas integradas ainda pendentes. Não ativar.
-- Contrato privado: chamador deve autorizar e auditar reserva/reconciliação na mesma transação. Sem grants de aplicação.
-- Núcleo privado da barreira de concessão de acesso. Não é endpoint nem autorização:
-- o chamador futuro deve verificar JWT/Auth nativo, concessão, atestado e
-- auditar a operação na mesma transação. Sem grants até revisão S-02.
create table operacao.barreira_concessao_acesso_profissional (
  ator_usuario_id uuid primary key references public.usuario(id),
  epoca bigint not null default 1 check (epoca > 0),
  reserva_atual uuid,
  resultado_pendente uuid
);
create table operacao.reserva_concessao_acesso_profissional (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario(id),
  epoca bigint not null check (epoca > 0),
  estado text not null check (estado in ('aberta','confirmada','cancelada')),
  chave_idempotencia text,
  digest_idempotencia text,
  paciente_id uuid references cadastro.paciente(id),
  acesso_resultado_id uuid references cadastro.acesso_paciente(id),
  paciente_reservado_id uuid not null references cadastro.paciente(id),
  acao text not null check (acao in ('conceder','revogar')),
  acesso_reservado_id uuid references cadastro.acesso_paciente(id),
  versao_esperada integer,
  check ((acao='conceder' and acesso_reservado_id is null and versao_esperada is null)
    or (acao='revogar' and acesso_reservado_id is not null and versao_esperada > 0)),
  check ((estado = 'confirmada') = (acesso_resultado_id is not null)),
  check ((estado = 'confirmada' and chave_idempotencia is not null and digest_idempotencia is not null)
    or (estado <> 'confirmada' and chave_idempotencia is null and digest_idempotencia is null))
);
create table operacao.recibo_barreira_concessao_acesso_profissional (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario(id),
  epoca bigint not null check (epoca > 0),
  reserva_id uuid,
  resultado text not null check (resultado in ('vazia','cancelada','confirmada'))
);
alter table operacao.barreira_concessao_acesso_profissional enable row level security;
alter table operacao.reserva_concessao_acesso_profissional enable row level security;
alter table operacao.recibo_barreira_concessao_acesso_profissional enable row level security;
revoke all on operacao.barreira_concessao_acesso_profissional, operacao.reserva_concessao_acesso_profissional, operacao.recibo_barreira_concessao_acesso_profissional from public, anon, authenticated, service_role;

-- Primitivas SECURITY INVOKER, sem privilégios para aplicação. O ator deve vir
-- de auth_privado.uid() e ser autorizado pelo chamador, nunca de entrada do navegador.
create function operacao.reservar_concessao_acesso_profissional_privado(p_ator uuid,p_epoca bigint,p_reserva uuid,p_paciente uuid,p_acao text default 'conceder',p_acesso uuid default null,p_versao integer default null)
returns text language plpgsql security invoker set search_path='' as $$
declare b operacao.barreira_concessao_acesso_profissional; r operacao.reserva_concessao_acesso_profissional;
begin
 if p_ator is null or p_epoca is null or p_epoca < 1 or p_reserva is null or p_paciente is null or p_ator is distinct from auth_privado.uid() or p_acao not in ('conceder','revogar') or p_acao is null
  or (p_acao='conceder' and (p_acesso is not null or p_versao is not null))
  or (p_acao='revogar' and (p_acesso is null or p_versao is null or p_versao<1)) then return 'negada'; end if;
 -- Mesma ordem da gravação: paciente antes da barreira. A FK posterior não pode inverter locks.
 perform 1 from cadastro.paciente where id=p_paciente for key share;
 if not found then return 'negada'; end if;
 insert into operacao.barreira_concessao_acesso_profissional(ator_usuario_id) values(p_ator) on conflict do nothing;
 select * into b from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=p_ator for update;
 select * into r from operacao.reserva_concessao_acesso_profissional where id=p_reserva;
 if found then
  if r.ator_usuario_id=p_ator and r.epoca=p_epoca and r.paciente_reservado_id=p_paciente and r.acao=p_acao and r.acesso_reservado_id is not distinct from p_acesso and r.versao_esperada is not distinct from p_versao then return r.estado; end if;
  return 'id_reutilizado';
 end if;
 if b.epoca<>p_epoca then return 'epoca_antiga'; end if;
 if b.reserva_atual is not null or b.resultado_pendente is not null then return 'bloqueada'; end if;
 insert into operacao.reserva_concessao_acesso_profissional(id,ator_usuario_id,epoca,estado,paciente_reservado_id,acao,acesso_reservado_id,versao_esperada) values(p_reserva,p_ator,p_epoca,'aberta',p_paciente,p_acao,p_acesso,p_versao) on conflict do nothing;
 if not found then return 'id_reutilizado'; end if;
 update operacao.barreira_concessao_acesso_profissional set reserva_atual=p_reserva where ator_usuario_id=p_ator;
 return 'aberta';
end $$;

create function operacao.encerrar_concessao_acesso_profissional_privado(p_ator uuid,p_epoca bigint,p_reserva uuid,p_comando uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare b operacao.barreira_concessao_acesso_profissional; r operacao.reserva_concessao_acesso_profissional; c operacao.recibo_barreira_concessao_acesso_profissional; resultado text;
begin
 if p_ator is null or p_epoca is null or p_epoca < 1 or p_comando is null or p_ator is distinct from auth_privado.uid() then return 'negada'; end if;
 insert into operacao.barreira_concessao_acesso_profissional(ator_usuario_id) values(p_ator) on conflict do nothing;
 select * into b from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=p_ator for update;
 select * into c from operacao.recibo_barreira_concessao_acesso_profissional where id=p_comando;
 if found then
  if c.ator_usuario_id=p_ator and c.epoca=p_epoca and c.reserva_id is not distinct from p_reserva then return c.resultado; end if;
  return 'id_reutilizado';
 end if;
 if b.epoca<>p_epoca or b.reserva_atual is distinct from p_reserva or b.resultado_pendente is not null then return 'conflito'; end if;
 if p_reserva is null then resultado:='vazia';
 else
  select * into r from operacao.reserva_concessao_acesso_profissional where id=p_reserva and ator_usuario_id=p_ator and epoca=p_epoca for update;
  if not found or r.estado not in ('aberta','confirmada') then return 'conflito'; end if;
  resultado:=case when r.estado='aberta' then 'cancelada' else 'confirmada' end;
 end if;
 insert into operacao.recibo_barreira_concessao_acesso_profissional values(p_comando,p_ator,p_epoca,p_reserva,resultado) on conflict do nothing;
 if not found then return 'id_reutilizado'; end if;
 if p_reserva is not null then
  update operacao.reserva_concessao_acesso_profissional set estado=resultado where id=p_reserva;
 end if;
 update operacao.barreira_concessao_acesso_profissional set epoca=epoca+1,reserva_atual=null,
   resultado_pendente=case when p_reserva is null then null else p_comando end where ator_usuario_id=p_ator;
 return resultado;
end $$;
revoke all on function operacao.reservar_concessao_acesso_profissional_privado(uuid,bigint,uuid,uuid,text,uuid,integer), operacao.encerrar_concessao_acesso_profissional_privado(uuid,bigint,uuid,uuid) from public, anon, authenticated, service_role;

-- Primitivas privadas: o chamador deve validar sessão e autorização vigentes
-- na mesma transação. auth_privado.uid() identifica o ator, mas não autoriza acesso.
create function operacao.consultar_barreira_concessao_acesso_profissional_privado(p_request uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ator uuid:=auth_privado.uid(); b operacao.barreira_concessao_acesso_profissional; r operacao.reserva_concessao_acesso_profissional; c operacao.recibo_barreira_concessao_acesso_profissional; resultado jsonb;
begin
 if ator is null or p_request is null then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 -- Serializa consulta inicial com primeira reserva ainda não confirmada.
 insert into operacao.barreira_concessao_acesso_profissional(ator_usuario_id) values(ator) on conflict do nothing;
 select * into b from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=ator for update;
 if not found then resultado:=jsonb_build_object('epoca',1,'reserva',null,'resultado_pendente',null);
 else
  if b.reserva_atual is not null and b.resultado_pendente is not null then raise exception 'BARREIRA_INVALIDA'; end if;
  if b.reserva_atual is not null then
   select * into strict r from operacao.reserva_concessao_acesso_profissional where id=b.reserva_atual and ator_usuario_id=ator and epoca=b.epoca;
  end if;
  if b.resultado_pendente is not null then
   select * into strict c from operacao.recibo_barreira_concessao_acesso_profissional where id=b.resultado_pendente and ator_usuario_id=ator and epoca=b.epoca-1;
   if c.reserva_id is null or c.resultado not in ('cancelada','confirmada') then raise exception 'RECIBO_INVALIDO'; end if;
   select * into strict r from operacao.reserva_concessao_acesso_profissional where id=c.reserva_id and ator_usuario_id=ator and epoca=c.epoca and estado=c.resultado;
  end if;
  resultado:=jsonb_build_object('epoca',b.epoca,
   'reserva',case when b.reserva_atual is null then null else jsonb_build_object('id',r.id,'estado',r.estado) end,
   'resultado_pendente',case when b.resultado_pendente is null then null else jsonb_build_object('recibo_id',c.id,'reserva_id',r.id,'resultado',c.resultado,'paciente_id',r.paciente_reservado_id,'acao',r.acao,'acesso_id',case when r.acao='revogar' then r.acesso_reservado_id else r.acesso_resultado_id end,'versao_esperada',r.versao_esperada) end);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.consultar_barreira_concessao_acesso_profissional','requisicao',null,'permitido',p_request);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return resultado;
end $$;

create function operacao.reconhecer_barreira_concessao_acesso_profissional_privado(p_recibo uuid,p_request uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare ator uuid:=auth_privado.uid(); b operacao.barreira_concessao_acesso_profissional; c operacao.recibo_barreira_concessao_acesso_profissional;
begin
 if ator is null or p_recibo is null or p_request is null then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 select * into b from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=ator for update;
 select * into c from operacao.recibo_barreira_concessao_acesso_profissional where id=p_recibo and ator_usuario_id=ator and reserva_id is not null and resultado in ('cancelada','confirmada');
 if not found or b.ator_usuario_id is null or c.epoca>=b.epoca then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,'api.reconhecer_barreira_concessao_acesso_profissional','requisicao',null,'negado',p_request);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return 'conflito';
 end if;
 if b.resultado_pendente=p_recibo then
  update operacao.barreira_concessao_acesso_profissional set resultado_pendente=null where ator_usuario_id=ator;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.reconhecer_barreira_concessao_acesso_profissional','requisicao',p_recibo,'permitido',p_request);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return 'reconhecido';
end $$;
revoke all on function operacao.consultar_barreira_concessao_acesso_profissional_privado(uuid), operacao.reconhecer_barreira_concessao_acesso_profissional_privado(uuid,uuid) from public,anon,authenticated,service_role;



-- Escrita reservada: mantém autorização, auditoria e idempotência existentes.
-- Preparação privada. Sem grants de aplicação; exige revisão S-02 e provas reais antes de exposição.
create or replace function operacao.conceder_acesso_paciente_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado';
 ator uuid; sessao uuid; req uuid; paciente uuid; acesso uuid; destinatario uuid; auditoria_id uuid; reserva uuid; geracao bigint;
 b operacao.barreira_concessao_acesso_profissional; reserva_atual operacao.reserva_concessao_acesso_profissional;
 inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
 google record; autorizado boolean:=false; repeticao boolean:=false; anterior operacao.requisicao; resultado jsonb;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','acesso_id','usuario_id','reserva_id','geracao_reserva','auditoria_id','chave_idempotencia','digest_idempotencia','motivo','atestado'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  acesso:=(e->>'acesso_id')::uuid; reserva:=(e->>'reserva_id')::uuid; geracao:=(e->>'geracao_reserva')::bigint; destinatario:=(e->>'usuario_id')::uuid; auditoria_id:=(e->>'auditoria_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or acesso is null or destinatario is null or auditoria_id is null
  or reserva is null or geracao is null or geracao<1 or inicio is null or fim is null or a->>'usuario_id' is distinct from ator::text
  or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
  or a->>'operacao' is distinct from 'api.conceder_acesso_paciente'
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
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true' and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.subject_google into concessao,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' and c.perfil='administrador' for share;
   if found and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='administrador' for share;
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
 -- Exceção individual: mesma ordem de bloqueios das demais operações privadas.
 if not autorizado and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  select c.id into concessao from identidade.concessao_equipe c
   where c.usuario_id=ator and c.estado='vinculada' and c.metodo='tecnica' and c.perfil='administrador' for share;
  if found then
   perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='administrador' for share;
   if found then
    perform 1 from identidade.excecao_tecnica x where x.usuario_id=ator and x.concessao_id=concessao for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
      and s.metodo='tecnica' and s.revogada_em is null and s.encerrada_em is null for share;
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
    values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if jsonb_typeof(e->'geracao_reserva') is distinct from 'number' or coalesce(e->>'geracao_reserva','') !~ '^[1-9][0-9]*$'
  or jsonb_typeof(e->'motivo') is distinct from 'object' or (e->'motivo')-array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
  or e->'motivo'->'formato' is distinct from '1'::jsonb
  or jsonb_typeof(e->'motivo'->'key_id') is distinct from 'string' or coalesce(length(e->'motivo'->>'key_id') between 1 and 128,false) is not true
  or jsonb_typeof(e->'motivo'->'nonce') is distinct from 'string' or coalesce(e->'motivo'->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
  or jsonb_typeof(e->'motivo'->'tag') is distinct from 'string' or coalesce(e->'motivo'->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
  or jsonb_typeof(e->'motivo'->'ciphertext') is distinct from 'string' or coalesce(length(e->'motivo'->>'ciphertext') between 1 and 32768 and e->'motivo'->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true
  or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256,false) is not true
  or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$' then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- Mesma ordem do vínculo familiar: destinatário antes do paciente.
 perform 1 from public.usuario u where u.id=destinatario and u.ativo and u.perfil='profissional' for update;
 if found then
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','nao_encontrado'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 select * into b from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=ator for update;
 select * into reserva_atual from operacao.reserva_concessao_acesso_profissional re where re.id=reserva and re.ator_usuario_id=ator and re.epoca=geracao and re.paciente_reservado_id=paciente for update;
 if not found or b.epoca is distinct from geracao or b.reserva_atual is distinct from reserva
  or b.resultado_pendente is not null or reserva_atual.acao<>'conceder' or reserva_atual.estado not in ('aberta','confirmada') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
 end if;
 select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao='api.conceder_acesso_paciente' and r.chave_idempotencia=e->>'chave_idempotencia';
 repeticao:=found;
 if (reserva_atual.estado='aberta' and repeticao) or (reserva_atual.estado='confirmada' and
  (not repeticao or reserva_atual.chave_idempotencia is distinct from e->>'chave_idempotencia' or reserva_atual.digest_idempotencia is distinct from e->>'digest_idempotencia' or reserva_atual.acesso_resultado_id is distinct from anterior.resultado_id)) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
 end if;
 insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
  values(gen_random_uuid(),ator,'api.conceder_acesso_paciente',e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',acesso,1)
  on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
 if not found then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao='api.conceder_acesso_paciente' and r.chave_idempotencia=e->>'chave_idempotencia';
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
   or anterior.resultado_id is distinct from acesso or anterior.resultado_versao is distinct from 1
   or not exists(select 1 from cadastro.acesso_paciente x where x.id=acesso and x.paciente_id=paciente and x.usuario_id=destinatario and x.concedido_por_usuario_id=ator and x.revogada_em is null) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  repeticao:=true;
 else
  if exists(select 1 from cadastro.acesso_paciente x where x.id=acesso or (x.paciente_id=paciente and x.usuario_id=destinatario and x.revogada_em is null)) then
   delete from operacao.requisicao where id=anterior.id;
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
  end if;
  insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
   values(acesso,paciente,destinatario,ator,e->'motivo');
 end if;
 if reserva_atual.estado='aberta' then
  update operacao.reserva_concessao_acesso_profissional set estado='confirmada',chave_idempotencia=e->>'chave_idempotencia',digest_idempotencia=e->>'digest_idempotencia',paciente_id=paciente,acesso_resultado_id=acesso where id=reserva;
  if not found then raise exception using errcode='P0002',message='RESERVA_NAO_CONFIRMADA'; end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(case when repeticao then gen_random_uuid() else auditoria_id end,ator,'api.conceder_acesso_paciente','acesso_paciente',acesso,'permitido',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',jsonb_build_object('id',acesso,'versao',1),'request_id',req);
end $$;
revoke all on function operacao.conceder_acesso_paciente_privado(jsonb) from public,anon,authenticated,service_role;
-- Sem wrapper, owner ou grants de execução. Revisão S-02 e provas reais pendentes.

-- A escrita bloqueia a barreira e confirma apenas sua própria reserva.
grant select, update (epoca) on operacao.barreira_concessao_acesso_profissional to ffcmapp_conceder_acesso_owner;
grant select, update (estado,chave_idempotencia,digest_idempotencia,paciente_id,acesso_resultado_id)
 on operacao.reserva_concessao_acesso_profissional to ffcmapp_conceder_acesso_owner;
create policy concessao_acesso_barreira_select on operacao.barreira_concessao_acesso_profissional for select to ffcmapp_conceder_acesso_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy concessao_acesso_barreira_lock on operacao.barreira_concessao_acesso_profissional for update to ffcmapp_conceder_acesso_owner using (ator_usuario_id=(select auth_privado.uid())) with check (false);
create policy concessao_acesso_reserva_select on operacao.reserva_concessao_acesso_profissional for select to ffcmapp_conceder_acesso_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy concessao_acesso_reserva_update on operacao.reserva_concessao_acesso_profissional for update to ffcmapp_conceder_acesso_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));

-- Composição autorizada e owner privado; nenhum grant à aplicação.
-- Composição interna: S-02 e prova da concorrência Auth precedem ativação.
-- Revogação reservada: acesso privado e mesmas garantias de concessão.
grant select, update (epoca) on operacao.barreira_concessao_acesso_profissional to ffcmapp_revogar_acesso_owner;
grant select, update (estado,chave_idempotencia,digest_idempotencia,paciente_id,acesso_resultado_id) on operacao.reserva_concessao_acesso_profissional to ffcmapp_revogar_acesso_owner;
create policy revogar_acesso_barreira_select on operacao.barreira_concessao_acesso_profissional for select to ffcmapp_revogar_acesso_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy revogar_acesso_barreira_lock on operacao.barreira_concessao_acesso_profissional for update to ffcmapp_revogar_acesso_owner using (ator_usuario_id=(select auth_privado.uid())) with check (false);
create policy revogar_acesso_reserva_select on operacao.reserva_concessao_acesso_profissional for select to ffcmapp_revogar_acesso_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy revogar_acesso_reserva_update on operacao.reserva_concessao_acesso_profissional for update to ffcmapp_revogar_acesso_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
create or replace function operacao.revogar_acesso_paciente_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado';
 ator uuid; sessao uuid; req uuid; paciente uuid; acesso uuid; auditoria_id uuid;
 inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
 google record; autorizado boolean:=false; repeticao boolean:=false;
 anterior operacao.requisicao; atual cadastro.acesso_paciente; versao integer; reserva uuid; geracao bigint;
 b operacao.barreira_concessao_acesso_profissional; reserva_atual operacao.reserva_concessao_acesso_profissional;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','acesso_id','auditoria_id','chave_idempotencia','digest_idempotencia','versao_esperada','reserva_id','geracao_reserva','motivo','motivo_auditoria','atestado'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  acesso:=(e->>'acesso_id')::uuid; auditoria_id:=(e->>'auditoria_id')::uuid;
  versao:=(e->>'versao_esperada')::integer; reserva:=(e->>'reserva_id')::uuid; geracao:=(e->>'geracao_reserva')::bigint;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or acesso is null or auditoria_id is null
  or reserva is null or geracao is null or geracao<1 or inicio is null or fim is null or a->>'usuario_id' is distinct from ator::text
  or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
  or a->>'operacao' is distinct from 'api.revogar_acesso_paciente'
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
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true' and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.subject_google into concessao,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' and c.perfil='administrador' for share;
   if found and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='administrador' for share;
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
 -- Exceção individual: mesma ordem de bloqueios das demais operações privadas.
 if not autorizado and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  select c.id into concessao from identidade.concessao_equipe c
   where c.usuario_id=ator and c.estado='vinculada' and c.metodo='tecnica' and c.perfil='administrador' for share;
  if found then
   perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='administrador' for share;
   if found then
    perform 1 from identidade.excecao_tecnica x where x.usuario_id=ator and x.concessao_id=concessao for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
      and s.metodo='tecnica' and s.revogada_em is null and s.encerrada_em is null for share;
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
    values(gen_random_uuid(),ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if jsonb_typeof(e->'versao_esperada') is distinct from 'number' or coalesce(e->>'versao_esperada','') !~ '^[1-9][0-9]*$' or versao is null or versao<1 or versao>=2147483647
  or jsonb_typeof(e->'motivo') is distinct from 'object' or (e->'motivo')-array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
  or e->'motivo'->'formato' is distinct from '1'::jsonb
  or jsonb_typeof(e->'motivo'->'key_id') is distinct from 'string' or coalesce(length(e->'motivo'->>'key_id') between 1 and 128,false) is not true
  or jsonb_typeof(e->'motivo'->'nonce') is distinct from 'string' or coalesce(e->'motivo'->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
  or jsonb_typeof(e->'motivo'->'tag') is distinct from 'string' or coalesce(e->'motivo'->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
  or jsonb_typeof(e->'motivo'->'ciphertext') is distinct from 'string' or coalesce(length(e->'motivo'->>'ciphertext') between 1 and 32768 and e->'motivo'->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true
  or jsonb_typeof(e->'motivo_auditoria') is distinct from 'object' or (e->'motivo_auditoria')-array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
  or e->'motivo_auditoria'->'formato' is distinct from '1'::jsonb
  or jsonb_typeof(e->'motivo_auditoria'->'key_id') is distinct from 'string' or coalesce(length(e->'motivo_auditoria'->>'key_id') between 1 and 128,false) is not true
  or jsonb_typeof(e->'motivo_auditoria'->'nonce') is distinct from 'string' or coalesce(e->'motivo_auditoria'->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
  or jsonb_typeof(e->'motivo_auditoria'->'tag') is distinct from 'string' or coalesce(e->'motivo_auditoria'->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
  or jsonb_typeof(e->'motivo_auditoria'->'ciphertext') is distinct from 'string' or coalesce(length(e->'motivo_auditoria'->>'ciphertext') between 1 and 32768 and e->'motivo_auditoria'->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true
  or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256,false) is not true
  or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$' then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 perform 1 from cadastro.paciente where id=paciente for update;
 select * into b from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=ator for update;
 select * into reserva_atual from operacao.reserva_concessao_acesso_profissional where id=reserva and ator_usuario_id=ator and epoca=geracao and paciente_reservado_id=paciente for update;
 if not found or b.epoca is distinct from geracao or b.reserva_atual is distinct from reserva or b.resultado_pendente is not null
   or reserva_atual.acao<>'revogar' or reserva_atual.acesso_reservado_id is distinct from acesso or reserva_atual.versao_esperada is distinct from versao or reserva_atual.estado not in ('aberta','confirmada') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
 end if;
 select * into atual from cadastro.acesso_paciente where id=acesso and paciente_id=paciente for update;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','nao_encontrado'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if reserva_atual.estado='confirmada' and (reserva_atual.chave_idempotencia is distinct from e->>'chave_idempotencia' or reserva_atual.digest_idempotencia is distinct from e->>'digest_idempotencia' or reserva_atual.acesso_resultado_id is distinct from acesso) then
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
 end if;
 if (atual.revogada_em is not null or atual.versao<>versao) and not exists(
  select 1 from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao='api.revogar_acesso_paciente' and r.chave_idempotencia=e->>'chave_idempotencia'
 ) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
 end if;
 insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
  values(gen_random_uuid(),ator,'api.revogar_acesso_paciente',e->>'chave_idempotencia',e->>'digest_idempotencia','registrada',acesso,versao+1)
  on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
 if not found then
  select * into anterior from operacao.requisicao where ator_usuario_id=ator and operacao='api.revogar_acesso_paciente' and chave_idempotencia=e->>'chave_idempotencia';
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado is distinct from 'concluida'
   or anterior.resultado_id is distinct from acesso or anterior.resultado_versao is distinct from versao+1 then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'negado',req);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  repeticao:=true;
 else
  if atual.revogada_em is not null or atual.versao<>versao then
   raise exception using errcode='P0002',message='ESTADO_INCONSISTENTE';
  end if;
  update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=ator,
   motivo_revogacao_cifrado=e->'motivo',versao=versao+1 where id=acesso and paciente_id=paciente and revogada_em is null and cadastro.acesso_paciente.versao=versao;
  if not found then raise exception using errcode='P0002',message='ACESSO_NAO_ATUALIZADO'; end if;
  update operacao.requisicao set estado='concluida' where id=anterior.id and estado='registrada';
  if not found then raise exception using errcode='P0002',message='LEDGER_NAO_FINALIZADO'; end if;
 end if;
 if reserva_atual.estado='aberta' then
  if repeticao then raise exception using errcode='P0002',message='RESERVA_INCONSISTENTE'; end if;
  update operacao.reserva_concessao_acesso_profissional set estado='confirmada',chave_idempotencia=e->>'chave_idempotencia',digest_idempotencia=e->>'digest_idempotencia',paciente_id=paciente,acesso_resultado_id=acesso where id=reserva;
  if not found then raise exception using errcode='P0002',message='RESERVA_NAO_CONFIRMADA'; end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id,motivo_cifrado)
  values(case when repeticao then gen_random_uuid() else auditoria_id end,ator,'api.revogar_acesso_paciente','acesso_paciente',acesso,'permitido',req,case when repeticao then null else e->'motivo_auditoria' end);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',jsonb_build_object('id',acesso,'versao',versao+1),'request_id',req);
end $$;

create function operacao.acesso_barreira_composicao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid:=auth_privado.uid();
 sessao uuid; req uuid; reserva uuid; comando uuid; paciente uuid; epoca bigint; acao_alvo text; acesso_alvo uuid; versao_alvo integer;
 inicio timestamptz; fim timestamptz; dominio text; sujeito text; concessao uuid;
 google record; acao text; resposta text; dados jsonb; autorizado boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(a) is distinct from 'object'
  or e - array['request_id','operacao','epoca','reserva_id','comando_id','paciente_id','acao','acesso_id','versao_esperada','atestado'] <> '{}'::jsonb then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  sessao:=(auth_privado.jwt()->>'session_id')::uuid; req:=(e->>'request_id')::uuid;
  epoca:=(e->>'epoca')::bigint; reserva:=(e->>'reserva_id')::uuid; comando:=(e->>'comando_id')::uuid; paciente:=(e->>'paciente_id')::uuid; acao_alvo:=e->>'acao'; acesso_alvo:=(e->>'acesso_id')::uuid; versao_alvo:=(e->>'versao_esperada')::integer;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 acao:=e->>'operacao';
 if ator is null or sessao is null or req is null or inicio is null or fim is null
  or acao not in ('api.reservar_concessao_acesso_profissional','api.encerrar_concessao_acesso_profissional','api.consultar_barreira_concessao_acesso_profissional','api.reconhecer_barreira_concessao_acesso_profissional')
  or acao is null or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text or a->>'operacao' is distinct from acao
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if (acao<>'api.reservar_concessao_acesso_profissional' and (acao_alvo is not null or acesso_alvo is not null or versao_alvo is not null))
  or (acao='api.reservar_concessao_acesso_profissional' and (epoca is null or epoca<1 or reserva is null or comando is not null or paciente is null or acao_alvo not in ('conceder','revogar') or acao_alvo is null or (acao_alvo='conceder' and (acesso_alvo is not null or versao_alvo is not null)) or (acao_alvo='revogar' and (acesso_alvo is null or versao_alvo is null or versao_alvo<1))))
  or (acao='api.encerrar_concessao_acesso_profissional' and (epoca is null or epoca<1 or comando is null or paciente is not null))
  or (acao='api.consultar_barreira_concessao_acesso_profissional' and (epoca is not null or reserva is not null or comando is not null or paciente is not null))
  or (acao='api.reconhecer_barreira_concessao_acesso_profissional' and (epoca is not null or reserva is not null or comando is null or paciente is not null)) then
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
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' and c.perfil='administrador' for share;
   if found and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='administrador' for share;
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
 -- Exceção individual: mesma ordem de bloqueios das demais operações privadas.
 if not autorizado and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  select c.id into concessao from identidade.concessao_equipe c
   where c.usuario_id=ator and c.estado='vinculada' and c.metodo='tecnica' and c.perfil='administrador' for share;
  if found then
   perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='administrador' for share;
   if found then
    perform 1 from identidade.excecao_tecnica x where x.usuario_id=ator and x.concessao_id=concessao for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
      and s.metodo='tecnica' and s.revogada_em is null and s.encerrada_em is null for share;
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
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 -- Reserva bloqueia paciente antes da barreira, como a criação de contato.
 if acao='api.reservar_concessao_acesso_profissional' then
  perform 1 from cadastro.paciente where id=paciente for key share;
 end if;
 -- A espera pelo bloqueio não pode estender a validade do atestado.
 insert into operacao.barreira_concessao_acesso_profissional(ator_usuario_id) values(ator) on conflict do nothing;
 perform 1 from operacao.barreira_concessao_acesso_profissional where ator_usuario_id=ator for update;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao='api.consultar_barreira_concessao_acesso_profissional' then
  dados:=operacao.consultar_barreira_concessao_acesso_profissional_privado(req);
 elsif acao='api.reconhecer_barreira_concessao_acesso_profissional' then
  resposta:=operacao.reconhecer_barreira_concessao_acesso_profissional_privado(comando,req);
 elsif acao='api.reservar_concessao_acesso_profissional' then
  resposta:=operacao.reservar_concessao_acesso_profissional_privado(ator,epoca,reserva,paciente,acao_alvo,acesso_alvo,versao_alvo);
 else
  resposta:=operacao.encerrar_concessao_acesso_profissional_privado(ator,epoca,reserva,comando);
 end if;
 if acao in ('api.reservar_concessao_acesso_profissional','api.encerrar_concessao_acesso_profissional') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'requisicao',null,case when resposta in ('aberta','confirmada','cancelada','vazia') then 'permitido' else 'negado' end,req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',coalesce(dados,jsonb_build_object('estado',resposta)),'request_id',req);
end $$;
revoke all on function operacao.acesso_barreira_composicao_privada(jsonb) from public,anon,authenticated,service_role;

-- Wrapper invoker permanece inacessível até revisão de privilégios e provas reais.
create function api.acesso_barreira_composicao(p_transporte jsonb) returns jsonb
language sql security invoker set search_path='' set row_security=on as $$
 select operacao.acesso_barreira_composicao_privada(p_transporte)
$$;
revoke all on function api.acesso_barreira_composicao(jsonb) from public,anon,authenticated,service_role;

-- Preparação local: wrapper permanece inacessível à aplicação até S-02 e provas reais.
create role ffcmapp_acesso_barreira_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_acesso_barreira_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_acesso_barreira_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_acesso_barreira_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid,uuid) to ffcmapp_acesso_barreira_owner;
select set_config('ffcmapp.acesso_barreira_migrador',current_user,false);
select set_config('ffcmapp.acesso_barreira_tinha_verificador',pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET')::text,false);
do $$ begin
 if current_setting('ffcmapp.acesso_barreira_tinha_verificador')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
   where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
   raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_acesso_barreira_owner;
reset role;
select set_config('role',current_setting('ffcmapp.acesso_barreira_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.acesso_barreira_tinha_verificador')='false' then
  execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;
grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_acesso_barreira_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_acesso_barreira_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo), update (versao) on identidade.concessao_equipe to ffcmapp_acesso_barreira_owner;
grant select (session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_acesso_barreira_owner;
grant select (usuario_id,concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_acesso_barreira_owner;
grant insert (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id,motivo_cifrado) on auditoria.evento to ffcmapp_acesso_barreira_owner;

create policy acesso_barreira_config on identidade.configuracao_auth_nativo for select to ffcmapp_acesso_barreira_owner using (true);
create policy acesso_barreira_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_acesso_barreira_owner using (true) with check (false);
create policy acesso_barreira_usuario on public.usuario for select to ffcmapp_acesso_barreira_owner using (id=(select auth_privado.uid()));
create policy acesso_barreira_usuario_lock on public.usuario for update to ffcmapp_acesso_barreira_owner using (id=(select auth_privado.uid())) with check (false);
create policy acesso_barreira_concessao on identidade.concessao_equipe for select to ffcmapp_acesso_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy acesso_barreira_concessao_lock on identidade.concessao_equipe for update to ffcmapp_acesso_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy acesso_barreira_sessao on identidade.sessao for select to ffcmapp_acesso_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy acesso_barreira_sessao_lock on identidade.sessao for update to ffcmapp_acesso_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy acesso_barreira_excecao on identidade.excecao_tecnica for select to ffcmapp_acesso_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy acesso_barreira_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_acesso_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy acesso_barreira_auditoria on auditoria.evento for insert to ffcmapp_acesso_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));

-- SELECT FOR KEY SHARE exige UPDATE; WITH CHECK impede alteração do paciente.
grant select (id), update (id) on cadastro.paciente to ffcmapp_acesso_barreira_owner;
create policy acesso_barreira_paciente_select on cadastro.paciente for select to ffcmapp_acesso_barreira_owner using (true);
create policy acesso_barreira_paciente_lock on cadastro.paciente for update to ffcmapp_acesso_barreira_owner using (true) with check (false);

grant select, insert (ator_usuario_id), update (epoca,reserva_atual,resultado_pendente)
 on operacao.barreira_concessao_acesso_profissional to ffcmapp_acesso_barreira_owner;
grant select, insert (id,ator_usuario_id,epoca,estado,paciente_reservado_id,acao,acesso_reservado_id,versao_esperada), update (estado)
 on operacao.reserva_concessao_acesso_profissional to ffcmapp_acesso_barreira_owner;
grant select, insert (id,ator_usuario_id,epoca,reserva_id,resultado)
 on operacao.recibo_barreira_concessao_acesso_profissional to ffcmapp_acesso_barreira_owner;
create policy acesso_composicao_barreira_select on operacao.barreira_concessao_acesso_profissional for select to ffcmapp_acesso_barreira_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy acesso_composicao_barreira_insert on operacao.barreira_concessao_acesso_profissional for insert to ffcmapp_acesso_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));
create policy acesso_composicao_barreira_update on operacao.barreira_concessao_acesso_profissional for update to ffcmapp_acesso_barreira_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
create policy acesso_composicao_reserva_select on operacao.reserva_concessao_acesso_profissional for select to ffcmapp_acesso_barreira_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy acesso_composicao_reserva_insert on operacao.reserva_concessao_acesso_profissional for insert to ffcmapp_acesso_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));
create policy acesso_composicao_reserva_update on operacao.reserva_concessao_acesso_profissional for update to ffcmapp_acesso_barreira_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
create policy acesso_composicao_recibo_select on operacao.recibo_barreira_concessao_acesso_profissional for select to ffcmapp_acesso_barreira_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy acesso_composicao_recibo_insert on operacao.recibo_barreira_concessao_acesso_profissional for insert to ffcmapp_acesso_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));

grant execute on function operacao.acesso_barreira_composicao_privada(jsonb),
 operacao.reservar_concessao_acesso_profissional_privado(uuid,bigint,uuid,uuid,text,uuid,integer),
 operacao.encerrar_concessao_acesso_profissional_privado(uuid,bigint,uuid,uuid),
 operacao.consultar_barreira_concessao_acesso_profissional_privado(uuid),
 operacao.reconhecer_barreira_concessao_acesso_profissional_privado(uuid,uuid) to ffcmapp_acesso_barreira_owner;

alter function api.acesso_barreira_composicao(jsonb) owner to ffcmapp_acesso_barreira_owner;
set role ffcmapp_acesso_barreira_owner;
alter function api.acesso_barreira_composicao(jsonb) security definer;
revoke all on function api.acesso_barreira_composicao(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.acesso_barreira_migrador'),false);
revoke create on schema api from ffcmapp_acesso_barreira_owner;
revoke ffcmapp_acesso_barreira_owner from current_user;
