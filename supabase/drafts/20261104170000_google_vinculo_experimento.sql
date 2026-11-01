-- EXPERIMENTO, somente concessão já vinculada; sem credencial/prova de sessão.
-- Identidade e subject são fornecidos por canal server-only confiável, não autenticados pelo SQL.
-- Não conceder acesso a runtime: não implementa primeira vinculação, Vault, RLS ou login real.
create table identidade.google_vinculo_fixture_uso (
 desafio_id uuid primary key references identidade.desafio_login(id),
 session_id uuid not null unique references identidade.sessao(session_id)
);
create function identidade.google_vinculo_fixture(p_desafio uuid,p_hash text,p_usuario uuid,p_subject text,p_sessao uuid,p_request uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare v_concessao uuid; v_versao integer; v_admitida boolean:=false; v_id uuid; v_expira timestamptz;
begin
 if p_desafio is null or p_hash is null or p_usuario is null or p_subject is null or p_sessao is null or p_request is null
 then raise exception 'entrada inválida' using errcode='22023'; end if;
 -- O lock serializa uso do desafio; o consumo prévio permanece commit independente.
 select expira_em into v_expira from identidade.desafio_login where id=p_desafio and nonce_hash=p_hash and consumido_em is not null for update;
 if found and v_expira > clock_timestamp() and not exists(select 1 from identidade.google_vinculo_fixture_uso where desafio_id=p_desafio) then
  select id into v_concessao from identidade.concessao_equipe where usuario_id=p_usuario and estado='vinculada' and metodo='google_workspace';
  if v_concessao is not null then
   perform 1 from identidade.concessao_equipe where id=v_concessao for update;
   perform 1 from public.usuario where id=p_usuario for update;
   select c.versao into v_versao from identidade.concessao_equipe c join public.usuario u on u.id=c.usuario_id
    where c.id=v_concessao and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=p_subject and c.usuario_id=p_usuario and u.ativo and u.perfil=c.perfil and v_expira>clock_timestamp();
   if found then
    insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
    values(p_sessao,p_usuario,v_concessao,v_versao,'google_workspace') on conflict do nothing;
    v_admitida:=found;
    if v_admitida then
     -- INSERT pode ter aguardado outro processo; não persistir após TTL.
     if v_expira<=clock_timestamp() then raise exception 'DESAFIO_EXPIROU'; end if;
     insert into identidade.google_vinculo_fixture_uso(desafio_id,session_id) values(p_desafio,p_sessao);
     if not found then raise exception 'vínculo não persistido'; end if;
    end if;
   end if;
  end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),case when v_admitida then p_usuario else null end,case when v_admitida then null else 'google_fixture' end,
 'sessao.google_fixture','sessao',p_sessao,case when v_admitida then 'permitido' else 'negado' end,p_request) returning id into v_id;
 if v_id is null then raise exception 'auditoria não persistida'; end if;
 return v_admitida;
end $$;
revoke all on function identidade.google_vinculo_fixture(uuid,text,uuid,text,uuid,uuid) from public,anon,authenticated;
