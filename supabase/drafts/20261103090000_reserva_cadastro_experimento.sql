-- EXPERIMENTO DESCARTÁVEL: não é RPC nem autorização. O ator e a geração são
-- parâmetros de fixture, NÃO identidade ou capacidade autenticada. Pressupõe
-- geração vinculada previamente à sessão; emissão/perda/trânsito dessa prova,
-- operações antigas e impacto entre abas ainda NÃO foram resolvidos.
create schema reserva_fixture;
create table reserva_fixture.ator(id uuid primary key, geracao bigint not null default 1, atual uuid);
create table reserva_fixture.reserva(id uuid primary key, ator_id uuid not null references reserva_fixture.ator(id), geracao bigint not null, estado text not null check (estado in ('aberta','confirmada','cancelada')), fechada boolean not null default false);
create table reserva_fixture.efeito(reserva_id uuid primary key references reserva_fixture.reserva(id));
revoke all on schema reserva_fixture from public,anon,authenticated;
revoke all on all tables in schema reserva_fixture from public,anon,authenticated;

create function reserva_fixture.abrir(p_ator uuid,p_geracao bigint,p_reserva uuid) returns text
language plpgsql security invoker set search_path=pg_catalog as $$
declare a reserva_fixture.ator; v_estado text; v_inseridas integer;
begin
 if p_ator is null or p_geracao is null or p_reserva is null then return 'invalida'; end if;
 select * into a from reserva_fixture.ator where id=p_ator for update;
 if not found then return 'negada'; end if;
 if a.geracao<>p_geracao then return 'geracao_antiga'; end if;
 if a.atual is not null then
   if a.atual<>p_reserva then return 'bloqueada'; end if;
   select estado into v_estado from reserva_fixture.reserva where id=a.atual and ator_id=p_ator and geracao=p_geracao and not fechada;
   return coalesce(v_estado,'inconsistente');
 end if;
 if exists(select 1 from reserva_fixture.reserva where id=p_reserva) then return 'id_reutilizado'; end if;
 insert into reserva_fixture.reserva(id,ator_id,geracao,estado) values(p_reserva,p_ator,p_geracao,'aberta')
 on conflict (id) do nothing;
 get diagnostics v_inseridas=row_count;
 if v_inseridas<>1 then return 'id_reutilizado'; end if;
 update reserva_fixture.ator set atual=p_reserva where id=p_ator;
 return 'aberta';
end $$;
create function reserva_fixture.confirmar(p_ator uuid,p_geracao bigint,p_reserva uuid) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
declare a reserva_fixture.ator; r reserva_fixture.reserva;
begin
 select * into a from reserva_fixture.ator where id=p_ator for update;
 if not found then return false; end if;
 select * into r from reserva_fixture.reserva where id=p_reserva and ator_id=p_ator and geracao=p_geracao for update;
 if not found then return false; end if;
 if r.estado='confirmada' then return exists(select 1 from reserva_fixture.efeito where reserva_id=p_reserva); end if;
 if a.geracao<>p_geracao or a.atual is distinct from p_reserva or r.estado<>'aberta' or r.fechada then return false; end if;
 insert into reserva_fixture.efeito(reserva_id) values(p_reserva);
 update reserva_fixture.reserva set estado='confirmada' where id=p_reserva;
 return true;
end $$;
create function reserva_fixture.fechar(p_ator uuid,p_geracao bigint,p_reserva uuid) returns text
language plpgsql security invoker set search_path=pg_catalog as $$
declare a reserva_fixture.ator; r reserva_fixture.reserva;
begin
 select * into a from reserva_fixture.ator where id=p_ator for update;
 if not found then return 'negada'; end if;
 select * into r from reserva_fixture.reserva where id=p_reserva and ator_id=p_ator and geracao=p_geracao for update;
 if not found then return 'indeterminada'; end if;
 if r.fechada then return r.estado; end if;
 if a.geracao<>p_geracao or a.atual is distinct from p_reserva then return 'indeterminada'; end if;
 if r.estado='aberta' then r.estado:='cancelada'; end if;
 update reserva_fixture.reserva set estado=r.estado,fechada=true where id=p_reserva;
 update reserva_fixture.ator set geracao=geracao+1,atual=null where id=p_ator;
 return r.estado;
end $$;
-- A ausência não prova falha nem autoriza a interface a liberar novo cadastro.
create function reserva_fixture.consultar(p_ator uuid) returns text
language plpgsql security invoker set search_path=pg_catalog as $$
declare a reserva_fixture.ator; v_estado text;
begin
 select * into a from reserva_fixture.ator where id=p_ator for update;
 if not found or a.atual is null then return 'indeterminada'; end if;
 select estado into v_estado from reserva_fixture.reserva where id=a.atual and ator_id=p_ator and geracao=a.geracao and not fechada;
 return coalesce(v_estado,'indeterminada');
end $$;
revoke all on all functions in schema reserva_fixture from public,anon,authenticated;
