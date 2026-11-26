begin;

create temporary table acessos_privilegios_migracao on commit drop as select current_user::text migrador,pg_has_role(current_user,'ffcmapp_acessos_owner','SET') tinha_set,has_schema_privilege('ffcmapp_acessos_owner','api','CREATE') tinha_api,has_schema_privilege('ffcmapp_acessos_owner','identidade','CREATE') tinha_identidade;
do $$ declare p record;begin select * into p from acessos_privilegios_migracao;
 if not p.tinha_set then
  if exists(select 1 from pg_auth_members where roleid='ffcmapp_acessos_owner'::regrole and member=current_user::regrole and grantor=current_user::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
  execute format('grant ffcmapp_acessos_owner to %I with inherit false,set true granted by %I',p.migrador,p.migrador);
 end if;
 if not p.tinha_api then grant create on schema api to ffcmapp_acessos_owner;end if;
 if not p.tinha_identidade then grant create on schema identidade to ffcmapp_acessos_owner;end if;
end $$;
-- DF-023: contexto real de autenticação; sem criar identidade Google ou vínculo de caso.
grant update(usuario_id,subject_google,estado,vinculada_em,atualizada_em) on identidade.concessao_equipe to ffcmapp_acessos_owner;
create policy acessos_concessao_vincular on identidade.concessao_equipe for update to ffcmapp_acessos_owner
 using(estado='pendente' and usuario_id is null and exists(select 1 from identidade.acesso_gerenciado g where g.operacao_id=concessao_equipe.id and g.metodo='google_workspace' and g.estado='aguardando_google'))
 with check(estado='vinculada' and usuario_id=(select auth_privado.uid()) and exists(select 1 from identidade.acesso_gerenciado g where g.operacao_id=concessao_equipe.id and g.usuario_id=(select auth_privado.uid())));
-- Delegação estreita do HMAC existente; nenhuma chave sai do owner original.
do $$ declare migrador text:=current_user; tinha boolean; begin
 tinha:=pg_has_role(migrador,'ffcmapp_email_hmac_owner','SET');
 if not tinha then
  if exists(select 1 from pg_auth_members where roleid='ffcmapp_email_hmac_owner'::regrole and member=migrador::regrole and grantor=migrador::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
  execute format('grant ffcmapp_email_hmac_owner to %I with inherit false,set true granted by %I',migrador,migrador);
 end if;
 perform set_config('role','ffcmapp_email_hmac_owner',true);
 grant execute on function identidade.email_google_hmac_nativo() to ffcmapp_acessos_owner;
 perform set_config('role',migrador,true);
 if not tinha then execute format('revoke ffcmapp_email_hmac_owner from %I granted by %I',migrador,migrador);end if;
end $$;
-- HMAC de login Auth atual: UUID estável não autoriza trocar o e-mail aprovado.
do $migracao$ declare migrador text:=current_user; tinha_set boolean:=pg_has_role(current_user,'ffcmapp_email_hmac_owner','SET'); tinha_create boolean:=has_schema_privilege('ffcmapp_email_hmac_owner','identidade','CREATE');begin
 if not tinha_set then
  if exists(select 1 from pg_auth_members where roleid='ffcmapp_email_hmac_owner'::regrole and member=migrador::regrole and grantor=migrador::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
  execute format('grant ffcmapp_email_hmac_owner to %I with inherit false,set true granted by %I',migrador,migrador);
 end if;
 if not tinha_create then grant create on schema identidade to ffcmapp_email_hmac_owner;end if;
 perform set_config('role','ffcmapp_email_hmac_owner',true);
 execute $ddl$create function identidade.email_auth_hmac_nativo(p_usuario uuid) returns text language plpgsql stable security definer set search_path='' as $corpo$
 declare email text;referencia text;segredo text;chave bytea;
 begin
  email:=lower(btrim(auth_privado.email_conta_gerenciada(p_usuario)));
  if email is null or email!~'^[!-~]+@[!-~]+$' or length(email)>254 then return null;end if;
  select referencia_hmac_email into strict referencia from identidade.configuracao_auth_nativo;
  select decrypted_secret into strict segredo from vault.decrypted_secrets where name=referencia;
  chave:=decode(segredo,'base64');
  if octet_length(chave)<>32 or encode(chave,'base64')<>segredo then raise exception 'CHAVE_INVALIDA';end if;
  return rtrim(translate(encode(extensions.hmac(convert_to('ffcmapp:hmac:v1:email-concessao:'||email,'UTF8'),chave,'sha256'),'base64'),'+/','-_'),'=');
 end $corpo$ $ddl$;
 revoke all on function identidade.email_auth_hmac_nativo(uuid) from public,anon,authenticated,service_role;
 grant execute on function identidade.email_auth_hmac_nativo(uuid) to ffcmapp_acessos_owner;
 perform set_config('role',migrador,true);
 if not tinha_create then revoke create on schema identidade from ffcmapp_email_hmac_owner;end if;
 if not tinha_set then execute format('revoke ffcmapp_email_hmac_owner from %I granted by %I',migrador,migrador);end if;
end $migracao$;
create function identidade.cadastro_gerenciado_proprio(p_google_pendente boolean default false) returns boolean language sql security definer set search_path='' set row_security=on as $$
 select exists(select 1 from identidade.acesso_gerenciado g where g.usuario_id=auth_privado.uid()) or (p_google_pendente and exists(select 1 from identidade.acesso_gerenciado g where g.usuario_id is null and g.metodo='google_workspace' and g.estado='aguardando_google' and g.email_hmac=identidade.email_google_hmac_nativo()))
$$;
alter function identidade.cadastro_gerenciado_proprio(boolean) owner to ffcmapp_acessos_owner;
-- Depois da troca de dono, só o próprio dono revoga/concede: a membership do migrador tem inherit false.
set role ffcmapp_acessos_owner;
revoke all on function identidade.cadastro_gerenciado_proprio(boolean) from public,anon,authenticated,service_role;
reset role;
create function identidade.concessao_interna_ativa(p_concessao uuid,p_usuario uuid) returns boolean language sql security definer set search_path='' set row_security=on as $$
 select exists(select 1 from identidade.acesso_gerenciado g join public.usuario u on u.id=g.usuario_id and u.ativo where g.usuario_id=p_usuario and g.concessao_id=p_concessao and g.metodo='interno' and g.estado='ativo' and g.funcao in ('administrador','case_manager','profissional') and u.perfil=case g.funcao when 'case_manager' then 'profissional' else g.funcao end)
$$;
alter function identidade.concessao_interna_ativa(uuid,uuid) owner to ffcmapp_acessos_owner;
-- Depois da troca de dono, só o próprio dono revoga/concede: a membership do migrador tem inherit false.
set role ffcmapp_acessos_owner;
revoke all on function identidade.concessao_interna_ativa(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function identidade.concessao_interna_ativa(uuid,uuid) to ffcmapp_turno_grupo3_owner;
reset role;
-- Helper lê somente metadados de autenticação. Nunca retorna nome, e-mail, casos ou conteúdo.
create function identidade.contexto_acesso_vigente(p_admitir boolean default false) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare ator uuid:=auth_privado.uid(); sid uuid; g identidade.acesso_gerenciado; c record; u record; s record; google record; dominio text; metodo_vigente text; perfil_vigente text; subject_google_vigente text; hmac text; gerenciada boolean:=false; c_id uuid; c_versao integer; c_habilitado boolean:=false;
begin
 begin sid:=(auth_privado.jwt()->>'session_id')::uuid;exception when invalid_text_representation then return null;end;
 if ator is null or sid is null or bloqueios_auth.travar(ator,sid) is distinct from true then return null;end if;
 if not exists(select 1 from auth_privado.sessoes() a where a.id=sid and a.user_id=ator and (a.not_after is null or a.not_after>clock_timestamp())) then return null;end if;
 perform 1 from identidade.sessao x where x.session_id=sid and (x.usuario_id<>ator or x.revogada_em is not null or x.encerrada_em is not null);
 if found then return null;end if;
 select * into g from identidade.acesso_gerenciado x where x.usuario_id=ator;
 if found then gerenciada:=true;end if;
 if exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
  if dominio is null then return null;end if;
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google';
  if not found or (select count(*) from auth_privado.identidades() i where i.user_id=ator and i.provider='google')<>1
   or google.identity_data->>'sub' is distinct from google.provider_id or google.identity_data->>'email_verified' is distinct from 'true' or google.identity_data#>>'{custom_claims,hd}' is distinct from dominio then return null;end if;
  metodo_vigente:='google_workspace';subject_google_vigente:=google.provider_id;
  if not gerenciada and p_admitir then
   hmac:=identidade.email_google_hmac_nativo();
   select * into g from identidade.acesso_gerenciado x where x.email_hmac=hmac and x.metodo='google_workspace' and x.estado='aguardando_google' and x.usuario_id is null for update;
   if found then
    if exists(select 1 from public.usuario x where x.id=ator) then return null;end if;
    update identidade.acesso_gerenciado set usuario_id=ator,subject_google=google.provider_id where operacao_id=g.operacao_id;
    g.usuario_id:=ator;g.subject_google:=google.provider_id;gerenciada:=true;
   end if;
  end if;
  if gerenciada and (g.metodo<>metodo_vigente or g.subject_google is distinct from google.provider_id or g.estado not in ('aguardando_google','ativo') or identidade.email_google_hmac_nativo() is distinct from g.email_hmac) then return null;end if;
 elsif exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  if not gerenciada or g.metodo<>'interno' or g.estado<>'ativo' or not exists(select 1 from auth_privado.conta_propria() a where a.id=ator and a.email_confirmado and a.operacao_id=g.operacao_id::text and identidade.email_auth_hmac_nativo(ator)=g.email_hmac) then return null;end if;
  metodo_vigente:='interno';
 else return null;end if;
 if gerenciada then
  perfil_vigente:=case g.funcao when 'case_manager' then 'profissional' else g.funcao end;
  if p_admitir and g.metodo='google_workspace' and g.estado='aguardando_google' then
   if perfil_vigente<>'familia' then
    update identidade.concessao_equipe set usuario_id=ator,subject_google=google.provider_id,estado='vinculada',vinculada_em=clock_timestamp(),atualizada_em=clock_timestamp(),versao=versao+1 where id=g.concessao_id and estado='pendente' and usuario_id is null;
    if not found then raise exception 'CONCESSAO_GERENCIADA_INCONSISTENTE';end if;
   end if;
   insert into public.usuario(id,perfil) values(ator,perfil_vigente);
   update identidade.acesso_gerenciado set estado='ativo' where operacao_id=g.operacao_id;g.estado:='ativo';
  end if;
 else
  select x.perfil into perfil_vigente from identidade.concessao_equipe x where x.usuario_id=ator and x.estado='vinculada' and x.metodo='google_workspace' and x.subject_google=google.provider_id for share;
  if not found then return null;end if;
 end if;
 if perfil_vigente<>'familia' then
  select x.id,x.versao,x.habilitado_plano_crise into c from identidade.concessao_equipe x where x.usuario_id=ator and x.perfil=perfil_vigente and x.estado='vinculada' and x.metodo=metodo_vigente and (metodo_vigente<>'google_workspace' or x.subject_google=subject_google_vigente) for share;
  if not found or (gerenciada and c.id is distinct from g.concessao_id) then return null;end if;
  c_id:=c.id;c_versao:=c.versao;c_habilitado:=c.habilitado_plano_crise;
 end if;
 select x.id,x.perfil,x.ativo,x.versao into u from public.usuario x where x.id=ator for share;
 if not found or not u.ativo or u.perfil is distinct from perfil_vigente then return null;end if;
 -- Tombstone conferido antes da inserção; ON CONFLICT jamais reabre sessão encerrada.
 select x.usuario_id,x.concessao_id,x.metodo,x.revogada_em,x.encerrada_em into s from identidade.sessao x where x.session_id=sid for share;
 if found and (s.usuario_id<>ator or s.metodo<>metodo_vigente or s.revogada_em is not null or s.encerrada_em is not null or s.concessao_id is distinct from c_id) then return null;end if;
 if p_admitir then
  insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo) values(sid,ator,c_id,c_versao,metodo_vigente) on conflict(session_id) do nothing;
 end if;
 perform 1 from identidade.sessao x where x.session_id=sid and x.usuario_id=ator and x.metodo=metodo_vigente and x.revogada_em is null and x.encerrada_em is null for share;
 if not found or not exists(select 1 from auth_privado.sessoes() a where a.id=sid and a.user_id=ator and (a.not_after is null or a.not_after>clock_timestamp())) then return null;end if;
 return jsonb_build_object('usuario_id',ator,'session_id',sid,'perfil',perfil_vigente,'versao',u.versao,'funcao',case when gerenciada then g.funcao else null end,'metodo',metodo_vigente,'concessao_id',c_id,'habilitado_plano_crise',c_habilitado);
end $$;
alter function identidade.contexto_acesso_vigente(boolean) owner to ffcmapp_acessos_owner;
-- Depois da troca de dono, só o próprio dono revoga/concede: a membership do migrador tem inherit false.
set role ffcmapp_acessos_owner;
revoke all on function identidade.contexto_acesso_vigente(boolean) from public,anon,authenticated,service_role;
reset role;

create function api.acesso_gerenciado_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
#variable_conflict use_variable
declare e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid:=auth_privado.uid(); sid uuid; req uuid; op uuid; alvo uuid; ctx jsonb; acao text; inicio timestamptz; fim timestamptz; g identidade.acesso_gerenciado; perfil text; resposta jsonb; repeticao boolean:=false; permitido boolean:=false; cursor uuid; itens jsonb; proximo uuid;
begin
 begin
  if jsonb_typeof(p_transporte) is distinct from 'object' or p_transporte-array['entrada','entrada_canonica','dados_canonicos']<>'{}'::jsonb or jsonb_typeof(e) is distinct from 'object' or e-array['request_id','atestado','operacao_id','usuario_id','nome_cifrado','email_cifrado','email_hmac','funcao','metodo','motivo_cifrado','chave_idempotencia','digest_idempotencia','resultado_auth','email_concessao_cifrado','motivo_concessao_cifrado','cursor_id','dominio_email']<>'{}'::jsonb then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
  sid:=(auth_privado.jwt()->>'session_id')::uuid;req:=(e->>'request_id')::uuid;op:=(e->>'operacao_id')::uuid;alvo:=(e->>'usuario_id')::uuid;cursor:=(e->>'cursor_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz;fim:=(a->>'expira_em')::timestamptz;acao:=a->>'operacao';
  if ator is null or sid is null or req is null or inicio is null or fim is null or acao is null or acao not in ('api.reservar_acesso_gerenciado','api.confirmar_acesso_gerenciado','api.consultar_operacao_acesso','api.listar_acessos_gerenciados') or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sid::text or a->>'request_id' is distinct from req::text or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds' or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then raise exception using errcode='42501',message='SEM_PERMISSAO';end if;
  ctx:=identidade.contexto_acesso_vigente(false);
  if ctx->>'perfil' is distinct from 'administrador' or not exists(select 1 from identidade.configuracao_sistema where chave='ffcm.acessos.ativo' and valor='true'::jsonb) then raise exception using errcode='42501',message='SEM_PERMISSAO';end if;
  if acao='api.listar_acessos_gerenciados' then
   if e-array['request_id','atestado','cursor_id']<>'{}'::jsonb then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
   select coalesce(jsonb_agg(to_jsonb(x)-array['email_hmac','motivo_cifrado','subject_google','concessao_id','chave_idempotencia','digest_idempotencia','email_concessao_cifrado','motivo_concessao_cifrado'] order by x.operacao_id),'[]'::jsonb) into itens from (select * from identidade.acesso_gerenciado where cursor is null or operacao_id>cursor order by operacao_id limit 50) x;
   if jsonb_array_length(itens)=50 and exists(select 1 from identidade.acesso_gerenciado where operacao_id>(itens->49->>'operacao_id')::uuid) then proximo:=(itens->49->>'operacao_id')::uuid;end if;
   resposta:=jsonb_build_object('itens',itens,'proximo_cursor',proximo);
  else
   if op is null then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
   -- Reautorizar sempre ANTES do recibo, inclusive resultado perdido.
   select * into g from identidade.acesso_gerenciado where operacao_id=op for update;
   if acao='api.reservar_acesso_gerenciado' then
    if found then
     if g.criado_por_usuario_id<>ator or g.chave_idempotencia is distinct from e->>'chave_idempotencia' or g.digest_idempotencia is distinct from e->>'digest_idempotencia' then raise exception using errcode='PZ023',message='conflito_idempotencia';end if;
     repeticao:=true;
    else
     if e->>'funcao' is null or e->>'funcao' not in ('administrador','case_manager','familia','profissional') or e->>'metodo' is null or e->>'metodo' not in ('interno','google_workspace') or (e->>'metodo'='interno' and alvo is null) or (e->>'metodo'='google_workspace' and alvo is not null) or jsonb_typeof(e->'nome_cifrado') is distinct from 'object' or jsonb_typeof(e->'email_cifrado') is distinct from 'object' or jsonb_typeof(e->'motivo_cifrado') is distinct from 'object' or length(coalesce(e->>'email_hmac','')) not between 1 and 256 or length(coalesce(e->>'chave_idempotencia','')) not between 16 and 200 or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$' then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
     if e->>'metodo'='google_workspace' and not exists(select 1 from identidade.configuracao_auth_nativo cfg where cfg.google_unico_oauth_confirmado and cfg.dominio_workspace=e->>'dominio_email') then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
     if e->>'funcao'<>'familia' and (jsonb_typeof(e->'email_concessao_cifrado') is distinct from 'object' or jsonb_typeof(e->'motivo_concessao_cifrado') is distinct from 'object') then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
     if exists(select 1 from identidade.concessao_equipe c where c.email_hmac=e->>'email_hmac' and c.estado in ('pendente','vinculada')) or (alvo is not null and exists(select 1 from auth_privado.conta_gerenciada(alvo))) then raise exception using errcode='PZ023',message='conflito';end if;
     insert into identidade.acesso_gerenciado(operacao_id,usuario_id,nome_cifrado,email_cifrado,motivo_cifrado,email_hmac,funcao,metodo,estado,criado_por_usuario_id,chave_idempotencia,digest_idempotencia,email_concessao_cifrado,motivo_concessao_cifrado)
      values(op,alvo,e->'nome_cifrado',e->'email_cifrado',e->'motivo_cifrado',e->>'email_hmac',e->>'funcao',e->>'metodo',case when e->>'metodo'='google_workspace' then 'aguardando_google' else 'reservado' end,ator,e->>'chave_idempotencia',e->>'digest_idempotencia',e->'email_concessao_cifrado',e->'motivo_concessao_cifrado') returning * into g;
     perfil:=case g.funcao when 'case_manager' then 'profissional' else g.funcao end;
     if perfil<>'familia' and g.metodo='google_workspace' then
      insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,criado_por_usuario_id,motivo_cifrado) values(op,e->'email_concessao_cifrado',g.email_hmac,perfil,g.metodo,'pendente',ator,e->'motivo_concessao_cifrado');
      update identidade.acesso_gerenciado set concessao_id=op where operacao_id=op returning * into g;
     end if;
    end if;
   elsif acao='api.confirmar_acesso_gerenciado' then
    if not found or g.metodo<>'interno' or alvo is distinct from g.usuario_id then raise exception using errcode='PZ023',message='conflito';end if;
    if e->>'resultado_auth'='recusado' then
     if g.estado<>'reservado' or exists(select 1 from auth_privado.conta_gerenciada(alvo)) then raise exception using errcode='PZ023',message='conflito';end if;
     update identidade.acesso_gerenciado set estado='falha_confirmada' where operacao_id=op returning * into g;
    elsif e->>'resultado_auth'='conflito' then
     if exists(select 1 from auth_privado.conta_gerenciada(alvo)) then raise exception using errcode='PZ023',message='conflito';end if;
     update identidade.acesso_gerenciado set estado='conflito' where operacao_id=op and estado='reservado' returning * into g;
     if not found then raise exception using errcode='PZ023',message='conflito';end if;
    elsif e->>'resultado_auth'='criado' then
     if not exists(select 1 from auth_privado.conta_gerenciada(alvo) u where u.operacao_id=op::text and identidade.email_auth_hmac_nativo(alvo)=g.email_hmac) then raise exception using errcode='PZ023',message='conflito';end if;
     if g.estado='reservado' then
      update identidade.acesso_gerenciado set estado='aguardando_confirmacao_email' where operacao_id=op returning * into g;
      perfil:=case g.funcao when 'case_manager' then 'profissional' else g.funcao end;
      insert into public.usuario(id,perfil) values(alvo,perfil);
      if perfil<>'familia' then
       insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,criado_por_usuario_id,motivo_cifrado,vinculada_em) values(op,g.email_concessao_cifrado,g.email_hmac,perfil,'interno','vinculada',alvo,ator,g.motivo_concessao_cifrado,clock_timestamp());
       update identidade.acesso_gerenciado set concessao_id=op where operacao_id=op returning * into g;
      end if;
     elsif g.estado in ('aguardando_confirmacao_email','ativo') then repeticao:=true;
     else raise exception using errcode='PZ023',message='conflito';end if;
    else raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
   elsif not found then raise exception using errcode='PZ023',message='nao_encontrado';end if;
   resposta:=to_jsonb(g)-array['email_hmac','motivo_cifrado','subject_google','concessao_id','chave_idempotencia','digest_idempotencia','email_concessao_cifrado','motivo_concessao_cifrado'];
  end if;
  permitido:=true;
 exception when insufficient_privilege then resposta:=jsonb_build_object('codigo','sem_permissao');
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or invalid_parameter_value or not_null_violation or check_violation then resposta:=jsonb_build_object('codigo','entrada_invalida');
  when unique_violation then resposta:=jsonb_build_object('codigo','conflito_idempotencia');
  when sqlstate 'PZ023' then resposta:=jsonb_build_object('codigo',sqlerrm);
 end;
 if ator is not null then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,coalesce(acao,'api.reservar_acesso_gerenciado'),'acesso_gerenciado',op,case when permitido then 'permitido' else 'negado' end,coalesce(req,gen_random_uuid()));
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,coalesce(acao,'api.reservar_acesso_gerenciado'),'acesso_gerenciado',op,'negado',coalesce(req,gen_random_uuid()));
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  end if;
 end if;
 if permitido then return jsonb_build_object('ok',true,'repeticao',repeticao,'dados',resposta,'request_id',req);end if;
 return jsonb_build_object('ok',false,'erro',resposta,'request_id',req);
