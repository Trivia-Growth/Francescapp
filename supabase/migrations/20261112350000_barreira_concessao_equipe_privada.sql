-- Preparação privada fechada; sem grants externos. Revisão S-02 e provas reais precedem ativação.
-- Primitivas exigem composição autorizada e auditada na mesma transação.
create table operacao.barreira_concessao_equipe (
  ator_usuario_id uuid primary key references public.usuario(id),
  epoca bigint not null default 1 check (epoca > 0),
  reserva_atual uuid,
  resultado_pendente uuid
);
create table operacao.reserva_concessao_equipe (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario(id),
  epoca bigint not null check (epoca > 0),
  estado text not null check (estado in ('aberta','confirmada','cancelada')),
  chave_idempotencia text,
  digest_idempotencia text,
  concessao_resultado_id uuid references identidade.concessao_equipe(id),
  check ((estado = 'confirmada') = (concessao_resultado_id is not null)),
  check ((estado = 'confirmada' and chave_idempotencia is not null and digest_idempotencia is not null)
    or (estado <> 'confirmada' and chave_idempotencia is null and digest_idempotencia is null))
);
create table operacao.recibo_barreira_concessao_equipe (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario(id),
  epoca bigint not null check (epoca > 0),
  reserva_id uuid,
  resultado text not null check (resultado in ('vazia','cancelada','confirmada'))
);
alter table operacao.barreira_concessao_equipe enable row level security;
alter table operacao.reserva_concessao_equipe enable row level security;
alter table operacao.recibo_barreira_concessao_equipe enable row level security;
revoke all on operacao.barreira_concessao_equipe, operacao.reserva_concessao_equipe, operacao.recibo_barreira_concessao_equipe from public, anon, authenticated, service_role;

