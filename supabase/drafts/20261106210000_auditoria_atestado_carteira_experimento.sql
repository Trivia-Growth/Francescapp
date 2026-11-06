-- EXPERIMENTO: pressupõe superusuário; não está pronto para migração.
-- O request recebido é apenas correlação não confiável quando o atestado falha.
create or replace function api.listar_pacientes(p_entrada jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare req uuid; ator uuid;
begin
 begin
  return identidade.listar_carteira_privada(p_entrada);
 exception
  when sqlstate 'PZ001' then
   req:=(p_entrada#>>'{entrada,request_id}')::uuid;
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),auth.uid(),'api.listar_pacientes','carteira',null,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  when insufficient_privilege then
   if sqlerrm <> 'SEM_PERMISSAO' then raise; end if;
   ator:=auth.uid();
   begin
    req:=(p_entrada#>>'{entrada,request_id}')::uuid;
   exception when invalid_text_representation then
    raise exception using errcode='42501',message='SEM_PERMISSAO';
   end;
   if ator is null or req is null then
    raise exception using errcode='42501',message='SEM_PERMISSAO';
   end if;
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,'api.listar_pacientes','carteira',null,'negado',gen_random_uuid());
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end;
end
$$;
