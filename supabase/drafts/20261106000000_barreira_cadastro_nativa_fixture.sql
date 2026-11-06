-- Experimento isolado: ator é fixture, não identidade autenticada. Não integrar.
-- Época cerca operações atrasadas; não é credencial nem geração de sessão.
create schema barreira_cadastro_fixture;
create table barreira_cadastro_fixture.ator (id uuid primary key, epoca bigint not null default 1, atual uuid);
create table barreira_cadastro_fixture.reserva (id uuid primary key, ator uuid not null references barreira_cadastro_fixture.ator, epoca bigint not null, estado text not null check (estado in ('aberta','confirmada','cancelada')));
create table barreira_cadastro_fixture.efeito (reserva uuid primary key references barreira_cadastro_fixture.reserva);
create table barreira_cadastro_fixture.recibo (id uuid primary key, ator uuid not null, epoca bigint not null, reserva uuid, resultado text not null);
revoke all on schema barreira_cadastro_fixture from public;
revoke all on all tables in schema barreira_cadastro_fixture from public;

create function barreira_cadastro_fixture.reservar(p_ator uuid,p_epoca bigint,p_id uuid) returns text
language plpgsql security invoker set search_path=pg_catalog as $$
declare a barreira_cadastro_fixture.ator; r barreira_cadastro_fixture.reserva; n integer;
begin
 if p_ator is null or p_epoca is null or p_id is null then return 'invalida'; end if;
 select * into a from barreira_cadastro_fixture.ator where id=p_ator for update;
 if not found then return 'negada'; end if;
 -- Repetição de ID retorna apenas estado histórico; não concede autorização
 -- para criar nem substitui conferência da época e autoridade vigentes.
 select * into r from barreira_cadastro_fixture.reserva where id=p_id;
 if found then
   if r.ator=p_ator and r.epoca=p_epoca then return r.estado; end if;
   return 'id_reutilizado';
 end if;
 if a.epoca<>p_epoca then return 'epoca_antiga'; end if;
 if a.atual is not null then return 'bloqueada'; end if;
 insert into barreira_cadastro_fixture.reserva values(p_id,p_ator,p_epoca,'aberta') on conflict do nothing;
 get diagnostics n=row_count;
 if n<>1 then return 'id_reutilizado'; end if;
 update barreira_cadastro_fixture.ator set atual=p_id where id=p_ator;
 return 'aberta';
end $$;

create function barreira_cadastro_fixture.criar(p_ator uuid,p_epoca bigint,p_id uuid) returns text
language plpgsql security invoker set search_path=pg_catalog as $$
declare a barreira_cadastro_fixture.ator; r barreira_cadastro_fixture.reserva;
begin
 select * into a from barreira_cadastro_fixture.ator where id=p_ator for update;
 if not found then return 'negada'; end if;
 select * into r from barreira_cadastro_fixture.reserva where id=p_id and ator=p_ator and epoca=p_epoca for update;
 if not found then return 'negada'; end if;
 if r.estado='confirmada' then return 'confirmada'; end if;
 if a.epoca<>p_epoca or a.atual is distinct from p_id or r.estado<>'aberta' then return 'negada'; end if;
 insert into barreira_cadastro_fixture.efeito values(p_id);
 update barreira_cadastro_fixture.reserva set estado='confirmada' where id=p_id;
 return 'confirmada';
end $$;

create function barreira_cadastro_fixture.encerrar(p_ator uuid,p_epoca bigint,p_reserva uuid,p_comando uuid) returns text
language plpgsql security invoker set search_path=pg_catalog as $$
declare a barreira_cadastro_fixture.ator; r barreira_cadastro_fixture.reserva; c barreira_cadastro_fixture.recibo; resultado text; n integer;
begin
 if p_ator is null or p_epoca is null or p_comando is null then return 'invalida'; end if;
 select * into a from barreira_cadastro_fixture.ator where id=p_ator for update;
 if not found then return 'negada'; end if;
 select * into c from barreira_cadastro_fixture.recibo where id=p_comando;
 if found then
   if c.ator=p_ator and c.epoca=p_epoca and c.reserva is not distinct from p_reserva then return c.resultado; end if;
   return 'id_reutilizado';
 end if;
 if a.epoca<>p_epoca or a.atual is distinct from p_reserva then return 'conflito'; end if;
 if p_reserva is null then resultado:='vazia';
 else
   select * into r from barreira_cadastro_fixture.reserva where id=p_reserva and ator=p_ator and epoca=p_epoca for update;
   if not found or r.estado not in ('aberta','confirmada') then return 'conflito'; end if;
   resultado:=case when r.estado='aberta' then 'cancelada' else 'confirmada' end;
   update barreira_cadastro_fixture.reserva set estado=resultado where id=p_reserva;
 end if;
 insert into barreira_cadastro_fixture.recibo values(p_comando,p_ator,p_epoca,p_reserva,resultado) on conflict do nothing;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'COMANDO_COLIDIU' using errcode='23505'; end if;
 update barreira_cadastro_fixture.ator set epoca=epoca+1,atual=null where id=p_ator;
 return resultado;
end $$;
revoke all on all functions in schema barreira_cadastro_fixture from public;
