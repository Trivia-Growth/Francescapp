-- EXPERIMENTO: pressupõe geração JÁ obtida com vínculo confiável à sessão.
-- Não implementa emissão inicial, admissão, recuperação pós-reload nem política
-- entre abas. Não chamar em runtime nem conceder execução com base nesta prova.
create table reserva_fixture.capacidade_fixture (
 session_id uuid primary key,
 usuario_id uuid not null references reserva_fixture.ator(id),
 geracao bigint not null check(geracao>0)
);
revoke all on reserva_fixture.capacidade_fixture from public,anon,authenticated;

create function reserva_fixture.vincular_capacidade_fixture(p_geracao_previa bigint,p_geracao_sessao bigint,p_verificador bytea)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare v_ator uuid; v_sessao uuid; v_atual bigint;
begin
 if p_geracao_previa is null or p_geracao_previa<1
   or saida_fixture.autorizar_prova(p_geracao_sessao,p_verificador) is not true then return false; end if;
 begin v_ator:=auth.uid(); v_sessao:=(auth.jwt()->>'session_id')::uuid;
 exception when invalid_text_representation then return false; end;
 if v_ator is null or v_sessao is null or not exists(select 1 from public.usuario where id=v_ator and ativo and perfil='administrador') then return false; end if;
 select geracao into v_atual from reserva_fixture.ator where id=v_ator for update;
 if not found or v_atual<>p_geracao_previa then return false; end if;
 insert into reserva_fixture.capacidade_fixture(session_id,usuario_id,geracao)
  values(v_sessao,v_ator,p_geracao_previa) on conflict(session_id) do nothing;
 return exists(select 1 from reserva_fixture.capacidade_fixture
  where session_id=v_sessao and usuario_id=v_ator and geracao=p_geracao_previa);
end $$;

create function reserva_fixture.capacidade_vigente_fixture(p_geracao_previa bigint,p_geracao_sessao bigint,p_verificador bytea)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare v_ator uuid; v_sessao uuid; v_atual bigint;
begin
 if p_geracao_previa is null or p_geracao_previa<1
   or saida_fixture.autorizar_prova(p_geracao_sessao,p_verificador) is not true then return false; end if;
 begin v_ator:=auth.uid(); v_sessao:=(auth.jwt()->>'session_id')::uuid;
 exception when invalid_text_representation then return false; end;
 if v_ator is null or v_sessao is null or not exists(select 1 from public.usuario where id=v_ator and ativo and perfil='administrador') then return false; end if;
 select geracao into v_atual from reserva_fixture.ator where id=v_ator for update;
 if not found or v_atual<>p_geracao_previa then return false; end if;
 return exists(select 1 from reserva_fixture.capacidade_fixture
  where session_id=v_sessao and usuario_id=v_ator and geracao=p_geracao_previa);
end $$;
revoke all on function reserva_fixture.vincular_capacidade_fixture(bigint,bigint,bytea),reserva_fixture.capacidade_vigente_fixture(bigint,bigint,bytea) from public,anon,authenticated;
