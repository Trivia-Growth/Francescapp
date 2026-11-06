-- Preparação privada: invoker sem grants; não expor antes de S-02 e provas reais.
create function api.criar_contato_paciente(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' set row_security=on as $$
declare req uuid; contato uuid;
begin
 begin
  return operacao.criar_contato_paciente_privado(p_transporte);
 exception when sqlstate 'PZ001' then
  req:=(p_transporte#>>'{entrada,request_id}')::uuid;
  contato:=(p_transporte#>>'{entrada,contato_id}')::uuid;
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),auth_privado.uid(),'api.criar_contato_paciente','contato',contato,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end;
end $$;
revoke all on function api.criar_contato_paciente(jsonb) from public,anon,authenticated,service_role;
