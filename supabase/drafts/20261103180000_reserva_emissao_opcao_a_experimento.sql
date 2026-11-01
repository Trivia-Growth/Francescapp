-- EXPERIMENTO, NÃO INTEGRAR. O caller fornece a época esperada: sua origem
-- anterior à requisição NÃO é comprovada e pode ser adivinhada. Sem PII.
create table reserva_fixture.emissao_opcao_a (
 ator uuid not null references reserva_fixture.ator(id), sessao uuid not null,
 epoca bigint not null, requisicao uuid not null, capacidade uuid not null,
 primary key(ator,sessao,epoca), unique(requisicao), unique(capacidade)
);
revoke all on reserva_fixture.emissao_opcao_a from public,anon,authenticated;
create function reserva_fixture.emitir_opcao_a(p_epoca bigint,p_requisicao uuid,p_geracao_sessao bigint,p_prova bytea)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare v_ator uuid; v_sessao uuid; v_epoca bigint; v_linha reserva_fixture.emissao_opcao_a;
begin
 if p_epoca is null or p_epoca<1 or p_requisicao is null
  or saida_fixture.autorizar_prova(p_geracao_sessao,p_prova) is distinct from true then return null; end if;
 begin v_ator:=auth.uid(); v_sessao:=(auth.jwt()->>'session_id')::uuid;
 exception when invalid_text_representation then return null; end;
 if v_ator is null or v_sessao is null or not exists(select 1 from public.usuario where id=v_ator and ativo and perfil='administrador') then return null; end if;
 select geracao into v_epoca from reserva_fixture.ator where id=v_ator for update;
 if not found or v_epoca<>p_epoca then return null; end if;
 insert into reserva_fixture.emissao_opcao_a(ator,sessao,epoca,requisicao,capacidade)
 values(v_ator,v_sessao,p_epoca,p_requisicao,gen_random_uuid()) on conflict do nothing;
 select * into v_linha from reserva_fixture.emissao_opcao_a where ator=v_ator and sessao=v_sessao and epoca=p_epoca and requisicao=p_requisicao;
 if not found then return null; end if;
 return jsonb_build_object('epoca',v_linha.epoca,'capacidade',v_linha.capacidade);
end $$;
revoke all on function reserva_fixture.emitir_opcao_a(bigint,uuid,bigint,bytea) from public,anon,authenticated;