end $$;
alter function api.acesso_gerenciado_privado(jsonb) owner to ffcmapp_acessos_owner;
-- Depois da troca de dono, só o próprio dono revoga/concede: a membership do migrador tem inherit false.
set role ffcmapp_acessos_owner;
revoke all on function api.acesso_gerenciado_privado(jsonb) from public,anon,authenticated,service_role;
grant execute on function api.acesso_gerenciado_privado(jsonb) to authenticated;
reset role;

create function identidade.sessao_gerenciada_nativa(p_request_id uuid,p_admitir boolean) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare ctx jsonb; ator uuid:=auth_privado.uid(); sid uuid; resposta jsonb;
begin
 if p_request_id is null then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
 begin ctx:=identidade.contexto_acesso_vigente(p_admitir);exception when unique_violation then ctx:=null;end;
 begin sid:=(auth_privado.jwt()->>'session_id')::uuid;exception when invalid_text_representation then sid:=null;end;
 if exists(select 1 from public.usuario where id=ator) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,case when p_admitir then 'admitir_sessao_gerenciada' else 'consultar_sessao_gerenciada' end,'sessao',sid,case when ctx is null then 'negado' else 'permitido' end,p_request_id);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
 elsif ator is not null then
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,case when p_admitir then 'admitir_sessao_gerenciada' else 'consultar_sessao_gerenciada' end,'sessao',sid,'negado',p_request_id);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
 end if;
 if ctx is null then return null;end if;
 return jsonb_build_object('session_id',sid,'usuario',jsonb_build_object('id',ator,'perfil',ctx->>'perfil','ativo',true,'versao',(ctx->>'versao')::integer)||case when ctx->>'funcao' is not null then jsonb_build_object('funcao',ctx->>'funcao') else '{}'::jsonb end,'capacidades',case when ctx->>'perfil'='administrador' then jsonb_build_array('administrar_concessoes','administrar_cadastro','consultar_carteira_integral','consultar_auditoria') else jsonb_build_array('consultar_pacientes_vinculados') end);
