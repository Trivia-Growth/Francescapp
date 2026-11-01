-- D-04/D-06: UUID malformado deve negar sessão, sem erro de conversão.
create or replace function identidade.sessao_atual_valida()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, identidade
as $$
  with contexto as (
    select
      case
        when coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then auth.uid()
        else null::uuid
      end as usuario_id,
      case
        when (auth.jwt() ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (auth.jwt() ->> 'session_id')::uuid
        else null::uuid
      end as session_id
  )
  select exists (
    select 1
    from contexto x
    join public.usuario u on u.id = x.usuario_id and u.ativo
    join identidade.sessao s on s.usuario_id = u.id
      and s.revogada_em is null and s.session_id = x.session_id
    join identidade.concessao_equipe c on c.id = s.concessao_id
      and c.estado = 'vinculada' and c.usuario_id = u.id
  );
$$;

revoke all on function identidade.sessao_atual_valida() from public, anon, authenticated;

-- CASE garante que auth.uid() só seja avaliado após validação da sessão.
create or replace function cadastro.possui_acesso_paciente(p_paciente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, identidade, cadastro
as $$
  select case when not identidade.sessao_atual_valida() then false else exists (
    select 1 from public.usuario u
    where u.id = case
      when coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then auth.uid()
      else null::uuid
    end and u.ativo and (
      u.perfil = 'administrador' or exists (
        select 1 from cadastro.acesso_paciente a
        where a.usuario_id = u.id and a.paciente_id = p_paciente_id
          and a.revogada_em is null
      )
    )
  ) end;
$$;

revoke all on function cadastro.possui_acesso_paciente(uuid) from public, anon, authenticated;
