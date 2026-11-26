-- Rascunho de substituição: revisão e provas locais obrigatórias; não aplicar remotamente.
begin;
grant select (operador_restrito,request_id,acao,resultado,instante,id) on auditoria.evento to ffcmapp_preconcessao_teste_owner;
grant select (codigo,tipo,ativo,posse_ativa,expira_em) on auditoria.operador_tecnico to ffcmapp_preconcessao_teste_owner;
create policy preconcessao_teste_operador_leitura on auditoria.operador_tecnico for select to ffcmapp_preconcessao_teste_owner using (tipo='servico_teste');
create policy preconcessao_teste_auditoria_leitura on auditoria.evento for select to ffcmapp_preconcessao_teste_owner using (acao in ('servico_teste.autorizado','preconcessao_teste.autorizada','preconcessao_teste.encerramento_iniciado','preconcessao_teste.encerrado','preconcessao_teste.encerrado_indeterminado','teste.preconcessao_google'));
select set_config('ffcmapp.preconcessao_atualizador',current_user,true);
select set_config('ffcmapp.preconcessao_tinha_set',pg_has_role(current_user,'ffcmapp_preconcessao_teste_owner','SET')::text,true);
do $$ begin
 if current_setting('ffcmapp.preconcessao_tinha_set')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='ffcmapp_preconcessao_teste_owner' and u.rolname=current_user and g.rolname=current_user) then raise exception 'MEMBERSHIP_EXISTENTE_SEM_SET'; end if;
  execute format('grant ffcmapp_preconcessao_teste_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
select set_config('ffcmapp.preconcessao_tinha_create',has_schema_privilege('ffcmapp_preconcessao_teste_owner','identidade','CREATE')::text,true);
do $$ begin if current_setting('ffcmapp.preconcessao_tinha_create')='false' then grant create on schema identidade to ffcmapp_preconcessao_teste_owner; end if; end $$;
set local role ffcmapp_preconcessao_teste_owner;
create or replace function identidade.preconcessao_google_teste(p_projeto text,p_id uuid,p_email jsonb,p_hmac text,p_perfil text,p_motivo jsonb,p_request uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare operador text; linhas integer;
begin
 operador := auditoria.operador_tecnico_atual();
 if p_projeto is distinct from 'drdpuxcllpymtoskmuqv' or p_id is null or p_request is null or p_email is null or p_motivo is null or p_hmac is null or btrim(p_hmac)='' or p_perfil is distinct from 'administrador' then raise exception 'ENTRADA_INVALIDA' using errcode='22023'; end if;
 -- Serializa o request antes de consultar auditoria, inclusive chamadas concorrentes.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text, 741893));
 if not exists (select 1 from auditoria.operador_tecnico o where o.codigo=operador and o.tipo='servico_teste' and o.ativo and o.posse_ativa is not null and o.expira_em>clock_timestamp())
  or not exists (select 1 from (select e.request_id,e.resultado,e.acao from auditoria.evento e where e.operador_restrito=operador and e.acao in ('preconcessao_teste.autorizada','servico_teste.autorizado') order by e.instante desc,e.id desc limit 1) ultima where ultima.request_id=p_request and ultima.resultado='permitido' and ultima.acao='preconcessao_teste.autorizada')
  or exists (select 1 from auditoria.evento e where e.operador_restrito=operador and e.request_id=p_request and e.acao in ('preconcessao_teste.encerramento_iniciado','preconcessao_teste.encerrado','preconcessao_teste.encerrado_indeterminado')) then
  raise exception 'OPERACAO_NAO_AUTORIZADA' using errcode='42501';
 end if;
 if exists (select 1 from auditoria.evento e where e.request_id=p_request and e.acao='teste.preconcessao_google' and e.resultado='permitido') then
  raise exception 'REQUEST_JA_UTILIZADO' using errcode='23505';
 end if;
 if not exists (select 1 from identidade.bootstrap_tecnico_controle b join public.usuario u on u.id=b.usuario_id join identidade.concessao_equipe c on c.id=b.concessao_id and c.usuario_id=u.id where b.unico and b.projeto_ref=p_projeto and u.ativo and u.perfil='administrador' and c.estado='vinculada' and c.metodo='tecnica' and c.perfil='administrador') or not exists (select 1 from identidade.configuracao_auth_nativo where singleton and dominio_workspace='francescato.com.br' and google_unico_oauth_confirmado) then raise exception 'CONFIGURACAO_INDISPONIVEL' using errcode='55000'; end if;
 insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,motivo_cifrado) values(p_id,p_email,p_hmac,p_perfil,'google_workspace','pendente',p_motivo);
 get diagnostics linhas = row_count;
 if linhas <> 1 then raise exception 'PERSISTENCIA_INDISPONIVEL'; end if;
 insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),operador,'teste.preconcessao_google','concessao_equipe',p_id,'permitido',p_request);
 get diagnostics linhas = row_count;
 if linhas <> 1 then raise exception 'AUDITORIA_INDISPONIVEL'; end if;
 return 'criada';
end $$;
select set_config('role',current_setting('ffcmapp.preconcessao_atualizador'),true);
do $$ begin if current_setting('ffcmapp.preconcessao_tinha_create')='false' then revoke create on schema identidade from ffcmapp_preconcessao_teste_owner; end if; end $$;
do $$ begin if current_setting('ffcmapp.preconcessao_tinha_set')='false' then execute format('revoke ffcmapp_preconcessao_teste_owner from %I granted by %I',current_user,current_user); end if; end $$;
commit;
