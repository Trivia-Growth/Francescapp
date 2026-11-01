-- EXPERIMENTO: formato interno provisório, sem rota/grants de runtime.
-- Exige capacidade fixture vinculada; não emite nem prova origem da geração.
-- JWT, Vault e canal do verificador ainda não foram comprovados. Não integrar.
create function reserva_fixture.abrir_autorizada(p_transporte jsonb,p_geracao_sessao bigint,p_verificador bytea)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; v_ator uuid; v_sessao uuid; v_request uuid; v_reserva uuid; v_geracao bigint; v_emitido timestamptz; v_expira timestamptz; v_estado text; v_aceita boolean:=false; v_linhas bigint;
begin
 begin
  v_request:=(e->>'request_id')::uuid;
  v_reserva:=(e->>'reserva_id')::uuid;
  v_geracao:=(e->>'geracao')::bigint;
 exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end;
 if v_request is null or v_reserva is null or v_geracao is null or v_geracao<1 then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 if jsonb_typeof(e)='object' and e-array['request_id','reserva_id','geracao','atestado']='{}'::jsonb
   and jsonb_typeof(e->'geracao')='number'
   and reserva_fixture.capacidade_vigente_fixture(v_geracao,p_geracao_sessao,p_verificador) is true
   and experimento_atestado.verificar_com_chave_interna(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is true then
  begin
   v_ator:=auth.uid(); v_sessao:=(auth.jwt()->>'session_id')::uuid;
   v_emitido:=(a->>'emitido_em')::timestamptz; v_expira:=(a->>'expira_em')::timestamptz;
   v_aceita:=coalesce(v_ator is not null and v_sessao is not null and (a->>'usuario_id')::uuid=v_ator
     and (a->>'session_id')::uuid=v_sessao and a->>'request_id'=e->>'request_id'
     and a->>'operacao'='fixture.reserva.abrir' and v_emitido<=clock_timestamp()
     and v_expira>clock_timestamp() and v_expira>v_emitido
     and v_expira-v_emitido<=experimento_atestado.prazo_maximo_teste()
     and exists(select 1 from public.usuario where id=v_ator and ativo and perfil='administrador'),false);
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then v_aceita:=false;
  end;
 end if;
 if not v_aceita then
  insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),'reserva_fixture','fixture.reserva.abrir','reserva',null,'negado',v_request);
  get diagnostics v_linhas=row_count;
  if v_linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_REGISTRADA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',v_request);
 end if;
 -- A identidade provém da sessão fixture, não de campo fornecido no comando.
 -- O lock do ator pode aguardar outra tentativa; não usar atestado expirado.
 perform 1 from reserva_fixture.ator where id=v_ator for update;
 if not found or v_expira<=clock_timestamp() then
  insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),'reserva_fixture','fixture.reserva.abrir','reserva',null,'negado',v_request);
  get diagnostics v_linhas=row_count;
  if v_linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_REGISTRADA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',v_request);
 end if;
 v_estado:=reserva_fixture.abrir(v_ator,v_geracao,v_reserva);
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),v_ator,'fixture.reserva.abrir','reserva',v_reserva,
  case when v_estado in ('aberta','confirmada') then 'permitido' else 'negado' end,v_request);
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_REGISTRADA'; end if;
 return jsonb_build_object('ok',true,'estado',v_estado,'request_id',v_request);
end $$;
revoke all on function reserva_fixture.abrir_autorizada(jsonb,bigint,bytea) from public,anon,authenticated;
