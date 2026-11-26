-- FR-032/066: exact immutable version reads for staff case export only.
-- Defaults/family-current reads and all mutations remain unchanged. No grants to clinical data.
begin;
create function pg_temp.exportacao_leitura_versionada(p_assinatura text,p_hash text,p_hash_novo text,p_corpo text) returns void language plpgsql as $guard$
declare alvo oid:=to_regprocedure(p_assinatura);antes record;depois record;migrador text:=current_user;dono text;tinha_set boolean;tinha_create boolean;definicao text;
begin
 select p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.proargtypes,p.prorettype,r.rolname,r.rolsuper,r.rolbypassrls,r.rolcanlogin into antes from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=alvo;
 if alvo is null or md5(antes.prosrc)<>p_hash or md5(p_corpo)<>p_hash_novo or not antes.prosecdef or antes.rolsuper or antes.rolbypassrls or antes.rolcanlogin or not('search_path=""'=any(antes.proconfig)) or not('row_security=on'=any(antes.proconfig)) then raise exception 'EXPORTACAO_LEITURA_FONTE_DIVERGENTE: %',p_assinatura;end if;
 dono:=antes.rolname;tinha_set:=pg_has_role(migrador,dono,'SET');tinha_create:=has_schema_privilege(dono,'api','CREATE');
 if not tinha_set then
  if exists(select 1 from pg_auth_members where roleid=dono::regrole and member=migrador::regrole and grantor=migrador::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
  execute format('grant %I to %I with inherit false,set true granted by %I',dono,migrador,migrador);
 end if;
 if not tinha_create then execute format('grant create on schema api to %I',dono);end if;
 definicao:=pg_get_functiondef(alvo);
 if (length(definicao)-length(replace(definicao,antes.prosrc,'')))/length(antes.prosrc)<>1 then raise exception 'EXPORTACAO_LEITURA_ANCORA_DIVERGENTE';end if;
 perform set_config('role',dono,true);execute replace(definicao,antes.prosrc,p_corpo);perform set_config('role',migrador,true);
 if not tinha_create then execute format('revoke create on schema api from %I',dono);end if;
 if not tinha_set then execute format('revoke %I from %I granted by %I',dono,migrador,migrador);end if;
 select prosrc,proowner,proacl,proconfig,prosecdef,proargtypes,prorettype into depois from pg_proc where oid=alvo;
 if depois.prosrc<>p_corpo or depois.proowner<>antes.proowner or depois.proacl is distinct from antes.proacl or depois.proconfig is distinct from antes.proconfig or depois.prosecdef<>antes.prosecdef or depois.proargtypes<>antes.proargtypes or depois.prorettype<>antes.prorettype then raise exception 'EXPORTACAO_LEITURA_CONTRATO_ALTERADO';end if;
end $guard$;

-- saude; ancestor 20261117210000_saude_operacoes_privadas.sql + 251700.
select pg_temp.exportacao_leitura_versionada('api.saude_operacao_privada(jsonb)','e98a2a68aaddf4d5e6492d9cff61509b','d7e4113b74ee313a17fb27ba513a9fd3',$corpo$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; registro uuid; esperada integer; atual integer; inicio timestamptz; fim timestamptz;
 concessao uuid; perfil text; sujeito text; google record; dominio text; autorizado boolean:=false;
 acao text; resultado jsonb; envelope jsonb; anterior operacao.requisicao; repeticao boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','registro_id','versao_esperada','conteudo','aad','atestado','chave_idempotencia','digest_idempotencia','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao='api.gravar_saude' then
   registro:=(e->>'registro_id')::uuid; esperada:=(e->>'versao_esperada')::integer;
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_saude','api.gravar_saude') or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil in ('administrador','profissional') and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
       and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.ler_saude' then
  if e - array['request_id','paciente_id','atestado','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.saude_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  envelope:=e->'conteudo';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 -- Case export is staff-only; these selectors never widen current family reads.
 if e ?| array['registro_id_exportacao','versao_exportacao'] then
  if acao is distinct from 'api.ler_saude' or not(e ?& array['registro_id_exportacao','versao_exportacao'])
   or jsonb_typeof(e->'registro_id_exportacao') is distinct from 'string' or coalesce(e->>'registro_id_exportacao','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or jsonb_typeof(e->'versao_exportacao') is distinct from 'number' or coalesce(e->>'versao_exportacao','')!~'^[1-9][0-9]{0,9}$' or e ? 'autorizacao_somente'
   or not exists(select 1 from public.usuario usuario_exportacao where usuario_exportacao.id=ator and usuario_exportacao.ativo and usuario_exportacao.perfil in ('administrador','profissional')) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  if (e->>'versao_exportacao')::numeric>2147483647 then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
 end if;
 if acao='api.gravar_saude' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   select v.versao into atual from cadastro.saude_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
   if coalesce(atual,0)<>esperada then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
    if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
   end if;
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,esperada+1)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    insert into cadastro.saude_versao(id,paciente_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id)
     values(registro,paciente,esperada+1,nullif(esperada,0),envelope,ator);
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or not exists(select 1 from cadastro.saude_versao v where v.id=anterior.resultado_id and v.paciente_id=paciente and v.versao=anterior.resultado_versao) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  select jsonb_build_object('registro_id',v.id,'paciente_id',v.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado)
   into resultado from cadastro.saude_versao v where v.id=anterior.resultado_id;
 else
  select jsonb_build_object('registro_id',v.id,'paciente_id',v.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado)
   into resultado from cadastro.saude_versao v where v.paciente_id=paciente and (not(e ? 'registro_id_exportacao') or (v.id=(e->>'registro_id_exportacao')::uuid and v.versao=(e->>'versao_exportacao')::integer)) order by v.versao desc limit 1;
 end if;
 if e ? 'registro_id_exportacao' and (resultado is null or resultado='[]'::jsonb) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $corpo$);

-- contexto; ancestor 20261117310000_contexto_cuidado_operacoes_privadas.sql + 251700.
select pg_temp.exportacao_leitura_versionada('api.contexto_cuidado_operacao_privada(jsonb)','c8cf2a46a885c52da346b756088bcdb8','efcc3e79bb89b219c0c565b69324decf',$corpo$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; registro uuid; esperada integer; atual integer; inicio timestamptz; fim timestamptz;
 concessao uuid; perfil text; sujeito text; google record; dominio text; autorizado boolean:=false;
 acao text; resultado jsonb; envelope jsonb; anterior operacao.requisicao; repeticao boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','registro_id','versao_esperada','conteudo','aad','atestado','chave_idempotencia','digest_idempotencia','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao='api.gravar_contexto_cuidado' then
   registro:=(e->>'registro_id')::uuid; esperada:=(e->>'versao_esperada')::integer;
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_contexto_cuidado','api.gravar_contexto_cuidado') or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil in ('administrador','profissional') and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
       and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.ler_contexto_cuidado' then
  if e - array['request_id','paciente_id','atestado','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.contexto_cuidado_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  envelope:=e->'conteudo';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 -- Case export is staff-only; these selectors never widen current family reads.
 if e ?| array['registro_id_exportacao','versao_exportacao'] then
  if acao is distinct from 'api.ler_contexto_cuidado' or not(e ?& array['registro_id_exportacao','versao_exportacao'])
   or jsonb_typeof(e->'registro_id_exportacao') is distinct from 'string' or coalesce(e->>'registro_id_exportacao','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or jsonb_typeof(e->'versao_exportacao') is distinct from 'number' or coalesce(e->>'versao_exportacao','')!~'^[1-9][0-9]{0,9}$' or e ? 'autorizacao_somente'
   or not exists(select 1 from public.usuario usuario_exportacao where usuario_exportacao.id=ator and usuario_exportacao.ativo and usuario_exportacao.perfil in ('administrador','profissional')) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  if (e->>'versao_exportacao')::numeric>2147483647 then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
 end if;
 if acao='api.gravar_contexto_cuidado' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   select v.versao into atual from cadastro.contexto_cuidado_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
   if coalesce(atual,0)<>esperada then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
    if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
   end if;
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,esperada+1)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    insert into cadastro.contexto_cuidado_versao(id,paciente_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id)
     values(registro,paciente,esperada+1,nullif(esperada,0),envelope,ator);
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or not exists(select 1 from cadastro.contexto_cuidado_versao v where v.id=anterior.resultado_id and v.paciente_id=paciente and v.versao=anterior.resultado_versao) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  select jsonb_build_object('registro_id',v.id,'paciente_id',v.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado)
   into resultado from cadastro.contexto_cuidado_versao v where v.id=anterior.resultado_id;
 else
  select jsonb_build_object('registro_id',v.id,'paciente_id',v.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado)
   into resultado from cadastro.contexto_cuidado_versao v where v.paciente_id=paciente and (not(e ? 'registro_id_exportacao') or (v.id=(e->>'registro_id_exportacao')::uuid and v.versao=(e->>'versao_exportacao')::integer)) order by v.versao desc limit 1;
 end if;
 if e ? 'registro_id_exportacao' and (resultado is null or resultado='[]'::jsonb) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $corpo$);

-- rede; ancestor 20261117340000_rede_cuidado_operacoes_privadas.sql + 251700.
select pg_temp.exportacao_leitura_versionada('api.rede_cuidado_operacao_privada(jsonb)','f3a252e0c5e9297d0b1432b750f7dcaf','fbe468e4d5e8bf10848b0e0e4ffd6e24',$corpo$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; registro uuid; esperada integer; atual integer; inicio timestamptz; fim timestamptz;
 concessao uuid; perfil text; sujeito text; google record; dominio text; autorizado boolean:=false;
 acao text; resultado jsonb; envelope jsonb; anterior operacao.requisicao; repeticao boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','registro_id','versao_esperada','conteudo','aad','atestado','chave_idempotencia','digest_idempotencia','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao='api.gravar_rede_cuidado' then
   registro:=(e->>'registro_id')::uuid; esperada:=(e->>'versao_esperada')::integer;
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_rede_cuidado','api.gravar_rede_cuidado') or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil in ('administrador','profissional') and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
       and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.ler_rede_cuidado' then
  if e - array['request_id','paciente_id','atestado','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.rede_cuidado_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  envelope:=e->'conteudo';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 -- Case export is staff-only; these selectors never widen current family reads.
 if e ?| array['registro_id_exportacao','versao_exportacao'] then
  if acao is distinct from 'api.ler_rede_cuidado' or not(e ?& array['registro_id_exportacao','versao_exportacao'])
   or jsonb_typeof(e->'registro_id_exportacao') is distinct from 'string' or coalesce(e->>'registro_id_exportacao','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or jsonb_typeof(e->'versao_exportacao') is distinct from 'number' or coalesce(e->>'versao_exportacao','')!~'^[1-9][0-9]{0,9}$' or e ? 'autorizacao_somente'
   or not exists(select 1 from public.usuario usuario_exportacao where usuario_exportacao.id=ator and usuario_exportacao.ativo and usuario_exportacao.perfil in ('administrador','profissional')) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  if (e->>'versao_exportacao')::numeric>2147483647 then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
 end if;
 if acao='api.gravar_rede_cuidado' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   select v.versao into atual from cadastro.rede_cuidado_versao v where v.paciente_id=paciente order by v.versao desc limit 1;
   if coalesce(atual,0)<>esperada then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
    if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
   end if;
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,esperada+1)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    insert into cadastro.rede_cuidado_versao(id,paciente_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id)
     values(registro,paciente,esperada+1,nullif(esperada,0),envelope,ator);
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or not exists(select 1 from cadastro.rede_cuidado_versao v where v.id=anterior.resultado_id and v.paciente_id=paciente and v.versao=anterior.resultado_versao) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  select jsonb_build_object('registro_id',v.id,'paciente_id',v.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado)
   into resultado from cadastro.rede_cuidado_versao v where v.id=anterior.resultado_id;
 else
  select jsonb_build_object('registro_id',v.id,'paciente_id',v.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado)
   into resultado from cadastro.rede_cuidado_versao v where v.paciente_id=paciente and (not(e ? 'registro_id_exportacao') or (v.id=(e->>'registro_id_exportacao')::uuid and v.versao=(e->>'versao_exportacao')::integer)) order by v.versao desc limit 1;
 end if;
 if e ? 'registro_id_exportacao' and (resultado is null or resultado='[]'::jsonb) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $corpo$);

-- tarefa; ancestor 20261125110000_tarefa_autorizacao_somente.sql + 251700.
select pg_temp.exportacao_leitura_versionada('api.tarefa_cuidado_operacao_privada(jsonb)','0ee51c8dd494b05dbea0de989a52d8b0','8957135dd8c357590fa2632a9bfd8374',$corpo$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; tarefa uuid; registro uuid; esperada integer; atual integer; inicio timestamptz; fim timestamptz;
 concessao uuid; perfil text; sujeito text; google record; dominio text; autorizado boolean:=false;
 acao text; resultado jsonb; envelope jsonb; reserva uuid; geracao bigint; b operacao.barreira_tarefa_cuidado; reserva_atual operacao.reserva_tarefa_cuidado; anterior operacao.requisicao%rowtype; novo boolean;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','tarefa_id','registro_id','versao_esperada','conteudo','aad','atestado','chave_idempotencia','digest_idempotencia','reserva_id','geracao_reserva','autorizacao_somente','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao='api.gravar_tarefa_cuidado' then
   reserva:=(e->>'reserva_id')::uuid; geracao:=(e->>'geracao_reserva')::bigint; tarefa:=(e->>'tarefa_id')::uuid; registro:=(e->>'registro_id')::uuid; esperada:=(e->>'versao_esperada')::integer;
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if e ? 'autorizacao_somente' and (acao is distinct from 'api.ler_tarefas_cuidado' or e->'autorizacao_somente' is distinct from 'true'::jsonb) then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_tarefas_cuidado','api.gravar_tarefa_cuidado') or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil = 'profissional' and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
       and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 perform 1 from cadastro.acesso_paciente ap where ap.paciente_id=paciente and ap.usuario_id=ator and ap.revogada_em is null for share;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.ler_tarefas_cuidado' then
  if e - array['request_id','paciente_id','atestado','autorizacao_somente','registro_id_exportacao','versao_exportacao','tarefa_id'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or reserva is null or geracao is null or geracao<1 or jsonb_typeof(e->'geracao_reserva') is distinct from 'number' or coalesce(e->>'geracao_reserva','') !~ '^[1-9][0-9]*$'
   or tarefa is null or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.tarefa_cuidado_versao','paciente_id',paciente::text,'tarefa_id',tarefa::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  envelope:=e->'conteudo';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 -- Case export is staff-only; these selectors never widen current family reads.
 if e ? 'tarefa_id' and acao='api.ler_tarefas_cuidado' and not(e ? 'registro_id_exportacao') then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if e ?| array['registro_id_exportacao','versao_exportacao'] then
  if acao is distinct from 'api.ler_tarefas_cuidado' or not(e ?& array['registro_id_exportacao','versao_exportacao'])
   or jsonb_typeof(e->'registro_id_exportacao') is distinct from 'string' or coalesce(e->>'registro_id_exportacao','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or jsonb_typeof(e->'versao_exportacao') is distinct from 'number' or coalesce(e->>'versao_exportacao','')!~'^[1-9][0-9]{0,9}$' or e ? 'autorizacao_somente'
   or not exists(select 1 from public.usuario usuario_exportacao where usuario_exportacao.id=ator and usuario_exportacao.ativo and usuario_exportacao.perfil in ('administrador','profissional')) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  if (e->>'versao_exportacao')::numeric>2147483647 then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
 end if;
 if acao='api.gravar_tarefa_cuidado' then
  -- A mesma ordem da reserva: paciente antes da barreira. Ambos os caminhos
  -- mantêm o bloqueio até commit, impedindo escrita após encerramento.
  select * into b from operacao.barreira_tarefa_cuidado where ator_usuario_id=ator for update;
  select * into reserva_atual from operacao.reserva_tarefa_cuidado re where re.id=reserva and re.ator_usuario_id=ator
   and re.epoca=geracao and re.paciente_reservado_id=paciente and re.tarefa_reservada_id=tarefa
   and re.versao_esperada=esperada for update;
  if not found or b.epoca is distinct from geracao or b.reserva_atual is distinct from reserva
   or b.resultado_pendente is not null or reserva_atual.estado not in ('aberta','confirmada') then
   raise exception using errcode='42501',message='RESERVA_INVALIDA';
  end if;
  if reserva_atual.estado='confirmada' and (reserva_atual.chave_idempotencia is distinct from e->>'chave_idempotencia'
   or reserva_atual.digest_idempotencia is distinct from e->>'digest_idempotencia' or reserva_atual.tarefa_resultado_id is distinct from tarefa) then
   raise exception using errcode='42501',message='RESERVA_INVALIDA';
  end if;
  insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
   values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,esperada+1)
   on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
  novo:=found;
  if not novo then
   select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
    or anterior.resultado_versao is distinct from esperada+1
    or not exists(select 1 from cadastro.tarefa_cuidado_versao v join cadastro.tarefa_cuidado t on t.id=v.tarefa_id
      where v.id=anterior.resultado_id and v.tarefa_id=tarefa and t.paciente_id=paciente and v.versao=esperada+1) then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
   end if;
   registro:=anterior.resultado_id;
  else
  select v.versao into atual from cadastro.tarefa_cuidado_versao v where v.tarefa_id=tarefa order by v.versao desc limit 1;
  if coalesce(atual,0)<>esperada or (esperada=0 and exists(select 1 from cadastro.tarefa_cuidado o where o.id=tarefa))
   or (esperada>0 and not exists(select 1 from cadastro.tarefa_cuidado o where o.id=tarefa and o.paciente_id=paciente)) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   delete from operacao.requisicao where id=anterior.id;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
  end if;
  if esperada=0 then insert into cadastro.tarefa_cuidado(id,paciente_id) values(tarefa,paciente); end if;
  insert into cadastro.tarefa_cuidado_versao(id,tarefa_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id)
   values(registro,tarefa,esperada+1,nullif(esperada,0),envelope,ator);
  end if;
  if reserva_atual.estado='aberta' then
   update operacao.reserva_tarefa_cuidado set estado='confirmada', chave_idempotencia=e->>'chave_idempotencia',
    digest_idempotencia=e->>'digest_idempotencia', paciente_id=paciente, tarefa_resultado_id=tarefa where id=reserva;
   if not found then raise exception using errcode='P0002',message='RESERVA_NAO_CONFIRMADA'; end if;
  end if;
  select jsonb_build_object('registro_id',v.id,'tarefa_id',v.tarefa_id,'paciente_id',paciente,'versao',v.versao,'conteudo',v.conteudo_cifrado)
   into resultado from cadastro.tarefa_cuidado_versao v where v.id=registro;
 else
  if e->'autorizacao_somente'='true'::jsonb then
   -- Prova de autorização: não seleciona tarefa nem envelope clínico. A auditoria
   -- obrigatória e a revalidação final de sessão abaixo são as mesmas da listagem.
   resultado:='[]'::jsonb;
  else
  select coalesce(jsonb_agg(jsonb_build_object('registro_id',v.id,'tarefa_id',o.id,'paciente_id',o.paciente_id,'versao',v.versao,'conteudo',v.conteudo_cifrado) order by o.id),'[]'::jsonb)
   into resultado from cadastro.tarefa_cuidado o
   join lateral (select * from cadastro.tarefa_cuidado_versao x where x.tarefa_id=o.id and (not(e ? 'registro_id_exportacao') or (x.id=(e->>'registro_id_exportacao')::uuid and x.versao=(e->>'versao_exportacao')::integer)) order by x.versao desc limit 1) v on true
   where o.paciente_id=paciente and (not(e ? 'tarefa_id') or o.id=(e->>'tarefa_id')::uuid);
  end if;
 end if;
 if e ? 'registro_id_exportacao' and (resultado is null or resultado='[]'::jsonb) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req);
end $corpo$);

-- encaminhamento; ancestor 20261117110000_encaminhamento_operacoes_privadas.sql + 251700.
select pg_temp.exportacao_leitura_versionada('api.encaminhamento_operacao_privada(jsonb)','71e04a086928df0bcda9318a5005889a','8587623e87d1b4e3a9e18cc47f1c2632',$corpo$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; encaminhamento uuid; registro uuid; esperada integer; atual integer;
 inicio timestamptz; fim timestamptz; concessao uuid; perfil text; sujeito text; google record;
 dominio text; autorizado boolean:=false; acao text; resultado jsonb; envelope jsonb; etapa text;
 somente_sem_retorno boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','encaminhamento_id','registro_id','versao_esperada','etapa','conteudo','aad','apenas_sem_retorno','atestado','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao='api.gravar_encaminhamento' then
   encaminhamento:=(e->>'encaminhamento_id')::uuid; registro:=(e->>'registro_id')::uuid;
   esperada:=(e->>'versao_esperada')::integer; etapa:=e->>'etapa';
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_encaminhamentos','api.gravar_encaminhamento') or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil in ('administrador','profissional') and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
       and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found;
     end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.ler_encaminhamentos' then
  if e - array['request_id','paciente_id','apenas_sem_retorno','atestado','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb
   or (e ? 'apenas_sem_retorno' and jsonb_typeof(e->'apenas_sem_retorno') is distinct from 'boolean') then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  somente_sem_retorno:=coalesce((e->>'apenas_sem_retorno')::boolean,false);
  perform 1 from cadastro.paciente p where p.id=paciente;
 else
  if encaminhamento is null or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   or etapa is null
   or etapa not in ('sugerido','agendado','realizado','retorno_pendente','concluido')
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.encaminhamento_versao','paciente_id',paciente::text,'encaminhamento_id',encaminhamento::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  envelope:=e->'conteudo';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 -- Case export is staff-only; these selectors never widen current family reads.
 if e ?| array['registro_id_exportacao','versao_exportacao'] then
  if acao is distinct from 'api.ler_encaminhamentos' or not(e ?& array['registro_id_exportacao','versao_exportacao'])
   or jsonb_typeof(e->'registro_id_exportacao') is distinct from 'string' or coalesce(e->>'registro_id_exportacao','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or jsonb_typeof(e->'versao_exportacao') is distinct from 'number' or coalesce(e->>'versao_exportacao','')!~'^[1-9][0-9]{0,9}$' or e ? 'autorizacao_somente'
   or not exists(select 1 from public.usuario usuario_exportacao where usuario_exportacao.id=ator and usuario_exportacao.ativo and usuario_exportacao.perfil in ('administrador','profissional')) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  if (e->>'versao_exportacao')::numeric>2147483647 then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
 end if;
 if acao='api.gravar_encaminhamento' then
  select v.versao into atual from cadastro.encaminhamento_versao v where v.encaminhamento_id=encaminhamento order by v.versao desc limit 1;
  if coalesce(atual,0)<>esperada or (esperada=0 and exists(select 1 from cadastro.encaminhamento o where o.id=encaminhamento))
   or (esperada>0 and not exists(select 1 from cadastro.encaminhamento o where o.id=encaminhamento and o.paciente_id=paciente)) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
  end if;
  if esperada=0 then insert into cadastro.encaminhamento(id,paciente_id) values(encaminhamento,paciente); end if;
  insert into cadastro.encaminhamento_versao(id,encaminhamento_id,versao,versao_esperada,etapa,conteudo_cifrado,criado_por_usuario_id)
   values(registro,encaminhamento,esperada+1,nullif(esperada,0),etapa,envelope,ator);
  select jsonb_build_object('registro_id',v.id,'encaminhamento_id',v.encaminhamento_id,'paciente_id',paciente,'versao',v.versao,'etapa',v.etapa,'conteudo',v.conteudo_cifrado)
   into resultado from cadastro.encaminhamento_versao v where v.id=registro;
 else
  -- Localizar encaminhamentos sem retorno é consulta do banco, não filtro de cliente:
  -- a etapa em claro permite restringir sem decifrar conteúdo.
  select coalesce(jsonb_agg(jsonb_build_object('registro_id',v.id,'encaminhamento_id',o.id,'paciente_id',o.paciente_id,'versao',v.versao,'etapa',v.etapa,'conteudo',v.conteudo_cifrado) order by o.id),'[]'::jsonb)
   into resultado from cadastro.encaminhamento o
   join lateral (select * from cadastro.encaminhamento_versao x where x.encaminhamento_id=o.id and (not(e ? 'registro_id_exportacao') or (x.id=(e->>'registro_id_exportacao')::uuid and x.versao=(e->>'versao_exportacao')::integer)) order by x.versao desc limit 1) v on true
   where o.paciente_id=paciente and (somente_sem_retorno is not true or v.etapa='retorno_pendente');
 end if;
 if e ? 'registro_id_exportacao' and (resultado is null or resultado='[]'::jsonb) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req);
end $corpo$);

-- orientacao; ancestor 20261124140000_orientacao_familia_privada.sql + 251700.
select pg_temp.exportacao_leitura_versionada('api.orientacao_operacao_privada(jsonb)','f685b39324cfab24dd3edee89c5d523a','b6b01407ddfcfb2a90288f9930ba3063',$corpo$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; orientacao uuid; registro uuid; esperada integer; atual integer;
 inicio timestamptz; fim timestamptz; concessao uuid; perfil text; sujeito text; google record;
 dominio text; autorizado boolean:=false; acao text; resultado jsonb; envelope jsonb; situacao text;
 somente_vigentes boolean:=false; papel text; visibilidade text;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','orientacao_id','registro_id','versao_esperada','situacao','conteudo','aad','apenas_vigentes','visibilidade','atestado','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao='api.gravar_orientacao' then
   orientacao:=(e->>'orientacao_id')::uuid; registro:=(e->>'registro_id')::uuid;
   esperada:=(e->>'versao_esperada')::integer; situacao:=e->>'situacao';
   -- Campo aditivo: quem grava sem informar (chamadores existentes) preserva o comportamento
   -- anterior à coluna existir — orientação nasce 'interna', família não ganha acesso de graça.
   visibilidade:=coalesce(e->>'visibilidade','interna');
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_orientacoes','api.gravar_orientacao') or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
   papel:='colaborador';
  end if;
 end;
 if not autorizado and (not identidade.cadastro_gerenciado_proprio(false) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia') is true) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil in ('administrador','profissional') and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
       and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found; if autorizado then papel:='colaborador'; end if;
     end if;
    end if;
   end if;
  end if;
 end if;
 -- Trilha familiar: só para a leitura da lista (`api.ler_orientacoes`). Gravação continua
 -- exclusiva do colaborador por construção — esta condição nunca deixa a família alcançar o
 -- outro ramo, então a validação de `gravar` não repete o gate de papel.
 if not autorizado and acao='api.ler_orientacoes'
  and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo'))
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
    if found then
     perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
     if found then autorizado:=true; papel:='familia'; end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.ler_orientacoes' then
  if e - array['request_id','paciente_id','apenas_vigentes','atestado','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb
   or (e ? 'apenas_vigentes' and jsonb_typeof(e->'apenas_vigentes') is distinct from 'boolean') then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  somente_vigentes:=coalesce((e->>'apenas_vigentes')::boolean,false);
  perform 1 from cadastro.paciente p where p.id=paciente;
 else
  if orientacao is null or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   or situacao is null
   or situacao not in ('vigente','superada')
   or visibilidade not in ('interna','publica')
   -- FR-019: orientação nasce vigente; superada é sempre revisão de algo que já existia.
   or (esperada=0 and situacao<>'vigente')
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.orientacao_versao','paciente_id',paciente::text,'orientacao_id',orientacao::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  envelope:=e->'conteudo';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 -- Case export is staff-only; these selectors never widen current family reads.
 if e ?| array['registro_id_exportacao','versao_exportacao'] then
  if acao is distinct from 'api.ler_orientacoes' or not(e ?& array['registro_id_exportacao','versao_exportacao'])
   or jsonb_typeof(e->'registro_id_exportacao') is distinct from 'string' or coalesce(e->>'registro_id_exportacao','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or jsonb_typeof(e->'versao_exportacao') is distinct from 'number' or coalesce(e->>'versao_exportacao','')!~'^[1-9][0-9]{0,9}$' or e ? 'autorizacao_somente'
   or not exists(select 1 from public.usuario usuario_exportacao where usuario_exportacao.id=ator and usuario_exportacao.ativo and usuario_exportacao.perfil in ('administrador','profissional')) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  if (e->>'versao_exportacao')::numeric>2147483647 then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
 end if;
 if acao='api.gravar_orientacao' then
  select v.versao into atual from cadastro.orientacao_versao v where v.orientacao_id=orientacao order by v.versao desc limit 1;
  if coalesce(atual,0)<>esperada or (esperada=0 and exists(select 1 from cadastro.orientacao o where o.id=orientacao))
   or (esperada>0 and not exists(select 1 from cadastro.orientacao o where o.id=orientacao and o.paciente_id=paciente)) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
  end if;
  if esperada=0 then insert into cadastro.orientacao(id,paciente_id) values(orientacao,paciente); end if;
  insert into cadastro.orientacao_versao(id,orientacao_id,versao,versao_esperada,situacao,conteudo_cifrado,criado_por_usuario_id,visibilidade)
   values(registro,orientacao,esperada+1,nullif(esperada,0),situacao,envelope,ator,visibilidade);
  select jsonb_build_object('registro_id',v.id,'orientacao_id',v.orientacao_id,'paciente_id',paciente,'versao',v.versao,'situacao',v.situacao,'visibilidade',v.visibilidade,'conteudo',v.conteudo_cifrado,'criado_em',v.criado_em)
   into resultado from cadastro.orientacao_versao v where v.id=registro;
 else
  -- FR-019 exige que a superada continue identificada como anterior: a situação em claro
  -- resolve isso no banco, sem o cliente ter de decifrar para saber o que ainda vale. Família
  -- só enxerga a última versão marcada 'publica' — mesmo padrão de `plano_cuidado_operacao_privada`
  -- (filtro no agregado de saída, não na fonte, para não mudar a semântica de `apenas_vigentes`).
  select coalesce(jsonb_agg(jsonb_build_object('registro_id',v.id,'orientacao_id',o.id,'paciente_id',o.paciente_id,'versao',v.versao,'situacao',v.situacao,'visibilidade',v.visibilidade,'conteudo',v.conteudo_cifrado,'criado_em',v.criado_em) order by v.criado_em, o.id)
    filter (where papel='colaborador' or v.visibilidade='publica'),'[]'::jsonb)
   into resultado from cadastro.orientacao o
   join lateral (select * from cadastro.orientacao_versao x where x.orientacao_id=o.id and (not(e ? 'registro_id_exportacao') or (x.id=(e->>'registro_id_exportacao')::uuid and x.versao=(e->>'versao_exportacao')::integer)) order by x.versao desc limit 1) v on true
   where o.paciente_id=paciente and (somente_vigentes is not true or v.situacao='vigente');
 end if;
 if e ? 'registro_id_exportacao' and (resultado is null or resultado='[]'::jsonb) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req);
end $corpo$);

-- documento; ancestor 20261125090000_documento_entrega_privada.sql + 251700 + 251800.
select pg_temp.exportacao_leitura_versionada('api.documento_operacao_privada(jsonb)','32a1ca75c3fc92b68939991f08e3e05c','022f2c9bc250c1af769e1a32bb7bbe64',$corpo$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; documento uuid; registro uuid; esperada integer; atual integer; inicio timestamptz; fim timestamptz;
 concessao uuid; perfil text; sujeito text; google record; dominio text; autorizado boolean:=false;
 acao text; resultado jsonb; envelope jsonb; anterior operacao.requisicao; repeticao boolean:=false;
 dono uuid; papel text;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','documento_id','registro_id','versao_esperada','categoria','origem','data_documento','audiencia','estado','conteudo','aad','atestado','chave_idempotencia','digest_idempotencia','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao='api.ler_documentos' and e ? 'documento_id' then documento:=(e->>'documento_id')::uuid; end if;
  if acao='api.gravar_documento' then
   documento:=(e->>'documento_id')::uuid; registro:=(e->>'registro_id')::uuid;
   esperada:=(e->>'versao_esperada')::integer;
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_documentos','api.gravar_documento') or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
   papel:='colaborador';
  end if;
 end;
 if not autorizado and (not identidade.cadastro_gerenciado_proprio(false) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia') is true) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil in ('administrador','profissional') and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
       and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found; if autorizado then papel:='colaborador'; end if;
     end if;
    end if;
   end if;
  end if;
 end if;
 -- Trilha familiar: só para a leitura da lista (`api.ler_documentos`). Gravação continua
 -- exclusiva do colaborador por construção — esta condição nunca deixa a família alcançar o
 -- outro ramo, então a validação de `gravar` não repete o gate de papel.
 if not autorizado and acao='api.ler_documentos'
  and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo'))
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
    if found then
     perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
     if found then autorizado:=true; papel:='familia'; end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu


 -- A função de conta não concede carteira. O vínculo ativo do profissional é distinto.
 if autorizado and papel='colaborador' and perfil='profissional' then
  perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator
   and ap.paciente_id=paciente and ap.revogada_em is null for share;
  autorizado:=found;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,case when acao='api.ler_documentos' and documento is not null then 'documento' else 'paciente' end,case when acao='api.ler_documentos' and documento is not null then documento else paciente end,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,case when acao='api.ler_documentos' and documento is not null then 'documento' else 'paciente' end,case when acao='api.ler_documentos' and documento is not null then documento else paciente end,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.ler_documentos' then
  if e - array['request_id','paciente_id','documento_id','atestado','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb
   or (e ? 'documento_id' and documento is null) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or documento is null or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   -- Classificação e audiência são obrigatórias ANTES de concluir (FR-030). O banco recusa o
   -- anexo sem elas: a interface pode esquecer de pedir, a regra não pode depender disso.
   or jsonb_typeof(e->'categoria') is distinct from 'string'
   or length(btrim(e->>'categoria')) not between 1 and 120
   or (e->'origem' is not null and e->'origem' <> 'null'::jsonb
       and (jsonb_typeof(e->'origem') is distinct from 'string' or length(btrim(e->>'origem')) not between 1 and 120))
   or (e->'data_documento' is not null and e->'data_documento' <> 'null'::jsonb
       and (jsonb_typeof(e->'data_documento') is distinct from 'string'
            or coalesce(e->>'data_documento','') !~ '^\d{4}-\d{2}-\d{2}$'))
   or jsonb_typeof(e->'audiencia') is distinct from 'string'
   or e->>'audiencia' not in ('equipe','equipe_e_familia')
   or jsonb_typeof(e->'estado') is distinct from 'string'
   or e->>'estado' not in ('disponivel','indisponivel','removido')
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.documento_caso_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  envelope:=e->'conteudo';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,case when acao='api.ler_documentos' and documento is not null then 'documento' else 'paciente' end,case when acao='api.ler_documentos' and documento is not null then documento else paciente end,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 -- Case export is staff-only; these selectors never widen current family reads.
 if e ?| array['registro_id_exportacao','versao_exportacao'] then
  if acao is distinct from 'api.ler_documentos' or not(e ?& array['registro_id_exportacao','versao_exportacao'])
   or jsonb_typeof(e->'registro_id_exportacao') is distinct from 'string' or coalesce(e->>'registro_id_exportacao','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or jsonb_typeof(e->'versao_exportacao') is distinct from 'number' or coalesce(e->>'versao_exportacao','')!~'^[1-9][0-9]{0,9}$' or e ? 'autorizacao_somente'
   or not exists(select 1 from public.usuario usuario_exportacao where usuario_exportacao.id=ator and usuario_exportacao.ativo and usuario_exportacao.perfil in ('administrador','profissional')) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  if (e->>'versao_exportacao')::numeric>2147483647 then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
 end if;
 if acao='api.gravar_documento' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   select d.paciente_id into dono from cadastro.documento_caso d where d.id=documento for share;
   if esperada=0 then
    if found then
     insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
      values(gen_random_uuid(),ator,acao,case when acao='api.ler_documentos' and documento is not null then 'documento' else 'paciente' end,case when acao='api.ler_documentos' and documento is not null then documento else paciente end,'negado',req);
     if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
     return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
    end if;
   elsif not found or dono is distinct from paciente then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,case when acao='api.ler_documentos' and documento is not null then 'documento' else 'paciente' end,case when acao='api.ler_documentos' and documento is not null then documento else paciente end,'negado',req);
    if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
   end if;
   select v.versao into atual from cadastro.documento_caso_versao v where v.documento_id=documento order by v.versao desc limit 1;
   if coalesce(atual,0)<>esperada then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,case when acao='api.ler_documentos' and documento is not null then 'documento' else 'paciente' end,case when acao='api.ler_documentos' and documento is not null then documento else paciente end,'negado',req);
    if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
   end if;
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,esperada+1)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    if esperada=0 then
     insert into cadastro.documento_caso(id,paciente_id,criado_por_usuario_id)
      values(documento,paciente,ator);
    end if;
    insert into cadastro.documento_caso_versao(
      id,documento_id,paciente_id,versao,versao_esperada,categoria,origem,data_documento,
      audiencia,estado,conteudo_cifrado,criado_por_usuario_id)
     values(
      registro,documento,paciente,esperada+1,nullif(esperada,0),btrim(e->>'categoria'),
      nullif(btrim(coalesce(e->>'origem','')),''),(nullif(e->>'data_documento',''))::date,
      e->>'audiencia',e->>'estado',envelope,ator);
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or not exists(select 1 from cadastro.documento_caso_versao v where v.id=anterior.resultado_id and v.paciente_id=paciente and v.versao=anterior.resultado_versao) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,case when acao='api.ler_documentos' and documento is not null then 'documento' else 'paciente' end,case when acao='api.ler_documentos' and documento is not null then documento else paciente end,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
 end if;
 -- Tanto ler quanto gravar devolvem a relação atual. `removido` sai da relação; `indisponivel`
 -- PERMANECE (FR-029). Família só enxerga documentos cuja ÚLTIMA versão está em
 -- `equipe_e_familia` — a mesma troca de audiência que o colaborador já pode fazer a qualquer
 -- momento (nova versão de metadado) já tira ou devolve a visibilidade da família sem precisar
 -- de nenhum mecanismo adicional.
 select coalesce(jsonb_agg(d order by d.data_documento desc nulls last, d.criado_em desc)
   filter (where papel='colaborador' or d.audiencia='equipe_e_familia'),'[]'::jsonb)
  into resultado
  from (
   select distinct on (v.documento_id)
     v.documento_id, v.id as registro_id, v.paciente_id, v.versao, v.categoria, v.origem,
     v.data_documento, v.audiencia, v.estado, v.conteudo_cifrado as conteudo,
     v.criado_por_usuario_id, v.criado_em
    from cadastro.documento_caso_versao v
    where v.paciente_id=paciente and (not(e ? 'registro_id_exportacao') or (v.id=(e->>'registro_id_exportacao')::uuid and v.versao=(e->>'versao_exportacao')::integer))
    order by v.documento_id, v.versao desc
  ) d
  where d.estado <> 'removido'
   and (acao <> 'api.ler_documentos' or documento is null
     or (d.documento_id=documento and d.estado='disponivel'));
 if acao='api.ler_documentos' and documento is not null and jsonb_array_length(resultado)=0 then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'documento',documento,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if e ? 'registro_id_exportacao' and (resultado is null or resultado='[]'::jsonb) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,case when acao='api.ler_documentos' and documento is not null then 'documento' else 'paciente' end,case when acao='api.ler_documentos' and documento is not null then documento else paciente end,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',jsonb_build_object('documentos',resultado),'request_id',req,'repeticao',repeticao);
end $corpo$);

-- Plano: 241100 + 251700 + 251900, preserving current approval projection.
select pg_temp.exportacao_leitura_versionada('api.plano_cuidado_operacao_privada(jsonb)','8c7f12fb01a8ff10173dbd7277eb04e0','299e9bff61bfd9bfcf44055b9c42713f',$corpo$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; objetivo uuid; registro uuid; esperada integer; atual integer; inicio timestamptz; fim timestamptz;
 concessao uuid; perfil text; sujeito text; google record; dominio text; autorizado boolean:=false;
 acao text; resultado jsonb; envelope jsonb; anterior operacao.requisicao; repeticao boolean:=false;
 reserva uuid; epoca bigint; b operacao.barreira_plano; reserva_linha operacao.reserva_plano;
 cursor_objetivo uuid; cursor_versao integer; limite integer; proximo jsonb;
 papel text; visibilidade text;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','objetivo_id','registro_id','versao_esperada','conteudo','aad','atestado','chave_idempotencia','digest_idempotencia','reserva_id','geracao_reserva','cursor','limite','visibilidade','campos_extras_catalogo','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao in ('api.gravar_objetivo_cuidado','api.ler_historico_objetivo_cuidado') then
   objetivo:=(e->>'objetivo_id')::uuid;
  end if;
  if acao in ('api.ler_plano_cuidado','api.ler_historico_objetivo_cuidado') then
   limite:=(e->>'limite')::integer;
   if acao='api.ler_plano_cuidado' then cursor_objetivo:=(e->>'cursor')::uuid;
   else cursor_versao:=(e->>'cursor')::integer; end if;
  end if;
  if acao='api.gravar_objetivo_cuidado' then
   objetivo:=(e->>'objetivo_id')::uuid; registro:=(e->>'registro_id')::uuid; esperada:=(e->>'versao_esperada')::integer;
   reserva:=(e->>'reserva_id')::uuid; epoca:=(e->>'geracao_reserva')::bigint;
   -- Campo aditivo: quem grava sem informar (chamadores existentes) preserva o comportamento
   -- anterior à coluna existir — objetivo nasce 'interna', família não ganha acesso de graça.
   visibilidade:=coalesce(e->>'visibilidade','interna');
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_plano_cuidado','api.ler_historico_objetivo_cuidado','api.gravar_objetivo_cuidado') or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
   papel:='colaborador';
  end if;
 end;
 if not autorizado and (not identidade.cadastro_gerenciado_proprio(false) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia') is true) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil in ('administrador','profissional') and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
       and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      autorizado:=found; if autorizado then papel:='colaborador'; end if;
     end if;
    end if;
   end if;
  end if;
 end if;
 -- Trilha familiar: só para a leitura da lista (`api.ler_plano_cuidado`). Histórico e gravação
 -- continuam exclusivos do colaborador por construção — esta condição nunca deixa a família
 -- alcançar os outros dois ramos, então a validação de `gravar` não repete o gate de papel.
 if not autorizado and acao='api.ler_plano_cuidado'
  and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo'))
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
    if found then
     perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
     if found then autorizado:=true; papel:='familia'; end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao in ('api.ler_plano_cuidado','api.ler_historico_objetivo_cuidado') and
  (jsonb_typeof(e->'limite') is distinct from 'number' or coalesce(e->>'limite','') !~ '^(?:[1-9]|1[0-9]|20)$'
   or limite not between 1 and 20 or not (e ? 'cursor')
   or (e->'cursor' <> 'null'::jsonb and ((acao='api.ler_plano_cuidado' and jsonb_typeof(e->'cursor') is distinct from 'string')
    or (acao='api.ler_historico_objetivo_cuidado' and (jsonb_typeof(e->'cursor') is distinct from 'number' or coalesce(e->>'cursor','') !~ '^[1-9][0-9]*$' or cursor_versao < 1))))) then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if acao='api.ler_plano_cuidado' then
  if e - array['request_id','paciente_id','atestado','cursor','limite','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 elsif acao='api.ler_historico_objetivo_cuidado' then
  if objetivo is null or e - array['request_id','paciente_id','objetivo_id','atestado','cursor','limite'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.objetivo_cuidado o where o.id=objetivo and o.paciente_id=paciente;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or objetivo is null or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   or visibilidade not in ('interna','publica')
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.objetivo_cuidado_versao','paciente_id',paciente::text,'objetivo_id',objetivo::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  envelope:=e->'conteudo';
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao='api.gravar_objetivo_cuidado' and esperada=0 then
  select * into b from operacao.barreira_plano where ator_usuario_id=ator for update;
  select rp.* into reserva_linha from operacao.reserva_plano rp where rp.id=reserva and rp.ator_usuario_id=ator and rp.epoca=epoca for update;
  if reserva is null or epoca is null or b.epoca is distinct from epoca or b.reserva_atual is distinct from reserva
   or b.resultado_pendente is not null or reserva_linha.id is null or reserva_linha.paciente_reservado_id is distinct from paciente
   or reserva_linha.estado not in ('aberta','confirmada') then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
  end if;
  if reserva_linha.estado='confirmada' and (reserva_linha.chave_idempotencia is distinct from e->>'chave_idempotencia'
   or reserva_linha.digest_idempotencia is distinct from e->>'digest_idempotencia' or reserva_linha.objetivo_id is distinct from objetivo) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
 elsif acao='api.gravar_objetivo_cuidado' and (reserva is not null or epoca is not null) then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- Exact case-export reads retain this domain's native authority and audit.
 if e ?| array['registro_id_exportacao','versao_exportacao'] then
  if acao is distinct from 'api.ler_plano_cuidado' or not(e ?& array['registro_id_exportacao','versao_exportacao'])
   or jsonb_typeof(e->'registro_id_exportacao') is distinct from 'string' or coalesce(e->>'registro_id_exportacao','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or jsonb_typeof(e->'versao_exportacao') is distinct from 'number' or coalesce(e->>'versao_exportacao','')!~'^[1-9][0-9]{0,9}$'
   or not exists(select 1 from public.usuario usuario_exportacao where usuario_exportacao.id=ator and usuario_exportacao.ativo and usuario_exportacao.perfil in ('administrador','profissional')) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  if (e->>'versao_exportacao')::numeric>2147483647 then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('registro_id',v.id,'objetivo_id',v.objetivo_id,'paciente_id',paciente,'versao',v.versao,'conteudo',v.conteudo_cifrado,'visibilidade',v.visibilidade,'aprovacoes',(select coalesce(jsonb_agg(jsonb_build_object('registro_id',ap.registro_id,'aprovador_usuario_id',ap.aprovador_usuario_id,'aprovado_em',ap.aprovado_em) order by ap.aprovado_em),'[]'::jsonb) from cadastro.objetivo_cuidado_aprovacao ap where ap.registro_id=v.id))),'[]'::jsonb),'proximo_cursor',null) into resultado
   from cadastro.objetivo_cuidado o join cadastro.objetivo_cuidado_versao v on v.objetivo_id=o.id where o.paciente_id=paciente and v.id=(e->>'registro_id_exportacao')::uuid and v.versao=(e->>'versao_exportacao')::integer;
  if jsonb_array_length(resultado->'itens')=0 then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() sessao_exportacao where sessao_exportacao.id=sessao and sessao_exportacao.user_id=ator and (sessao_exportacao.not_after is null or sessao_exportacao.not_after>clock_timestamp())) then raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';end if;
  return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',false);
 end if;
 if acao='api.gravar_objetivo_cuidado' then
  declare campo_extra record; versao_catalogo integer; begin
    if e ? 'campos_extras_catalogo' then
      if jsonb_typeof(e->'campos_extras_catalogo') is distinct from 'object' then
        raise exception using errcode='22023', message='ENTRADA_INVALIDA';
      end if;
      for campo_extra in select key, value from jsonb_each(e->'campos_extras_catalogo') order by key loop
        if campo_extra.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or jsonb_typeof(campo_extra.value) is distinct from 'number'
          or (campo_extra.value #>> '{}') !~ '^[1-9][0-9]{0,9}$' then
          raise exception using errcode='22023', message='ENTRADA_INVALIDA';
        end if;
        select c.versao into versao_catalogo from cadastro.campo_extra_plano_catalogo c
          where c.id=campo_extra.key::uuid and c.ativo for share;
        if not found or versao_catalogo::text is distinct from (campo_extra.value #>> '{}') then
          insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
            values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
          if not found then raise exception using errcode='P0002', message='AUDITORIA_NAO_INSERIDA'; end if;
          return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
        end if;
      end loop;
    end if;
  end;
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   select v.versao into atual from cadastro.objetivo_cuidado_versao v where v.objetivo_id=objetivo order by v.versao desc limit 1;
   if coalesce(atual,0)<>esperada or (esperada=0 and exists(select 1 from cadastro.objetivo_cuidado o where o.id=objetivo))
    or (esperada>0 and not exists(select 1 from cadastro.objetivo_cuidado o where o.id=objetivo and o.paciente_id=paciente)) then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
   end if;
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,esperada+1)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    if esperada=0 then
     insert into cadastro.objetivo_cuidado(id,paciente_id) values(objetivo,paciente);
     update operacao.reserva_plano set estado='confirmada',paciente_id=paciente,objetivo_id=objetivo,
      chave_idempotencia=e->>'chave_idempotencia',digest_idempotencia=e->>'digest_idempotencia' where id=reserva;
    end if;
    insert into cadastro.objetivo_cuidado_versao(id,objetivo_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id,visibilidade)
     values(registro,objetivo,esperada+1,nullif(esperada,0),envelope,ator,visibilidade);
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if (repeticao and esperada=0 and reserva_linha.estado <> 'confirmada')
   or anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or not exists(select 1 from cadastro.objetivo_cuidado_versao v join cadastro.objetivo_cuidado o on o.id=v.objetivo_id
    where v.id=anterior.resultado_id and o.paciente_id=paciente and v.versao=anterior.resultado_versao) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  select jsonb_build_object('registro_id',v.id,'objetivo_id',v.objetivo_id,'paciente_id',paciente,'versao',v.versao,'conteudo',v.conteudo_cifrado,'visibilidade',v.visibilidade,'aprovacoes',(select coalesce(jsonb_agg(jsonb_build_object('registro_id',ap.registro_id,'aprovador_usuario_id',ap.aprovador_usuario_id,'aprovado_em',ap.aprovado_em) order by ap.aprovado_em),'[]'::jsonb) from cadastro.objetivo_cuidado_aprovacao ap where ap.registro_id=v.id))
   into resultado from cadastro.objetivo_cuidado_versao v where v.id=anterior.resultado_id;
 elsif acao='api.ler_historico_objetivo_cuidado' then
  with pagina as materialized (
   select v.* from cadastro.objetivo_cuidado_versao v
   where v.objetivo_id=objetivo and (cursor_versao is null or v.versao>cursor_versao)
   order by v.versao limit limite+1
  ), itens as (select * from pagina order by versao limit limite)
  select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('registro_id',v.id,'objetivo_id',objetivo,'paciente_id',paciente,'versao',v.versao,'conteudo',v.conteudo_cifrado,'visibilidade',v.visibilidade,'aprovacoes',(select coalesce(jsonb_agg(jsonb_build_object('registro_id',ap.registro_id,'aprovador_usuario_id',ap.aprovador_usuario_id,'aprovado_em',ap.aprovado_em) order by ap.aprovado_em),'[]'::jsonb) from cadastro.objetivo_cuidado_aprovacao ap where ap.registro_id=v.id)) order by v.versao),'[]'::jsonb),
   'proximo_cursor',case when (select count(*) from pagina)>limite then to_jsonb(max(v.versao)) else 'null'::jsonb end)
   into resultado from itens v;
 else
  with pagina as materialized (
   select o.id from cadastro.objetivo_cuidado o
   left join lateral (select x.visibilidade from cadastro.objetivo_cuidado_versao x where x.objetivo_id=o.id order by x.versao desc limit 1) ultima on true
   where o.paciente_id=paciente and (cursor_objetivo is null or o.id>cursor_objetivo)
    and (papel='colaborador' or ultima.visibilidade='publica')
   order by o.id limit limite+1
  ), itens as (select * from pagina order by id limit limite)
  select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('registro_id',v.id,'objetivo_id',o.id,'paciente_id',paciente,'versao',v.versao,'conteudo',v.conteudo_cifrado,'visibilidade',v.visibilidade,'aprovacoes',(select coalesce(jsonb_agg(jsonb_build_object('registro_id',ap.registro_id,'aprovador_usuario_id',ap.aprovador_usuario_id,'aprovado_em',ap.aprovado_em) order by ap.aprovado_em),'[]'::jsonb) from cadastro.objetivo_cuidado_aprovacao ap where ap.registro_id=v.id)) order by o.id) filter (where papel='colaborador' or v.visibilidade='publica'),'[]'::jsonb),
   'proximo_cursor',case when (select count(*) from pagina)>limite then to_jsonb((array_agg(o.id order by o.id desc))[1]) else 'null'::jsonb end)
   into resultado from itens o
   join lateral (select * from cadastro.objetivo_cuidado_versao x where x.objetivo_id=o.id order by x.versao desc limit 1) v on true;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $corpo$);

-- diario; ancestor 20261120360000 + 251700. Native current read remains latest-only.
select pg_temp.exportacao_leitura_versionada('api.diario_operacao_privada(jsonb)','cf2b4a45adfb6f9aca32adae392e2c6b','8c00005ac10203a5bc71d24e3c80fc06',$corpo$
#variable_conflict use_variable
declare
 acontecimento date; rotulo_area text;
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; diario uuid; registro uuid; esperada integer; atual integer; anterior_estado text;
 inicio timestamptz; fim timestamptz; concessao uuid; perfil text; sujeito text; google record;
 dominio text; autorizado boolean:=false; papel text; acao text; resultado jsonb;
 envelope jsonb; justificativa jsonb; tipo text; estado text; audiencia text; origem text;
 responde uuid; tarefa uuid; atencao boolean; retorno boolean; autor_registro uuid;
 tipo_respondido text; anterior operacao.requisicao; repeticao boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','diario_registro_id','registro_id','versao_esperada','tipo','estado','audiencia','atencao','retorno_solicitado','origem_conteudo','responde_registro_id','tarefa_id','conteudo','justificativa','aad','aad_justificativa','aconteceu_em','area','chave_idempotencia','digest_idempotencia','atestado','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao='api.gravar_diario' then
   diario:=(e->>'diario_registro_id')::uuid; registro:=(e->>'registro_id')::uuid;
   esperada:=(e->>'versao_esperada')::integer; responde:=(e->>'responde_registro_id')::uuid;
   tarefa:=(e->>'tarefa_id')::uuid;
   tipo:=e->>'tipo'; estado:=e->>'estado'; audiencia:=e->>'audiencia'; origem:=e->>'origem_conteudo';
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao not in ('api.ler_diario','api.gravar_diario') or acao is null
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- Trilha colaborador: Google Workspace, como em anamnese, saúde e encaminhamento.
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
   papel:='colaborador';
  end if;
 end;
 if not autorizado and (not identidade.cadastro_gerenciado_proprio(false) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia') is true) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
 if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='oauth') then
  select i.provider_id,i.identity_data into google from auth_privado.identidades() i where i.user_id=ator and i.provider='google'
   and bloqueios_auth.travar(ator,sessao)
   and exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=ator and j.provider='google')=1;
  if google.identity_data->>'sub'=google.provider_id and google.identity_data->>'email_verified'='true'
    and google.identity_data#>>'{custom_claims,hd}'=dominio then
   select c.id,c.perfil,c.subject_google into concessao,perfil,sujeito from identidade.concessao_equipe c
    where c.usuario_id=ator and c.estado='vinculada' and c.metodo='google_workspace' for share;
   if found and perfil in ('administrador','profissional') and sujeito=google.provider_id then
    perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil=perfil for share;
    if found then
     perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.concessao_id=concessao
       and s.metodo='google_workspace' and s.revogada_em is null and s.encerrada_em is null for share;
     if found then
      perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
      if found then autorizado:=true; papel:='colaborador'; end if;
     end if;
    end if;
   end if;
  end if;
 end if;
 -- Trilha familiar: mesma prova de `api.consultar_paciente_familiar_privado`. Exige acesso
 -- vigente ao paciente deste pedido — vínculo com outro paciente não serve.
 if not autorizado
  and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo'))
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
    if found then
     perform 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp());
     if found then autorizado:=true; papel:='familia'; end if;
    end if;
   end if;
  end if;
 end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  else
   insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  end if;
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 -- Case export is staff-only; these selectors never widen current family reads.
 if e ?| array['registro_id_exportacao','versao_exportacao'] then
  if acao is distinct from 'api.ler_diario' or not(e ?& array['registro_id_exportacao','versao_exportacao'])
   or jsonb_typeof(e->'registro_id_exportacao') is distinct from 'string' or coalesce(e->>'registro_id_exportacao','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or jsonb_typeof(e->'versao_exportacao') is distinct from 'number' or coalesce(e->>'versao_exportacao','')!~'^[1-9][0-9]{0,9}$' or e ? 'autorizacao_somente'
   or not exists(select 1 from public.usuario usuario_exportacao where usuario_exportacao.id=ator and usuario_exportacao.ativo and usuario_exportacao.perfil in ('administrador','profissional')) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  if (e->>'versao_exportacao')::numeric>2147483647 then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
 end if;
 if acao='api.ler_diario' then
  if e - array['request_id','paciente_id','atestado','registro_id_exportacao','versao_exportacao'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or diario is null or registro is null or esperada is null or esperada<0 or esperada=2147483647
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
   or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
   or tipo not in ('relato_familiar','evolucao_profissional')
   or estado not in ('rascunho','publicado','retificado')
   or audiencia not in ('equipe','equipe_e_familia')
   or origem not in ('texto','audio_transcrito')
   or jsonb_typeof(e->'atencao') is distinct from 'boolean'
   or jsonb_typeof(e->'retorno_solicitado') is distinct from 'boolean'
   or (e ? 'responde_registro_id' and jsonb_typeof(e->'responde_registro_id') not in ('string','null'))
   or (e ? 'tarefa_id' and jsonb_typeof(e->'tarefa_id') not in ('string','null'))
   or (estado='retificado') is distinct from coalesce(jsonb_typeof(e->'justificativa')='object',false)
   or e->'aad' is distinct from jsonb_build_object('tabela','cadastro.diario_registro_versao','paciente_id',paciente::text,'diario_registro_id',diario::text,'registro_id',registro::text,'versao',esperada+1,'campo','conteudo','formato',1)
   or (estado='retificado' and e->'aad_justificativa' is distinct from jsonb_build_object('tabela','cadastro.diario_registro_versao','paciente_id',paciente::text,'diario_registro_id',diario::text,'registro_id',registro::text,'versao',esperada+1,'campo','justificativa','formato',1))
   or (estado<>'retificado' and e ? 'aad_justificativa') then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  atencao:=(e->>'atencao')::boolean; retorno:=(e->>'retorno_solicitado')::boolean;
  envelope:=e->'conteudo'; justificativa:=e->'justificativa';
  -- 12/11/2026: data do acontecimento e área chegam EM CLARO ao lado do envelope, porque o
  -- banco não pode extraí-las de dentro dele. Ambas opcionais: registro sem data informada
  -- continua válido e a linha do tempo diz que a data não existe, em vez de inventá-la.
  if jsonb_typeof(e->'aconteceu_em') not in ('string','null','undefined')
   or jsonb_typeof(e->'area') not in ('string','null','undefined')
   or (jsonb_typeof(e->'aconteceu_em')='string' and coalesce(e->>'aconteceu_em','') !~ '^\d{4}-\d{2}-\d{2}$')
   or (jsonb_typeof(e->'area')='string' and coalesce(length(btrim(e->>'area')) between 1 and 120,false) is not true) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  begin
   if jsonb_typeof(e->'aconteceu_em')='string' then acontecimento:=(e->>'aconteceu_em')::date; end if;
  exception when invalid_datetime_format or datetime_field_overflow then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end;
  if jsonb_typeof(e->'area')='string' then rotulo_area:=btrim(e->>'area'); end if;
  if jsonb_typeof(envelope) is distinct from 'object' or envelope - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or envelope->'formato' is distinct from '1'::jsonb or jsonb_typeof(envelope->'key_id') is distinct from 'string'
   or coalesce(length(envelope->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(envelope->'nonce') is distinct from 'string' or coalesce(envelope->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(envelope->'tag') is distinct from 'string' or coalesce(envelope->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(envelope->'ciphertext') is distinct from 'string'
   or coalesce(length(envelope->>'ciphertext') between 1 and 32768 and envelope->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  if estado='retificado' and (
   justificativa - array['formato','key_id','nonce','ciphertext','tag'] <> '{}'::jsonb
   or justificativa->'formato' is distinct from '1'::jsonb or jsonb_typeof(justificativa->'key_id') is distinct from 'string'
   or coalesce(length(justificativa->>'key_id') between 1 and 128,false) is not true
   or jsonb_typeof(justificativa->'nonce') is distinct from 'string' or coalesce(justificativa->>'nonce','') !~ '^[A-Za-z0-9_-]{16}$'
   or jsonb_typeof(justificativa->'tag') is distinct from 'string' or coalesce(justificativa->>'tag','') !~ '^[A-Za-z0-9_-]{22}$'
   or jsonb_typeof(justificativa->'ciphertext') is distinct from 'string'
   or coalesce(length(justificativa->>'ciphertext') between 1 and 32768 and justificativa->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false) is not true) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  -- Quem é família escreve relato próprio e nada mais: não publica evolução, não amplia a
  -- audiência, não responde registro alheio e não converte nada em tarefa.
  if papel='familia' and (tipo<>'relato_familiar' or audiencia<>'equipe' or responde is not null or tarefa is not null) then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  if papel='colaborador' and tipo<>'evolucao_profissional' then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  if estado='rascunho' and responde is not null then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao='api.gravar_diario' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   select v.versao,v.estado into atual,anterior_estado from cadastro.diario_registro_versao v
    where v.diario_registro_id=diario order by v.versao desc limit 1;
   select r.autor_usuario_id into autor_registro from cadastro.diario_registro r where r.id=diario and r.paciente_id=paciente;
   if responde is not null then
    select r.tipo into tipo_respondido from cadastro.diario_registro r where r.id=responde and r.paciente_id=paciente;
   end if;
   if coalesce(atual,0)<>esperada
    or (esperada=0 and exists(select 1 from cadastro.diario_registro r where r.id=diario))
    or (esperada>0 and (autor_registro is null or autor_registro<>ator))
    -- FR-012: rascunho vira rascunho ou publicado; o que já foi publicado só muda retificando.
    or (esperada>0 and anterior_estado='rascunho' and estado='retificado')
    or (esperada>0 and anterior_estado<>'rascunho' and estado<>'retificado')
    or (esperada=0 and estado='retificado')
    or (responde is not null and tipo_respondido is null)
    or (responde is not null and responde=diario)
    -- FR-013: o retorno a um relato familiar precisa alcançar quem o escreveu.
    or (tipo_respondido='relato_familiar' and audiencia<>'equipe_e_familia') then
    insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
    if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
    return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
   end if;
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,esperada+1)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    if esperada=0 then
     insert into cadastro.diario_registro(id,paciente_id,tipo,autor_usuario_id) values(diario,paciente,tipo,ator);
    end if;
    insert into cadastro.diario_registro_versao(id,diario_registro_id,versao,versao_esperada,estado,audiencia,aconteceu_em,area,atencao,retorno_solicitado,origem_conteudo,responde_registro_id,tarefa_id,conteudo_cifrado,justificativa_cifrada,criado_por_usuario_id)
     values(registro,diario,esperada+1,nullif(esperada,0),estado,audiencia,acontecimento,rotulo_area,atencao,retorno,origem,responde,tarefa,envelope,case when estado='retificado' then justificativa end,ator);
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or not exists(select 1 from cadastro.diario_registro_versao v join cadastro.diario_registro r on r.id=v.diario_registro_id
     where v.id=anterior.resultado_id and r.paciente_id=paciente and v.versao=anterior.resultado_versao) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
  select jsonb_build_object('registro_id',v.id,'diario_registro_id',r.id,'paciente_id',r.paciente_id,
    'tipo',r.tipo,'autor_usuario_id',r.autor_usuario_id,'versao',v.versao,'estado',v.estado,
    'audiencia',v.audiencia,'atencao',v.atencao,'retorno_solicitado',v.retorno_solicitado,
    'origem_conteudo',v.origem_conteudo,'responde_registro_id',v.responde_registro_id,
    'tarefa_id',v.tarefa_id,'conteudo',v.conteudo_cifrado,'justificativa',v.justificativa_cifrada,
    'criado_em',v.criado_em,'consultas',0)
   into resultado from cadastro.diario_registro_versao v join cadastro.diario_registro r on r.id=v.diario_registro_id
   where v.id=anterior.resultado_id;
 else
  -- FR-013: marcar a consulta de quem não é o autor. `on conflict do nothing` mantém a
  -- primeira leitura; reler não reescreve a data nem encerra a solicitação de retorno.
  insert into cadastro.diario_consulta(diario_registro_id,usuario_id)
   select r.id,ator from cadastro.diario_registro r
   join lateral (select * from cadastro.diario_registro_versao x where x.diario_registro_id=r.id and (not(e ? 'registro_id_exportacao') or (x.id=(e->>'registro_id_exportacao')::uuid and x.versao=(e->>'versao_exportacao')::integer)) order by x.versao desc limit 1) v on true
   where r.paciente_id=paciente and r.autor_usuario_id<>ator and v.estado<>'rascunho'
   on conflict do nothing;
  select coalesce(jsonb_agg(item order by criado_em desc),'[]'::jsonb) into resultado from (
   select jsonb_build_object('registro_id',v.id,'diario_registro_id',r.id,'paciente_id',r.paciente_id,
     'tipo',r.tipo,'autor_usuario_id',r.autor_usuario_id,'versao',v.versao,'estado',v.estado,
     'audiencia',v.audiencia,'atencao',v.atencao,'retorno_solicitado',v.retorno_solicitado,
     'origem_conteudo',v.origem_conteudo,'responde_registro_id',v.responde_registro_id,
     'tarefa_id',v.tarefa_id,'conteudo',v.conteudo_cifrado,'justificativa',v.justificativa_cifrada,
     'criado_em',v.criado_em,
     'consultas',(select count(*) from cadastro.diario_consulta c where c.diario_registro_id=r.id)) as item,
    v.criado_em as criado_em
   from cadastro.diario_registro r
   join lateral (select * from cadastro.diario_registro_versao x where x.diario_registro_id=r.id and (not(e ? 'registro_id_exportacao') or (x.id=(e->>'registro_id_exportacao')::uuid and x.versao=(e->>'versao_exportacao')::integer)) order by x.versao desc limit 1) v on true
   where r.paciente_id=paciente
  ) visiveis;
 end if;
 if e ? 'registro_id_exportacao' and (resultado is null or resultado='[]'::jsonb) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $corpo$);
commit;
