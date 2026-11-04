-- Contrato privado: chamador deve autorizar e auditar reserva/reconciliação na mesma transação. Sem grants de aplicação.
-- Núcleo privado da barreira de edição de paciente. Não é endpoint nem autorização:
-- o chamador futuro deve verificar JWT/Auth nativo, concessão, atestado e
-- auditar a operação na mesma transação. Sem grants até revisão S-02.
create table operacao.barreira_edicao_paciente (
  ator_usuario_id uuid primary key references public.usuario(id),
  epoca bigint not null default 1 check (epoca > 0),
  reserva_atual uuid,
  resultado_pendente uuid
);
create table operacao.reserva_edicao_paciente (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario(id),
  epoca bigint not null check (epoca > 0),
  estado text not null check (estado in ('aberta','confirmada','cancelada')),
  chave_idempotencia text,
  digest_idempotencia text,
  paciente_id uuid references cadastro.paciente(id),
  versao_resultado integer,
  paciente_reservado_id uuid not null references cadastro.paciente(id),
  check ((estado = 'confirmada') = (versao_resultado is not null)),
  check (versao_resultado is null or versao_resultado > 1),
  check ((estado = 'confirmada' and chave_idempotencia is not null and digest_idempotencia is not null)
    or (estado <> 'confirmada' and chave_idempotencia is null and digest_idempotencia is null))
);
create table operacao.recibo_barreira_edicao_paciente (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario(id),
  epoca bigint not null check (epoca > 0),
  reserva_id uuid,
  resultado text not null check (resultado in ('vazia','cancelada','confirmada'))
);
alter table operacao.barreira_edicao_paciente enable row level security;
alter table operacao.reserva_edicao_paciente enable row level security;
alter table operacao.recibo_barreira_edicao_paciente enable row level security;
revoke all on operacao.barreira_edicao_paciente, operacao.reserva_edicao_paciente, operacao.recibo_barreira_edicao_paciente from public, anon, authenticated, service_role;

