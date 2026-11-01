-- EXPERIMENTO SEM GRANTS: canal do verificador, gateway e Vault não foram
-- comprovados. A função de reconciliação original continua sem exposição.
-- Negativas não são atribuídas a claims de usuário não comprovados; associar
-- auditoria a uma pessoa exige gateway confiável e revisão antes da integração.
-- O helper fixa os locks até o fim da transação que consulta e audita.
create function experimento_atestado.listar_reconciliacao_com_prova_fixture(
 p_transporte jsonb,p_geracao bigint,p_verificador bytea
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare v_request uuid; v_linhas integer;
begin
 if saida_fixture.autorizar_prova(p_geracao,p_verificador) is not true then
   begin
     v_request := (p_transporte->>'request_id')::uuid;
   exception when invalid_text_representation then
     raise exception using errcode='22023',message='ENTRADA_INVALIDA';
   end;
   if v_request is null then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
   insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),'reconciliacao_prova_fixture','api.listar_reconciliacao','requisicao',null,'negado',v_request);
   get diagnostics v_linhas = row_count;
   if v_linhas <> 1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',v_request);
 end if;
 return experimento_atestado.listar_reconciliacao(p_transporte);
end $$;
revoke all on function experimento_atestado.listar_reconciliacao_com_prova_fixture(jsonb,bigint,bytea)
 from public,anon,authenticated;