end $$;
alter function identidade.sessao_gerenciada_nativa(uuid,boolean) owner to ffcmapp_acessos_owner;
-- Depois da troca de dono, só o próprio dono revoga/concede: a membership do migrador tem inherit false.
set role ffcmapp_acessos_owner;
revoke all on function identidade.sessao_gerenciada_nativa(uuid,boolean) from public,anon,authenticated,service_role;
reset role;
create function api.admitir_sessao_interna_nativa(p_request_id uuid) returns jsonb
language sql security definer set search_path='' set row_security=on as $$
 select case when exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then identidade.sessao_gerenciada_nativa(p_request_id,true) else null::jsonb end
$$;
alter function api.admitir_sessao_interna_nativa(uuid) owner to ffcmapp_acessos_owner;
-- Depois da troca de dono, só o próprio dono revoga/concede: a membership do migrador tem inherit false.
set role ffcmapp_acessos_owner;
revoke all on function api.admitir_sessao_interna_nativa(uuid) from public,anon,authenticated,service_role;
grant execute on function api.admitir_sessao_interna_nativa(uuid) to authenticated;
reset role;
create function api.confirmar_email_acesso_interno_nativo(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare ator uuid:=auth_privado.uid();sid uuid;g identidade.acesso_gerenciado;permitido boolean:=false;
begin
 if p_request_id is null then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
 begin sid:=(auth_privado.jwt()->>'session_id')::uuid;exception when invalid_text_representation then sid:=null;end;
 if ator is not null and sid is not null and bloqueios_auth.travar(ator,sid) and exists(select 1 from auth_privado.sessoes() s where s.id=sid and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
 and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='otp') then
  select * into g from identidade.acesso_gerenciado where usuario_id=ator and metodo='interno' and estado in ('aguardando_confirmacao_email','ativo') for update;
  if found and exists(select 1 from auth_privado.conta_propria() u where u.id=ator and u.email_confirmado and u.operacao_id=g.operacao_id::text and identidade.email_auth_hmac_nativo(ator)=g.email_hmac) then
   update identidade.acesso_gerenciado set estado='ativo' where operacao_id=g.operacao_id;permitido:=true;
  end if;
 end if;
 if ator is not null then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,'confirmar_email_acesso_interno','acesso_gerenciado',g.operacao_id,case when permitido then 'permitido' else 'negado' end,p_request_id);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  else insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,resultado,request_id) values(gen_random_uuid(),ator,'confirmar_email_acesso_interno','acesso_gerenciado','negado',p_request_id);if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;end if;
 end if;
 -- OTP confirma cadastro, mas NÃO insere sessão de aplicação nem admite OTP.
 if permitido then return jsonb_build_object('ok',true,'usuario_id',ator,'request_id',p_request_id);end if;
 return jsonb_build_object('ok',false,'request_id',p_request_id);
