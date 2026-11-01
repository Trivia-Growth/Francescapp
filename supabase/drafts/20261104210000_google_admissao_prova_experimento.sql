-- FIXTURE NÃO INTEGRAR: pressupõe JWT/Google verificados em canal confiável.
-- Somente concessão já vinculada; não implementa primeira concessão, Auth ou Vault.
-- Negativas auditadas persistem apenas se o chamador confirmar a transação.
create function identidade.google_admitir_com_prova_fixture(p_entrada jsonb,p_verificador bytea)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare i jsonb:=p_entrada->'identidade'; e jsonb:=p_entrada->'credencial_refresh';
 u uuid; s uuid; d uuid; r uuid; v_perfil text; v_versao integer; v_concessao uuid; v_linhas bigint;
begin
 if jsonb_typeof(p_entrada) is distinct from 'object' or p_entrada-array['identidade','credencial_refresh','request_id']<>'{}'::jsonb
  or jsonb_typeof(i) is distinct from 'object' or i-array['usuario_id','session_id','metodo','subject_google','email_hmac','desafio_id','nonce_hash']<>'{}'::jsonb
  or i->>'metodo' is distinct from 'google_workspace' or coalesce(length(i->>'subject_google') between 1 and 255,false) is not true
  or coalesce(length(i->>'email_hmac') between 1 and 32768 and i->>'email_hmac' ~ '^[A-Za-z0-9_-]+$',false) is not true
  or coalesce(i->>'nonce_hash' ~ '^[0-9a-f]{64}$',false) is not true
  or p_verificador is null or octet_length(p_verificador)<>32
  or not coalesce(jsonb_typeof(e)='object' and e-array['formato','key_id','nonce','ciphertext','tag']='{}'::jsonb
   and e->'formato'='1'::jsonb and jsonb_typeof(e->'key_id')='string' and length(e->>'key_id') between 1 and 128
   and jsonb_typeof(e->'nonce')='string' and length(e->>'nonce') between 1 and 32768 and e->>'nonce' ~ '^[A-Za-z0-9_-]+$'
   and jsonb_typeof(e->'ciphertext')='string' and length(e->>'ciphertext') between 1 and 32768 and e->>'ciphertext' ~ '^[A-Za-z0-9_-]+$'
   and jsonb_typeof(e->'tag')='string' and length(e->>'tag') between 1 and 32768 and e->>'tag' ~ '^[A-Za-z0-9_-]+$',false)
 then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 begin u:=(i->>'usuario_id')::uuid; s:=(i->>'session_id')::uuid; d:=(i->>'desafio_id')::uuid; r:=(p_entrada->>'request_id')::uuid;
 exception when invalid_text_representation then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end;
 if u is null or s is null or d is null or r is null then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 if identidade.google_vinculo_fixture(d,i->>'nonce_hash',u,i->>'subject_google',s,r) is not true then
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',r);
 end if;
 insert into identidade.credencial_sessao(session_id,estado,geracao,envelope) values(s,'disponivel',1,e);
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='CREDENCIAL_NAO_INSERIDA'; end if;
 insert into identidade.prova_saida_fixture(session_id,usuario_id,geracao,verificador) values(s,u,1,p_verificador);
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='PROVA_NAO_REGISTRADA'; end if;
 -- Confirma conteúdo persistido, não apenas a contagem de linhas. Requer SELECT
 -- restrito de envelope/verificador; não conceder esse acesso ao executor.
 if not exists(select 1 from identidade.sessao sessao
   join identidade.google_vinculo_fixture_uso uso on uso.session_id=sessao.session_id and uso.desafio_id=d
   join identidade.credencial_sessao cred on cred.session_id=sessao.session_id
   join identidade.prova_saida_fixture prova on prova.session_id=sessao.session_id
   where sessao.session_id=s and sessao.usuario_id=u and sessao.revogada_em is null
     and cred.estado='disponivel' and cred.geracao=1 and cred.envelope=e
     and prova.usuario_id=u and prova.geracao=1 and prova.verificador=p_verificador) then
  raise exception using errcode='P0002',message='ADMISSAO_INCOMPLETA';
 end if;
 select sessao.concessao_id,usuario.perfil,usuario.versao into v_concessao,v_perfil,v_versao from identidade.sessao sessao join public.usuario usuario on usuario.id=sessao.usuario_id where sessao.session_id=s and usuario.id=u;
 if not found then raise exception using errcode='P0002',message='ADMISSAO_INCOMPLETA'; end if;
 -- Inserts podem esperar; revalidar o desafio com o lock ainda mantido.
 if not exists(select 1 from identidade.desafio_login where id=d and nonce_hash=i->>'nonce_hash'
   and consumido_em is not null and expira_em>clock_timestamp()) then
  raise exception using errcode='P0002',message='DESAFIO_EXPIROU';
 end if;
 return jsonb_build_object('ok',true,'dados',jsonb_build_object('usuario_id',u,'session_id',s,'concessao_id',v_concessao,'perfil',v_perfil,'versao_usuario',v_versao),'request_id',r);
end $$;
revoke all on function identidade.google_admitir_com_prova_fixture(jsonb,bytea) from public,anon,authenticated;