-- Primitivas SECURITY INVOKER, sem privilégios para aplicação. O ator deve vir
-- de auth_privado.uid() e ser autorizado pelo chamador, nunca de entrada do navegador.
create function operacao.reservar_edicao_paciente_privado(p_ator uuid,p_epoca bigint,p_reserva uuid,p_paciente uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare b operacao.barreira_edicao_paciente; r operacao.reserva_edicao_paciente;
begin
 if p_ator is null or p_epoca is null or p_epoca < 1 or p_reserva is null or p_paciente is null or p_ator is distinct from auth_privado.uid() then return 'negada'; end if;
 -- Mesma ordem da gravação: paciente antes da barreira. A FK posterior não pode inverter locks.
 perform 1 from cadastro.paciente where id=p_paciente for key share;
 if not found then return 'negada'; end if;
 insert into operacao.barreira_edicao_paciente(ator_usuario_id) values(p_ator) on conflict do nothing;
 select * into b from operacao.barreira_edicao_paciente where ator_usuario_id=p_ator for update;
 select * into r from operacao.reserva_edicao_paciente where id=p_reserva;
 if found then
  if r.ator_usuario_id=p_ator and r.epoca=p_epoca and r.paciente_reservado_id=p_paciente then return r.estado; end if;
  return 'id_reutilizado';
 end if;
 if b.epoca<>p_epoca then return 'epoca_antiga'; end if;
 if b.reserva_atual is not null or b.resultado_pendente is not null then return 'bloqueada'; end if;
 insert into operacao.reserva_edicao_paciente(id,ator_usuario_id,epoca,estado,paciente_reservado_id) values(p_reserva,p_ator,p_epoca,'aberta',p_paciente) on conflict do nothing;
 if not found then return 'id_reutilizado'; end if;
 update operacao.barreira_edicao_paciente set reserva_atual=p_reserva where ator_usuario_id=p_ator;
 return 'aberta';
end $$;

create function operacao.encerrar_edicao_paciente_privado(p_ator uuid,p_epoca bigint,p_reserva uuid,p_comando uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare b operacao.barreira_edicao_paciente; r operacao.reserva_edicao_paciente; c operacao.recibo_barreira_edicao_paciente; resultado text;
begin
 if p_ator is null or p_epoca is null or p_epoca < 1 or p_comando is null or p_ator is distinct from auth_privado.uid() then return 'negada'; end if;
 insert into operacao.barreira_edicao_paciente(ator_usuario_id) values(p_ator) on conflict do nothing;
 select * into b from operacao.barreira_edicao_paciente where ator_usuario_id=p_ator for update;
 select * into c from operacao.recibo_barreira_edicao_paciente where id=p_comando;
 if found then
  if c.ator_usuario_id=p_ator and c.epoca=p_epoca and c.reserva_id is not distinct from p_reserva then return c.resultado; end if;
  return 'id_reutilizado';
 end if;
 if b.epoca<>p_epoca or b.reserva_atual is distinct from p_reserva or b.resultado_pendente is not null then return 'conflito'; end if;
 if p_reserva is null then resultado:='vazia';
 else
  select * into r from operacao.reserva_edicao_paciente where id=p_reserva and ator_usuario_id=p_ator and epoca=p_epoca for update;
  if not found or r.estado not in ('aberta','confirmada') then return 'conflito'; end if;
  resultado:=case when r.estado='aberta' then 'cancelada' else 'confirmada' end;
 end if;
 insert into operacao.recibo_barreira_edicao_paciente values(p_comando,p_ator,p_epoca,p_reserva,resultado) on conflict do nothing;
 if not found then return 'id_reutilizado'; end if;
 if p_reserva is not null then
  update operacao.reserva_edicao_paciente set estado=resultado where id=p_reserva;
 end if;
 update operacao.barreira_edicao_paciente set epoca=epoca+1,reserva_atual=null,
   resultado_pendente=case when p_reserva is null then null else p_comando end where ator_usuario_id=p_ator;
 return resultado;
end $$;
revoke all on function operacao.reservar_edicao_paciente_privado(uuid,bigint,uuid,uuid), operacao.encerrar_edicao_paciente_privado(uuid,bigint,uuid,uuid) from public, anon, authenticated, service_role;

-- Primitivas privadas: o chamador deve validar sessão e autorização vigentes
-- na mesma transação. auth_privado.uid() identifica o ator, mas não autoriza acesso.
create function operacao.consultar_barreira_edicao_paciente_privado(p_request uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ator uuid:=auth_privado.uid(); b operacao.barreira_edicao_paciente; r operacao.reserva_edicao_paciente; c operacao.recibo_barreira_edicao_paciente; resultado jsonb;
begin
 if ator is null or p_request is null then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 -- Serializa consulta inicial com primeira reserva ainda não confirmada.
 insert into operacao.barreira_edicao_paciente(ator_usuario_id) values(ator) on conflict do nothing;
 select * into b from operacao.barreira_edicao_paciente where ator_usuario_id=ator for update;
 if not found then resultado:=jsonb_build_object('epoca',1,'reserva',null,'resultado_pendente',null);
 else
  if b.reserva_atual is not null and b.resultado_pendente is not null then raise exception 'BARREIRA_INVALIDA'; end if;
  if b.reserva_atual is not null then
   select * into strict r from operacao.reserva_edicao_paciente where id=b.reserva_atual and ator_usuario_id=ator and epoca=b.epoca;
  end if;
  if b.resultado_pendente is not null then
   select * into strict c from operacao.recibo_barreira_edicao_paciente where id=b.resultado_pendente and ator_usuario_id=ator and epoca=b.epoca-1;
   if c.reserva_id is null or c.resultado not in ('cancelada','confirmada') then raise exception 'RECIBO_INVALIDO'; end if;
   select * into strict r from operacao.reserva_edicao_paciente where id=c.reserva_id and ator_usuario_id=ator and epoca=c.epoca and estado=c.resultado;
  end if;
  resultado:=jsonb_build_object('epoca',b.epoca,
   'reserva',case when b.reserva_atual is null then null else jsonb_build_object('id',r.id,'estado',r.estado) end,
   'resultado_pendente',case when b.resultado_pendente is null then null else jsonb_build_object('recibo_id',c.id,'reserva_id',r.id,'resultado',c.resultado,'paciente_id',r.paciente_reservado_id,'versao',r.versao_resultado) end);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.consultar_barreira_edicao_paciente','requisicao',null,'permitido',p_request);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return resultado;
end $$;

create function operacao.reconhecer_barreira_edicao_paciente_privado(p_recibo uuid,p_request uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare ator uuid:=auth_privado.uid(); b operacao.barreira_edicao_paciente; c operacao.recibo_barreira_edicao_paciente;
begin
 if ator is null or p_recibo is null or p_request is null then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 select * into b from operacao.barreira_edicao_paciente where ator_usuario_id=ator for update;
 select * into c from operacao.recibo_barreira_edicao_paciente where id=p_recibo and ator_usuario_id=ator and reserva_id is not null and resultado in ('cancelada','confirmada');
 if not found or b.ator_usuario_id is null or c.epoca>=b.epoca then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,'api.reconhecer_barreira_edicao_paciente','requisicao',null,'negado',p_request);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return 'conflito';
 end if;
 if b.resultado_pendente=p_recibo then
  update operacao.barreira_edicao_paciente set resultado_pendente=null where ator_usuario_id=ator;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.reconhecer_barreira_edicao_paciente','requisicao',p_recibo,'permitido',p_request);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return 'reconhecido';
end $$;
revoke all on function operacao.consultar_barreira_edicao_paciente_privado(uuid), operacao.reconhecer_barreira_edicao_paciente_privado(uuid,uuid) from public,anon,authenticated,service_role;

