-- EXPERIMENTO apenas service-only já verificado; não é execução/grant de runtime.
-- Requer 1700, 1800, 2100 e 2200. Sem reativar usuário local preexistente.
create function identidade.google_selecionar_admissao_fixture(p_entrada jsonb,p_verificador bytea)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare i jsonb:=p_entrada->'identidade'; v_id uuid; v_desafio uuid; v_sessao uuid; v_request uuid; v_usuario uuid; v_vinculado uuid; v_estado text; v_subject text; v_email text; v_audit uuid; v_vinculos integer;
begin
 if jsonb_typeof(i) is distinct from 'object' or i->>'metodo' is distinct from 'google_workspace'
  or not coalesce(length(i->>'email_hmac') between 1 and 32768 and i->>'email_hmac' ~ '^[A-Za-z0-9_-]+$',false)
 then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 begin v_desafio:=(i->>'desafio_id')::uuid; v_sessao:=(i->>'session_id')::uuid; v_usuario:=(i->>'usuario_id')::uuid; v_request:=(p_entrada->>'request_id')::uuid;
 exception when invalid_text_representation then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end;
 if v_desafio is null or v_sessao is null or v_usuario is null or v_request is null then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 v_email:=i->>'email_hmac';
 -- Mesma ordem das funções chamadas: desafio, concessão, usuário.
 perform 1 from identidade.desafio_login where id=v_desafio for update;
 -- UUID ou subject já vinculados impedem uma segunda concessão por e-mail.
 select count(*) into v_vinculos from identidade.concessao_equipe where estado='vinculada' and metodo='google_workspace' and (usuario_id=v_usuario or subject_google=i->>'subject_google');
 if v_vinculos=1 then
  select id into v_id from identidade.concessao_equipe where estado='vinculada' and metodo='google_workspace' and (usuario_id=v_usuario or subject_google=i->>'subject_google');
  select estado,usuario_id,subject_google into v_estado,v_vinculado,v_subject from identidade.concessao_equipe where id=v_id and metodo='google_workspace' and estado='vinculada' for update;
  if v_estado='vinculada' and v_vinculado=v_usuario and v_subject=i->>'subject_google' then return identidade.google_admitir_com_prova_fixture(p_entrada,p_verificador); end if;
 elsif v_vinculos=0 then
  select id into v_id from identidade.concessao_equipe where email_hmac=v_email and metodo='google_workspace' and estado='pendente';
  if v_id is not null then
   select estado into v_estado from identidade.concessao_equipe where id=v_id and email_hmac=v_email and metodo='google_workspace' and estado='pendente' for update;
   if v_estado='pendente' then return identidade.google_primeiro_com_prova_fixture(p_entrada,p_verificador); end if;
  end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),null,'google_fixture','sessao.google_selecao_fixture','sessao',v_sessao,'negado',v_request) returning id into v_audit;
 if v_audit is null then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',v_request);
end $$;
revoke all on function identidade.google_selecionar_admissao_fixture(jsonb,bytea) from public,anon,authenticated;
