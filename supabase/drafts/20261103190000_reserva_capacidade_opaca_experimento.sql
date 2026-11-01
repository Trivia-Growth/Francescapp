-- EXPERIMENTO: NÃO integrar. A entrega/canal/proteção de logs e emissão inicial
-- dependem de solução externa ainda não comprovada. Tokens nunca são auditados.
create table reserva_fixture.capacidade_opaca_fixture (
 sessao uuid primary key, ator uuid not null references reserva_fixture.ator(id),
 epoca bigint not null, verificador bytea not null check(octet_length(verificador)=32)
);
revoke all on reserva_fixture.capacidade_opaca_fixture from public,anon,authenticated;
create function reserva_fixture.verificar_opaca_fixture(p_epoca bigint,p_capacidade bytea,p_geracao_sessao bigint,p_prova bytea)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare v_ator uuid; v_sessao uuid; v_epoca bigint;
begin
 if p_epoca is null or p_epoca<1 or p_capacidade is null or octet_length(p_capacidade)<>32
  or saida_fixture.autorizar_prova(p_geracao_sessao,p_prova) is distinct from true then return false; end if;
 begin v_ator:=auth.uid(); v_sessao:=(auth.jwt()->>'session_id')::uuid;
 exception when invalid_text_representation then return false; end;
 if v_ator is null or v_sessao is null or not exists(select 1 from public.usuario where id=v_ator and ativo and perfil='administrador') then return false; end if;
 select geracao into v_epoca from reserva_fixture.ator where id=v_ator for update;
 if not found or v_epoca<>p_epoca then return false; end if;
 return exists(select 1 from reserva_fixture.capacidade_opaca_fixture where sessao=v_sessao and ator=v_ator and epoca=p_epoca
  and verificador=extensions.digest(p_capacidade,'sha256'));
end $$;
create function reserva_fixture.fechar_rotacionando_opaca_fixture(p_reserva uuid,p_epoca bigint,p_capacidade bytea,p_geracao_sessao bigint,p_prova bytea)
returns bytea language plpgsql security invoker set search_path=pg_catalog as $$
declare v_ator uuid; v_sessao uuid; v_nova bytea; v_estado text; v_linhas bigint;
begin
 if reserva_fixture.verificar_opaca_fixture(p_epoca,p_capacidade,p_geracao_sessao,p_prova) is not true then return null; end if;
 v_ator:=auth.uid(); v_sessao:=(auth.jwt()->>'session_id')::uuid;
 v_estado:=reserva_fixture.fechar(v_ator,p_epoca,p_reserva);
 if v_estado not in ('cancelada','confirmada') then return null; end if;
 v_nova:=extensions.gen_random_bytes(32);
 update reserva_fixture.capacidade_opaca_fixture set epoca=p_epoca+1,verificador=extensions.digest(v_nova,'sha256')
  where sessao=v_sessao and ator=v_ator and epoca=p_epoca and verificador=extensions.digest(p_capacidade,'sha256');
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='CAPACIDADE_NAO_ROTACIONADA'; end if;
 return v_nova;
end $$;
revoke all on function reserva_fixture.verificar_opaca_fixture(bigint,bytea,bigint,bytea),reserva_fixture.fechar_rotacionando_opaca_fixture(uuid,bigint,bytea,bigint,bytea) from public,anon,authenticated;
