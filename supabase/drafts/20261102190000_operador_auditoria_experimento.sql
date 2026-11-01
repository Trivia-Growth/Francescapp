-- EXPERIMENTO LOCAL: sessão do banco é somente hipótese de origem; não prova
-- gateway, pooler, provisionamento ou identidade no Supabase. Sem grants de
-- runtime, sem alteração de eventos anteriores ou integração de leitura.
create table auditoria.operador_fixture (
 codigo text primary key check (length(btrim(codigo)) between 1 and 128 and codigo=btrim(codigo)),
 papel_oid oid not null unique,
 ativo boolean not null
);
alter table auditoria.operador_fixture enable row level security;
revoke all on auditoria.operador_fixture from public,anon,authenticated;

create function auditoria.verificar_operador_fixture() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.operador_restrito is not null then
   -- O lock dura até o commit do evento: desativação e inserção têm ordem.
   perform 1 from auditoria.operador_fixture o join pg_roles r on r.oid=o.papel_oid
   where o.codigo=new.operador_restrito and o.ativo and r.rolname=session_user
   for share of o;
   if not found then
     raise exception using errcode='42501',message='OPERADOR_NAO_AUTORIZADO';
   end if;
 end if;
 return new;
end $$;
revoke all on function auditoria.verificar_operador_fixture() from public,anon,authenticated;
create trigger evento_operador_fixture before insert on auditoria.evento
 for each row execute function auditoria.verificar_operador_fixture();
