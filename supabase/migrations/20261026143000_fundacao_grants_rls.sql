-- Fundação FFCMApp — D-06: superfície SQL fechada antes das RPCs públicas.
-- Não expõe bootstrap, cofre nem tabelas. As RPCs específicas serão criadas
-- nas tarefas que implementarem cada operação autorizada.

create schema api;

revoke all on schema api from public, anon, authenticated;
revoke all on schema identidade from public, anon, authenticated;
revoke all on schema cadastro from public, anon, authenticated;
revoke all on schema auditoria from public, anon, authenticated;
revoke all on schema operacao from public, anon, authenticated;

revoke all on table public.usuario from public, anon, authenticated;
revoke all on all tables in schema identidade from public, anon, authenticated;
revoke all on all tables in schema cadastro from public, anon, authenticated;
revoke all on all tables in schema auditoria from public, anon, authenticated;
revoke all on all tables in schema operacao from public, anon, authenticated;

revoke all on all sequences in schema identidade from public, anon, authenticated;
revoke all on all sequences in schema cadastro from public, anon, authenticated;
revoke all on all sequences in schema auditoria from public, anon, authenticated;
revoke all on all sequences in schema operacao from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema api revoke all on tables from public, anon, authenticated;
alter default privileges in schema identidade revoke all on tables from public, anon, authenticated;
alter default privileges in schema cadastro revoke all on tables from public, anon, authenticated;
alter default privileges in schema auditoria revoke all on tables from public, anon, authenticated;
alter default privileges in schema operacao revoke all on tables from public, anon, authenticated;

alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema api revoke all on sequences from public, anon, authenticated;
alter default privileges in schema identidade revoke all on sequences from public, anon, authenticated;
alter default privileges in schema cadastro revoke all on sequences from public, anon, authenticated;
alter default privileges in schema auditoria revoke all on sequences from public, anon, authenticated;
alter default privileges in schema operacao revoke all on sequences from public, anon, authenticated;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema api revoke execute on functions from public, anon, authenticated;
alter default privileges in schema identidade revoke execute on functions from public, anon, authenticated;
alter default privileges in schema cadastro revoke execute on functions from public, anon, authenticated;
alter default privileges in schema auditoria revoke execute on functions from public, anon, authenticated;
alter default privileges in schema operacao revoke execute on functions from public, anon, authenticated;

alter table public.usuario enable row level security;
alter table identidade.concessao_equipe enable row level security;
alter table identidade.excecao_tecnica enable row level security;
alter table identidade.desafio_login enable row level security;
alter table identidade.sessao enable row level security;
alter table cadastro.paciente enable row level security;
alter table cadastro.contato_paciente enable row level security;
alter table cadastro.pessoa_relacionada enable row level security;
alter table cadastro.relacao_paciente enable row level security;
alter table cadastro.acesso_paciente enable row level security;
alter table auditoria.evento enable row level security;
alter table operacao.requisicao enable row level security;
alter table operacao.lote_teste enable row level security;

create function identidade.sessao_atual_valida()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, identidade
as $$
  with contexto as (
    select
      auth.uid() as usuario_id,
      nullif(auth.jwt() ->> 'session_id', '') as session_id_texto
  )
  select exists (
    select 1
    from contexto x
    join public.usuario u
      on u.id = x.usuario_id
      and u.ativo
    join identidade.sessao s
      on s.usuario_id = u.id
      and s.revogada_em is null
      and x.session_id_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and s.session_id = x.session_id_texto::uuid
    join identidade.concessao_equipe c
      on c.id = s.concessao_id
      and c.estado = 'vinculada'
      and c.usuario_id = u.id
  );
$$;

create function cadastro.possui_acesso_paciente(p_paciente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, identidade, cadastro
as $$
  select identidade.sessao_atual_valida()
    and exists (
      select 1
      from public.usuario u
      where u.id = auth.uid()
        and u.ativo
        and (
          u.perfil = 'administrador'
          or exists (
            select 1
            from cadastro.acesso_paciente a
            where a.usuario_id = u.id
              and a.paciente_id = p_paciente_id
              and a.revogada_em is null
          )
        )
    );
$$;

revoke all on function identidade.sessao_atual_valida() from public, anon, authenticated;
revoke all on function cadastro.possui_acesso_paciente(uuid) from public, anon, authenticated;
