-- Contrato mínimo isolado: não substitui prova na fundação Supabase completa.
create role anon; create role authenticated; create role service_role bypassrls;
create schema cadastro;
create table cadastro.paciente (id uuid primary key);
create table public.usuario (id uuid primary key);
\ir ../migrations/20261108120000_diario_rascunho_privado.sql

do $$
begin
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='cadastro.diario_rascunho_textual'::regclass) then
    raise exception 'RLS não está ativa e forçada';
  end if;
  if exists (select 1 from pg_policies where schemaname='cadastro' and tablename='diario_rascunho_textual') then
    raise exception 'Política inesperada';
  end if;
  if exists (select 1 from unnest(array['anon','authenticated','service_role']) r where has_table_privilege(r,'cadastro.diario_rascunho_textual','SELECT,INSERT,UPDATE,DELETE')) then
    raise exception 'Privilégio inesperado';
  end if;
end $$;
