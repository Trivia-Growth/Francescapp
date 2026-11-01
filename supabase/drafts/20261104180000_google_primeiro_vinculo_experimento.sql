-- EXPERIMENTO: somente UUID Auth sem usuário local anterior; não reativa contas.
-- Canal server-only deve comprovar Google/JWT e calcular HMAC; SQL não os autentica.
-- Não cria credencial/prova de sessão nem concede privilégio de runtime.
-- Exige tabela google_vinculo_fixture_uso do experimento 1700.
create function identidade.google_primeiro_vinculo_fixture(p_desafio uuid,p_nonce_hash text,p_email_hmac text,p_usuario uuid,p_subject text,p_sessao uuid,p_request uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare v_concessao uuid; v_perfil text; v_versao integer; v_versao_original integer; v_expira timestamptz; v_audit uuid; v_ok boolean:=false;
begin
 if p_desafio is null or p_nonce_hash is null or p_email_hmac is null or p_usuario is null or p_subject is null or p_sessao is null or p_request is null
 or p_subject='' or p_email_hmac='' then raise exception 'entrada inválida' using errcode='22023'; end if;
 select expira_em into v_expira from identidade.desafio_login where id=p_desafio and nonce_hash=p_nonce_hash and consumido_em is not null for update;
 if found and v_expira>clock_timestamp() and not exists(select 1 from identidade.google_vinculo_fixture_uso where desafio_id=p_desafio) then
  select id into v_concessao from identidade.concessao_equipe where email_hmac=p_email_hmac and metodo='google_workspace' and estado='pendente';
  if v_concessao is not null then
   perform 1 from identidade.concessao_equipe where id=v_concessao for update;
   select perfil,versao into v_perfil,v_versao from identidade.concessao_equipe where id=v_concessao and email_hmac=p_email_hmac and metodo='google_workspace' and estado='pendente' and v_expira>clock_timestamp();
   if found then
    v_versao_original:=v_versao;
    begin
     insert into public.usuario(id,perfil) values(p_usuario,v_perfil) on conflict do nothing;
     if not found then raise exception 'vínculo negado' using errcode='P0003'; end if;
     update identidade.concessao_equipe set estado='vinculada',usuario_id=p_usuario,subject_google=p_subject,vinculada_em=clock_timestamp(),atualizada_em=clock_timestamp(),versao=versao+1 where id=v_concessao and estado='pendente' returning versao into v_versao;
     if not found then raise exception 'vínculo negado' using errcode='P0003'; end if;
     insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo) values(p_sessao,p_usuario,v_concessao,v_versao,'google_workspace') on conflict do nothing;
     if not found then raise exception 'vínculo negado' using errcode='P0003'; end if;
     if v_expira<=clock_timestamp() then raise exception 'vínculo expirou' using errcode='P0003'; end if;
     insert into identidade.google_vinculo_fixture_uso(desafio_id,session_id) values(p_desafio,p_sessao);
     if not found then raise exception 'vínculo negado' using errcode='P0003'; end if;
     if not exists (
      select 1 from identidade.concessao_equipe c
      join public.usuario u on u.id=c.usuario_id
      join identidade.sessao s on s.session_id=p_sessao and s.usuario_id=u.id and s.concessao_id=c.id
      join identidade.google_vinculo_fixture_uso x on x.desafio_id=p_desafio and x.session_id=s.session_id
      where c.id=v_concessao and c.estado='vinculada' and c.metodo='google_workspace'
       and c.email_hmac=p_email_hmac and c.usuario_id=p_usuario and c.subject_google=p_subject
       and c.perfil=v_perfil and c.versao=v_versao_original+1 and c.vinculada_em is not null
       and u.perfil=v_perfil and u.ativo and u.versao=1
       and s.metodo='google_workspace' and s.concessao_versao_admissao=c.versao and s.revogada_em is null
     ) then raise exception 'vínculo inconsistente' using errcode='P0003'; end if;
     if v_expira<=clock_timestamp() then raise exception 'vínculo expirou' using errcode='P0003'; end if;
     v_ok:=true;
    exception when sqlstate 'P0003' or unique_violation or foreign_key_violation then v_ok:=false; end;
   end if;
  end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),case when v_ok then p_usuario else null end,case when v_ok then null else 'google_fixture' end,'sessao.google_primeiro_fixture','sessao',p_sessao,case when v_ok then 'permitido' else 'negado' end,p_request) returning id into v_audit;
 if v_audit is null then raise exception 'auditoria não persistida'; end if;
 return v_ok;
end $$;
revoke all on function identidade.google_primeiro_vinculo_fixture(uuid,text,text,uuid,text,uuid,uuid) from public,anon,authenticated;
