-- Núcleo privado da barreira de cadastro. Não é endpoint nem autorização:
-- o chamador futuro deve verificar JWT/Auth nativo, concessão, atestado e
-- auditar a operação na mesma transação. Sem grants até revisão S-02.
create table operacao.barreira_cadastro (
  ator_usuario_id uuid primary key references public.usuario(id),
  epoca bigint not null default 1 check (epoca > 0),
  reserva_atual uuid,
  resultado_pendente uuid
);
create table operacao.reserva_cadastro (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario(id),
  epoca bigint not null check (epoca > 0),
  estado text not null check (estado in ('aberta','confirmada','cancelada')),
  chave_idempotencia text,
  digest_idempotencia text,
  paciente_id uuid references cadastro.paciente(id),
  check ((estado = 'confirmada') = (paciente_id is not null)),
  check ((estado = 'confirmada' and chave_idempotencia is not null and digest_idempotencia is not null)
    or (estado <> 'confirmada' and chave_idempotencia is null and digest_idempotencia is null))
);
create table operacao.recibo_barreira_cadastro (
  id uuid primary key,
  ator_usuario_id uuid not null references public.usuario(id),
  epoca bigint not null check (epoca > 0),
  reserva_id uuid,
  resultado text not null check (resultado in ('vazia','cancelada','confirmada'))
);
alter table operacao.barreira_cadastro enable row level security;
alter table operacao.reserva_cadastro enable row level security;
alter table operacao.recibo_barreira_cadastro enable row level security;
revoke all on operacao.barreira_cadastro, operacao.reserva_cadastro, operacao.recibo_barreira_cadastro from public, anon, authenticated, service_role;

-- Primitivas SECURITY INVOKER, sem privilégios para aplicação. O ator deve vir
-- de auth_privado.uid() e ser autorizado pelo chamador, nunca de entrada do navegador.
create function operacao.reservar_cadastro_privado(p_ator uuid,p_epoca bigint,p_reserva uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare b operacao.barreira_cadastro; r operacao.reserva_cadastro;
begin
 if p_ator is null or p_epoca is null or p_epoca < 1 or p_reserva is null or p_ator is distinct from auth_privado.uid() then return 'negada'; end if;
 insert into operacao.barreira_cadastro(ator_usuario_id) values(p_ator) on conflict do nothing;
 select * into b from operacao.barreira_cadastro where ator_usuario_id=p_ator for update;
 select * into r from operacao.reserva_cadastro where id=p_reserva;
 if found then
  if r.ator_usuario_id=p_ator and r.epoca=p_epoca then return r.estado; end if;
  return 'id_reutilizado';
 end if;
 if b.epoca<>p_epoca then return 'epoca_antiga'; end if;
 if b.reserva_atual is not null or b.resultado_pendente is not null then return 'bloqueada'; end if;
 insert into operacao.reserva_cadastro(id,ator_usuario_id,epoca,estado) values(p_reserva,p_ator,p_epoca,'aberta') on conflict do nothing;
 if not found then return 'id_reutilizado'; end if;
 update operacao.barreira_cadastro set reserva_atual=p_reserva where ator_usuario_id=p_ator;
 return 'aberta';
end $$;

create function operacao.encerrar_cadastro_privado(p_ator uuid,p_epoca bigint,p_reserva uuid,p_comando uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare b operacao.barreira_cadastro; r operacao.reserva_cadastro; c operacao.recibo_barreira_cadastro; resultado text;
begin
 if p_ator is null or p_epoca is null or p_epoca < 1 or p_comando is null or p_ator is distinct from auth_privado.uid() then return 'negada'; end if;
 insert into operacao.barreira_cadastro(ator_usuario_id) values(p_ator) on conflict do nothing;
 select * into b from operacao.barreira_cadastro where ator_usuario_id=p_ator for update;
 select * into c from operacao.recibo_barreira_cadastro where id=p_comando;
 if found then
  if c.ator_usuario_id=p_ator and c.epoca=p_epoca and c.reserva_id is not distinct from p_reserva then return c.resultado; end if;
  return 'id_reutilizado';
 end if;
 if b.epoca<>p_epoca or b.reserva_atual is distinct from p_reserva or b.resultado_pendente is not null then return 'conflito'; end if;
 if p_reserva is null then resultado:='vazia';
 else
  select * into r from operacao.reserva_cadastro where id=p_reserva and ator_usuario_id=p_ator and epoca=p_epoca for update;
  if not found or r.estado not in ('aberta','confirmada') then return 'conflito'; end if;
  resultado:=case when r.estado='aberta' then 'cancelada' else 'confirmada' end;
 end if;
 insert into operacao.recibo_barreira_cadastro values(p_comando,p_ator,p_epoca,p_reserva,resultado) on conflict do nothing;
 if not found then return 'id_reutilizado'; end if;
 if p_reserva is not null then
  update operacao.reserva_cadastro set estado=resultado where id=p_reserva;
 end if;
 update operacao.barreira_cadastro set epoca=epoca+1,reserva_atual=null,
   resultado_pendente=case when p_reserva is null then null else p_comando end where ator_usuario_id=p_ator;
 return resultado;
end $$;
revoke all on function operacao.reservar_cadastro_privado(uuid,bigint,uuid), operacao.encerrar_cadastro_privado(uuid,bigint,uuid,uuid) from public, anon, authenticated, service_role;