end $$;
alter function api.confirmar_email_acesso_interno_nativo(uuid) owner to ffcmapp_acessos_owner;
-- Depois da troca de dono, só o próprio dono revoga/concede: a membership do migrador tem inherit false.
set role ffcmapp_acessos_owner;
revoke all on function api.confirmar_email_acesso_interno_nativo(uuid) from public,anon,authenticated,service_role;
grant execute on function api.confirmar_email_acesso_interno_nativo(uuid) to authenticated;
reset role;

create function identidade.recusar_admissao_familiar_gerenciada(p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare ator uuid:=auth_privado.uid();begin
 if exists(select 1 from public.usuario where id=ator) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,resultado,request_id) values(gen_random_uuid(),ator,'admitir_sessao_gerenciada','sessao','negado',p_request_id);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
 elsif ator is not null then
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,resultado,request_id) values(gen_random_uuid(),ator,'admitir_sessao_gerenciada','sessao','negado',p_request_id);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
 end if;
 return null;
end $$;
alter function identidade.recusar_admissao_familiar_gerenciada(uuid) owner to ffcmapp_acessos_owner;
-- Depois da troca de dono, só o próprio dono revoga/concede: a membership do migrador tem inherit false.
set role ffcmapp_acessos_owner;
revoke all on function identidade.recusar_admissao_familiar_gerenciada(uuid) from public,anon,authenticated,service_role;
reset role;

do $$ declare p record;begin select * into p from acessos_privilegios_migracao;
 if not p.tinha_api then revoke create on schema api from ffcmapp_acessos_owner;end if;
 if not p.tinha_identidade then revoke create on schema identidade from ffcmapp_acessos_owner;end if;
 if not p.tinha_set then execute format('revoke ffcmapp_acessos_owner from %I granted by %I',p.migrador,p.migrador);end if;
end $$;

commit;