-- Primitivas SECURITY INVOKER, sem privilégios para aplicação. O ator deve vir
-- de auth_privado.uid() e ser autorizado pelo chamador, nunca de entrada do navegador.
create function operacao.reservar_concessao_equipe_privado(p_ator uuid,p_epoca bigint,p_reserva uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare b operacao.barreira_concessao_equipe; r operacao.reserva_concessao_equipe;
begin
 if p_ator is null or p_epoca is null or p_epoca < 1 or p_reserva is null or p_ator is distinct from auth_privado.uid() then return 'negada'; end if;
 insert into operacao.barreira_concessao_equipe(ator_usuario_id) values(p_ator) on conflict do nothing;
 select * into b from operacao.barreira_concessao_equipe where ator_usuario_id=p_ator for update;
 select * into r from operacao.reserva_concessao_equipe where id=p_reserva;
 if found then
  if r.ator_usuario_id=p_ator and r.epoca=p_epoca then return r.estado; end if;
  return 'id_reutilizado';
 end if;
 if b.epoca<>p_epoca then return 'epoca_antiga'; end if;
 if b.reserva_atual is not null or b.resultado_pendente is not null then return 'bloqueada'; end if;
 insert into operacao.reserva_concessao_equipe(id,ator_usuario_id,epoca,estado) values(p_reserva,p_ator,p_epoca,'aberta') on conflict do nothing;
 if not found then return 'id_reutilizado'; end if;
 update operacao.barreira_concessao_equipe set reserva_atual=p_reserva where ator_usuario_id=p_ator;
 return 'aberta';
end $$;

create function operacao.encerrar_concessao_equipe_privado(p_ator uuid,p_epoca bigint,p_reserva uuid,p_comando uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare b operacao.barreira_concessao_equipe; r operacao.reserva_concessao_equipe; c operacao.recibo_barreira_concessao_equipe; resultado text;
begin
 if p_ator is null or p_epoca is null or p_epoca < 1 or p_comando is null or p_ator is distinct from auth_privado.uid() then return 'negada'; end if;
 insert into operacao.barreira_concessao_equipe(ator_usuario_id) values(p_ator) on conflict do nothing;
 select * into b from operacao.barreira_concessao_equipe where ator_usuario_id=p_ator for update;
 select * into c from operacao.recibo_barreira_concessao_equipe where id=p_comando;
 if found then
  if c.ator_usuario_id=p_ator and c.epoca=p_epoca and c.reserva_id is not distinct from p_reserva then return c.resultado; end if;
  return 'id_reutilizado';
 end if;
 if b.epoca<>p_epoca or b.reserva_atual is distinct from p_reserva or b.resultado_pendente is not null then return 'conflito'; end if;
 if p_reserva is null then resultado:='vazia';
 else
  select * into r from operacao.reserva_concessao_equipe where id=p_reserva and ator_usuario_id=p_ator and epoca=p_epoca for update;
  if not found or r.estado not in ('aberta','confirmada') then return 'conflito'; end if;
  resultado:=case when r.estado='aberta' then 'cancelada' else 'confirmada' end;
 end if;
 insert into operacao.recibo_barreira_concessao_equipe values(p_comando,p_ator,p_epoca,p_reserva,resultado) on conflict do nothing;
 if not found then return 'id_reutilizado'; end if;
 if p_reserva is not null then
  update operacao.reserva_concessao_equipe set estado=resultado where id=p_reserva;
 end if;
 update operacao.barreira_concessao_equipe set epoca=epoca+1,reserva_atual=null,
   resultado_pendente=case when p_reserva is null then null else p_comando end where ator_usuario_id=p_ator;
 return resultado;
end $$;
revoke all on function operacao.reservar_concessao_equipe_privado(uuid,bigint,uuid), operacao.encerrar_concessao_equipe_privado(uuid,bigint,uuid,uuid) from public, anon, authenticated, service_role;

-- Primitivas privadas: o chamador deve validar sessão e autorização vigentes
-- na mesma transação. auth_privado.uid() identifica o ator, mas não autoriza acesso.
create function operacao.consultar_barreira_concessao_equipe_privado(p_request uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ator uuid:=auth_privado.uid(); b operacao.barreira_concessao_equipe; r operacao.reserva_concessao_equipe; c operacao.recibo_barreira_concessao_equipe; resultado jsonb;
begin
 if ator is null or p_request is null then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 -- Serializa consulta inicial com primeira reserva ainda não confirmada.
 insert into operacao.barreira_concessao_equipe(ator_usuario_id) values(ator) on conflict do nothing;
 select * into b from operacao.barreira_concessao_equipe where ator_usuario_id=ator for update;
 if not found then resultado:=jsonb_build_object('epoca',1,'reserva',null,'resultado_pendente',null);
 else
  if b.reserva_atual is not null and b.resultado_pendente is not null then raise exception 'BARREIRA_INVALIDA'; end if;
  if b.reserva_atual is not null then
   select * into strict r from operacao.reserva_concessao_equipe where id=b.reserva_atual and ator_usuario_id=ator and epoca=b.epoca;
  end if;
  if b.resultado_pendente is not null then
   select * into strict c from operacao.recibo_barreira_concessao_equipe where id=b.resultado_pendente and ator_usuario_id=ator and epoca=b.epoca-1;
   if c.reserva_id is null or c.resultado not in ('cancelada','confirmada') then raise exception 'RECIBO_INVALIDO'; end if;
   select * into strict r from operacao.reserva_concessao_equipe where id=c.reserva_id and ator_usuario_id=ator and epoca=c.epoca and estado=c.resultado;
  end if;
  resultado:=jsonb_build_object('epoca',b.epoca,
   'reserva',case when b.reserva_atual is null then null else jsonb_build_object('id',r.id,'estado',r.estado) end,
   'resultado_pendente',case when b.resultado_pendente is null then null else jsonb_build_object('recibo_id',c.id,'reserva_id',r.id,'resultado',c.resultado,'concessao_id',r.concessao_resultado_id) end);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.consultar_barreira_concessao_equipe','requisicao',null,'permitido',p_request);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return resultado;
end $$;

create function operacao.reconhecer_barreira_concessao_equipe_privado(p_recibo uuid,p_request uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare ator uuid:=auth_privado.uid(); b operacao.barreira_concessao_equipe; c operacao.recibo_barreira_concessao_equipe;
begin
 if ator is null or p_recibo is null or p_request is null then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 select * into b from operacao.barreira_concessao_equipe where ator_usuario_id=ator for update;
 select * into c from operacao.recibo_barreira_concessao_equipe where id=p_recibo and ator_usuario_id=ator and reserva_id is not null and resultado in ('cancelada','confirmada');
 if not found or b.ator_usuario_id is null or c.epoca>=b.epoca then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,'api.reconhecer_barreira_concessao_equipe','requisicao',null,'negado',p_request);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return 'conflito';
 end if;
 if b.resultado_pendente=p_recibo then
  update operacao.barreira_concessao_equipe set resultado_pendente=null where ator_usuario_id=ator;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.reconhecer_barreira_concessao_equipe','requisicao',p_recibo,'permitido',p_request);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return 'reconhecido';
end $$;
revoke all on function operacao.consultar_barreira_concessao_equipe_privado(uuid), operacao.reconhecer_barreira_concessao_equipe_privado(uuid,uuid) from public,anon,authenticated,service_role;




-- Substituição privada; privilégios do owner são restritos abaixo.
create or replace function operacao.criar_concessao_equipe_privado(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado';
 ator uuid; sessao uuid; req uuid; paciente uuid; acesso uuid; destinatario uuid; auditoria_id uuid;
 inicio timestamptz; fim timestamptz; concessao uuid; dominio text; sujeito text;
 google record; autorizado boolean:=false; repeticao boolean:=false; anterior operacao.requisicao; resultado jsonb; versao text; candidato jsonb; reserva uuid; geracao bigint; b operacao.barreira_concessao_equipe; rr operacao.reserva_concessao_equipe;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','concessao_id','email','email_hmac','perfil','metodo','auditoria_id','chave_idempotencia','digest_idempotencia','motivo','atestado','versao_idempotencia','candidatos_idempotencia','reserva_id','geracao_reserva'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; reserva:=(e->>'reserva_id')::uuid; geracao:=(e->>'geracao_reserva')::bigint; acesso:=(e->>'concessao_id')::uuid; auditoria_id:=(e->>'auditoria_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or reserva is null or geracao is null or geracao<1 or jsonb_typeof(e->'geracao_reserva') is distinct from 'number' or coalesce(e->>'geracao_reserva','') !~ '^[1-9][0-9]*$' or acesso is null or auditoria_id is null
  or inicio is null or fim is null or a->>'usuario_id' is distinct from ator::text
  or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
  or a->>'operacao' is distinct from 'api.criar_concessao_equipe'
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
    values(gen_random_uuid(),ator,'api.criar_concessao_equipe','concessao_equipe',acesso,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.criar_concessao_equipe','concessao_equipe',acesso,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if coalesce(e->>'perfil','') not in ('administrador','profissional') or e->>'metodo' is distinct from 'google_workspace'
  or coalesce(e->>'email_hmac','') !~ '^[A-Za-z0-9_-]{43}$'
  or coalesce(length(btrim(e->>'chave_idempotencia')) between 1 and 256,false) is not true
  or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$' then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- Cada versão identifica material dedicado no Vault; a ativa corresponde ao envelope.
 if coalesce(e->>'versao_idempotencia','') !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  or jsonb_typeof(e->'candidatos_idempotencia') is distinct from 'object'
  or (select count(*) from jsonb_object_keys(e->'candidatos_idempotencia')) not between 1 and 16 then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 for versao,candidato in select key,value from jsonb_each(e->'candidatos_idempotencia') loop
  if versao !~ '^[a-z0-9][a-z0-9_-]{0,63}$' or jsonb_typeof(candidato) is distinct from 'object'
   or candidato - array['concessao_id','digest_idempotencia'] <> '{}'::jsonb
   or coalesce(candidato->>'concessao_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   or coalesce(candidato->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$' then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
 end loop;
 candidato:=e->'candidatos_idempotencia'->(e->>'versao_idempotencia');
 if candidato->>'concessao_id' is distinct from acesso::text
  or candidato->>'digest_idempotencia' is distinct from e->>'digest_idempotencia' then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- Validação estrita dos envelopes antes da persistência.
 for resultado in select value from jsonb_array_elements(jsonb_build_array(e->'email',e->'motivo')) loop
  if jsonb_typeof(resultado) is distinct from 'object' or resultado - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or resultado->'formato' is distinct from '1'::jsonb
   or jsonb_typeof(resultado->'key_id') is distinct from 'string' or coalesce(length(resultado->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(resultado->'nonce') is distinct from 'string' or coalesce(resultado->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(resultado->'tag') is distinct from 'string' or coalesce(resultado->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(resultado->'ciphertext') is distinct from 'string' or coalesce(length(resultado->>'ciphertext') between 1 and 32768 and resultado->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
 end loop;
 -- A mesma linha serializa criação e encerramento; nenhuma criação tardia atravessa o fechamento.
 select * into b from operacao.barreira_concessao_equipe where ator_usuario_id=ator for update;
 select * into rr from operacao.reserva_concessao_equipe where id=reserva and ator_usuario_id=ator and epoca=geracao for update;
 if not found or b.epoca is distinct from geracao or b.reserva_atual is distinct from reserva or b.resultado_pendente is not null or rr.estado not in ('aberta','confirmada') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,'api.criar_concessao_equipe','concessao_equipe',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
 end if;
 select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao='api.criar_concessao_equipe' and r.chave_idempotencia=e->>'chave_idempotencia';
 repeticao:=found;
 if rr.estado='confirmada' and (not repeticao or rr.chave_idempotencia is distinct from e->>'chave_idempotencia' or rr.concessao_resultado_id is distinct from anterior.resultado_id) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,'api.criar_concessao_equipe','concessao_equipe',acesso,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
 end if;
 insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
  values(gen_random_uuid(),ator,'api.criar_concessao_equipe',e->>'chave_idempotencia',(e->>'versao_idempotencia')||':'||(e->>'digest_idempotencia'),'concluida',acesso,1)
  on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
 if not found then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao='api.criar_concessao_equipe' and r.chave_idempotencia=e->>'chave_idempotencia';
  versao:=split_part(anterior.digest_entrada,':',1);
  candidato:=e->'candidatos_idempotencia'->versao;
  if candidato is null then
   raise exception using errcode='PZ001',message='VERSAO_IDEMPOTENCIA_INDISPONIVEL';
  end if;
  if anterior.digest_entrada is distinct from versao||':'||(candidato->>'digest_idempotencia') or anterior.estado is distinct from 'concluida'
   or anterior.resultado_id::text is distinct from candidato->>'concessao_id' or anterior.resultado_versao is distinct from 1
   or not exists(select 1 from identidade.concessao_equipe c where c.id=anterior.resultado_id and c.criado_por_usuario_id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.criar_concessao_equipe','concessao_equipe',acesso,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  acesso:=anterior.resultado_id;
  -- Serializa a projeção vigente com alteração ou revogação da concessão.
  perform 1 from identidade.concessao_equipe c where c.id=acesso and c.criado_por_usuario_id=ator for share;
  if not found then raise exception using errcode='PZ001',message='RESULTADO_INDISPONIVEL'; end if;
  repeticao:=true;
 else
  begin
   insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,criado_por_usuario_id,motivo_cifrado)
    values(acesso,e->'email',e->>'email_hmac',e->>'perfil',e->>'metodo','pendente',ator,e->'motivo');
  exception when unique_violation then
   delete from operacao.requisicao where id=anterior.id;
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.criar_concessao_equipe','concessao_equipe',acesso,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
  end;
 end if;
 if rr.estado='aberta' then
  update operacao.reserva_concessao_equipe set estado='confirmada',chave_idempotencia=e->>'chave_idempotencia',digest_idempotencia=e->>'digest_idempotencia',concessao_resultado_id=acesso where id=reserva;
  if not found then raise exception using errcode='P0002',message='RESERVA_NAO_CONFIRMADA'; end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(case when repeticao then gen_random_uuid() else auditoria_id end,ator,'api.criar_concessao_equipe','concessao_equipe',acesso,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 select jsonb_build_object('concessao_id',c.id,'email',c.email_cifrado,'perfil',c.perfil,'estado',c.estado,'usuario_id',c.usuario_id,'versao',c.versao) into resultado from identidade.concessao_equipe c where c.id=acesso;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req);
end $$;;

-- Owner da escrita: apenas o próprio ator; sem grant externo.
grant select, update (epoca) on operacao.barreira_concessao_equipe to ffcmapp_criar_equipe_owner;
grant select, update (estado,chave_idempotencia,digest_idempotencia,concessao_resultado_id) on operacao.reserva_concessao_equipe to ffcmapp_criar_equipe_owner;
create policy equipe_criar_barreira_select on operacao.barreira_concessao_equipe for select to ffcmapp_criar_equipe_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy equipe_criar_barreira_lock on operacao.barreira_concessao_equipe for update to ffcmapp_criar_equipe_owner using (ator_usuario_id=(select auth_privado.uid())) with check (false);
create policy equipe_criar_reserva_select on operacao.reserva_concessao_equipe for select to ffcmapp_criar_equipe_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy equipe_criar_reserva_update on operacao.reserva_concessao_equipe for update to ffcmapp_criar_equipe_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));

create function operacao.equipe_barreira_composicao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid:=auth_privado.uid();
 sessao uuid; req uuid; reserva uuid; comando uuid; epoca bigint;
 inicio timestamptz; fim timestamptz; dominio text; sujeito text; concessao uuid;
 google record; acao text; resposta text; dados jsonb; autorizado boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(a) is distinct from 'object'
  or e - array['request_id','operacao','epoca','reserva_id','comando_id','atestado'] <> '{}'::jsonb then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  sessao:=(auth_privado.jwt()->>'session_id')::uuid; req:=(e->>'request_id')::uuid;
  epoca:=(e->>'epoca')::bigint; reserva:=(e->>'reserva_id')::uuid; comando:=(e->>'comando_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 acao:=e->>'operacao';
 if ator is null or sessao is null or req is null or inicio is null or fim is null
  or acao not in ('api.reservar_concessao_equipe','api.encerrar_concessao_equipe','api.consultar_barreira_concessao_equipe','api.reconhecer_barreira_concessao_equipe')
  or acao is null or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text or a->>'operacao' is distinct from acao
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if (acao='api.reservar_concessao_equipe' and (epoca is null or epoca<1 or reserva is null or comando is not null))
  or (acao='api.encerrar_concessao_equipe' and (epoca is null or epoca<1 or comando is null))
  or (acao='api.consultar_barreira_concessao_equipe' and (epoca is not null or reserva is not null or comando is not null))
  or (acao='api.reconhecer_barreira_concessao_equipe' and (epoca is not null or reserva is not null or comando is null)) then
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
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'requisicao',null,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 -- A espera pelo bloqueio não pode estender a validade do atestado.
 insert into operacao.barreira_concessao_equipe(ator_usuario_id) values(ator) on conflict do nothing;
 perform 1 from operacao.barreira_concessao_equipe where ator_usuario_id=ator for update;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao='api.consultar_barreira_concessao_equipe' then
  dados:=operacao.consultar_barreira_concessao_equipe_privado(req);
 elsif acao='api.reconhecer_barreira_concessao_equipe' then
  resposta:=operacao.reconhecer_barreira_concessao_equipe_privado(comando,req);
 elsif acao='api.reservar_concessao_equipe' then
  resposta:=operacao.reservar_concessao_equipe_privado(ator,epoca,reserva);
 else
  resposta:=operacao.encerrar_concessao_equipe_privado(ator,epoca,reserva,comando);
 end if;
 if acao in ('api.reservar_concessao_equipe','api.encerrar_concessao_equipe') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'requisicao',null,case when resposta in ('aberta','confirmada','cancelada','vazia') then 'permitido' else 'negado' end,req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',coalesce(dados,jsonb_build_object('estado',resposta)),'request_id',req);
end $$;
revoke all on function operacao.equipe_barreira_composicao_privada(jsonb) from public,anon,authenticated,service_role;

-- Wrapper invoker permanece inacessível até revisão de privilégios e provas reais.
create function api.equipe_barreira_composicao(p_transporte jsonb) returns jsonb
language sql security invoker set search_path='' set row_security=on as $$
 select operacao.equipe_barreira_composicao_privada(p_transporte)
$$;
revoke all on function api.equipe_barreira_composicao(jsonb) from public,anon,authenticated,service_role;

-- Preparação local: wrapper permanece inacessível à aplicação até S-02 e provas reais.
create role ffcmapp_equipe_barreira_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_equipe_barreira_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_equipe_barreira_owner;
grant usage on schema public, identidade, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_equipe_barreira_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid,uuid) to ffcmapp_equipe_barreira_owner;
select set_config('ffcmapp.equipe_barreira_migrador',current_user,false);
select set_config('ffcmapp.equipe_barreira_tinha_verificador',pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET')::text,false);
do $$ begin
 if current_setting('ffcmapp.equipe_barreira_tinha_verificador')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
   where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
   raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_equipe_barreira_owner;
reset role;
select set_config('role',current_setting('ffcmapp.equipe_barreira_migrador'),false);
do $$ begin
 if current_setting('ffcmapp.equipe_barreira_tinha_verificador')='false' then
  execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;
grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_equipe_barreira_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_equipe_barreira_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo), update (versao) on identidade.concessao_equipe to ffcmapp_equipe_barreira_owner;
grant select (session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_equipe_barreira_owner;
grant select (usuario_id,concessao_id), update (concessao_id) on identidade.excecao_tecnica to ffcmapp_equipe_barreira_owner;
grant insert (id,ator_usuario_id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_equipe_barreira_owner;

create policy equipe_barreira_config on identidade.configuracao_auth_nativo for select to ffcmapp_equipe_barreira_owner using (true);
create policy equipe_barreira_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_equipe_barreira_owner using (true) with check (false);
create policy equipe_barreira_usuario on public.usuario for select to ffcmapp_equipe_barreira_owner using (id=(select auth_privado.uid()));
create policy equipe_barreira_usuario_lock on public.usuario for update to ffcmapp_equipe_barreira_owner using (id=(select auth_privado.uid())) with check (false);
create policy equipe_barreira_concessao on identidade.concessao_equipe for select to ffcmapp_equipe_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy equipe_barreira_concessao_lock on identidade.concessao_equipe for update to ffcmapp_equipe_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy equipe_barreira_sessao on identidade.sessao for select to ffcmapp_equipe_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy equipe_barreira_sessao_lock on identidade.sessao for update to ffcmapp_equipe_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy equipe_barreira_excecao on identidade.excecao_tecnica for select to ffcmapp_equipe_barreira_owner using (usuario_id=(select auth_privado.uid()));
create policy equipe_barreira_excecao_lock on identidade.excecao_tecnica for update to ffcmapp_equipe_barreira_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy equipe_barreira_auditoria on auditoria.evento for insert to ffcmapp_equipe_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));
create policy equipe_barreira_auth_nao_admitido on auditoria.evento for insert to ffcmapp_equipe_barreira_owner
 with check (ator_usuario_id is null and operador_restrito is null and ator_auth_id=(select auth_privado.uid())
  and resultado='negado' and tipo_objeto='requisicao' and objeto_id is null
  and acao in ('api.reservar_concessao_equipe','api.encerrar_concessao_equipe','api.consultar_barreira_concessao_equipe','api.reconhecer_barreira_concessao_equipe')
  and not exists(select 1 from public.usuario u where u.id=(select auth_privado.uid())));


grant select, insert (ator_usuario_id), update (epoca,reserva_atual,resultado_pendente)
 on operacao.barreira_concessao_equipe to ffcmapp_equipe_barreira_owner;
grant select, insert (id,ator_usuario_id,epoca,estado), update (estado)
 on operacao.reserva_concessao_equipe to ffcmapp_equipe_barreira_owner;
grant select, insert (id,ator_usuario_id,epoca,reserva_id,resultado)
 on operacao.recibo_barreira_concessao_equipe to ffcmapp_equipe_barreira_owner;
create policy equipe_composicao_barreira_select on operacao.barreira_concessao_equipe for select to ffcmapp_equipe_barreira_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy equipe_composicao_barreira_insert on operacao.barreira_concessao_equipe for insert to ffcmapp_equipe_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));
create policy equipe_composicao_barreira_update on operacao.barreira_concessao_equipe for update to ffcmapp_equipe_barreira_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
create policy equipe_composicao_reserva_select on operacao.reserva_concessao_equipe for select to ffcmapp_equipe_barreira_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy equipe_composicao_reserva_insert on operacao.reserva_concessao_equipe for insert to ffcmapp_equipe_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));
create policy equipe_composicao_reserva_update on operacao.reserva_concessao_equipe for update to ffcmapp_equipe_barreira_owner using (ator_usuario_id=(select auth_privado.uid())) with check (ator_usuario_id=(select auth_privado.uid()));
create policy equipe_composicao_recibo_select on operacao.recibo_barreira_concessao_equipe for select to ffcmapp_equipe_barreira_owner using (ator_usuario_id=(select auth_privado.uid()));
create policy equipe_composicao_recibo_insert on operacao.recibo_barreira_concessao_equipe for insert to ffcmapp_equipe_barreira_owner with check (ator_usuario_id=(select auth_privado.uid()));

grant execute on function operacao.equipe_barreira_composicao_privada(jsonb),
 operacao.reservar_concessao_equipe_privado(uuid,bigint,uuid),
 operacao.encerrar_concessao_equipe_privado(uuid,bigint,uuid,uuid),
 operacao.consultar_barreira_concessao_equipe_privado(uuid),
 operacao.reconhecer_barreira_concessao_equipe_privado(uuid,uuid) to ffcmapp_equipe_barreira_owner;

alter function api.equipe_barreira_composicao(jsonb) owner to ffcmapp_equipe_barreira_owner;
set role ffcmapp_equipe_barreira_owner;
alter function api.equipe_barreira_composicao(jsonb) security definer;
revoke all on function api.equipe_barreira_composicao(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.equipe_barreira_migrador'),false);
revoke create on schema api from ffcmapp_equipe_barreira_owner;
revoke ffcmapp_equipe_barreira_owner from current_user;
