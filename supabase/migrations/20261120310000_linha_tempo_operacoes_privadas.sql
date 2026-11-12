-- FR-007: leitura da linha do tempo do caso. Owner dedicado, como nas demais fatias.
--
-- Duas trilhas de autorização, idênticas às já provadas, sem nenhuma afrouxada:
--  - colaborador: Google Workspace, amr `oauth`, concessão vinculada e sessão viva. Para
--    `profissional` exige ainda `cadastro.acesso_paciente` vigente travado na transação —
--    o mesmo recorte da carteira e das pendências. A linha do tempo não pode mostrar caso
--    que a carteira não mostraria.
--  - familiar: perfil `familia`, `cadastro.acesso_paciente` vigente, sessão `familia` sem
--    concessão, amr `password`. Idêntica à de `api.consultar_paciente_familiar_privado`.
--
-- Operação somente de leitura: não há ledger de idempotência, como em
-- `api.listar_pendencias`. A leitura é auditada nos dois caminhos, permitido e negado.
--
-- Exige prova real e autorização específica antes de qualquer aplicação remota.
select set_config('ffcmapp.migrador_linha_tempo_owner', current_user, false);

create role ffcmapp_linha_tempo_leitura_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_linha_tempo_leitura_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_linha_tempo_leitura_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_linha_tempo_leitura_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid) to ffcmapp_linha_tempo_leitura_owner;

grant ffcmapp_atestado_verificador_owner to current_user with inherit false, set true;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_linha_tempo_leitura_owner;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_linha_tempo_owner'), false);
revoke ffcmapp_atestado_verificador_owner from current_user;

-- O derivador é de outro owner; conceder o execute exige assumir aquele papel.
grant ffcmapp_linha_tempo_owner to current_user with inherit false, set true;
set role ffcmapp_linha_tempo_owner;
grant execute on function cadastro.linha_tempo_caso(uuid, uuid, boolean, timestamptz, timestamptz, text[], uuid, timestamptz, uuid, integer)
  to ffcmapp_linha_tempo_leitura_owner;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_linha_tempo_owner'), false);
revoke ffcmapp_linha_tempo_owner from current_user;

-- `for share` exige privilégio de UPDATE além do de SELECT; por isso cada tabela travada
-- recebe update de uma coluna inócua e uma policy de trava que nunca grava.
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_linha_tempo_leitura_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_linha_tempo_leitura_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao) on identidade.concessao_equipe to ffcmapp_linha_tempo_leitura_owner;
grant select (session_id, usuario_id, concessao_id, concessao_versao_admissao, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_linha_tempo_leitura_owner;
grant select (id), update (versao) on cadastro.paciente to ffcmapp_linha_tempo_leitura_owner;
grant select (usuario_id, paciente_id, revogada_em), update (revogada_em) on cadastro.acesso_paciente to ffcmapp_linha_tempo_leitura_owner;
grant insert (id, ator_usuario_id, ator_auth_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_linha_tempo_leitura_owner;

create policy linha_tempo_leitura_config on identidade.configuracao_auth_nativo for select to ffcmapp_linha_tempo_leitura_owner using (true);
create policy linha_tempo_leitura_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_linha_tempo_leitura_owner using (true) with check (false);
create policy linha_tempo_leitura_usuario on public.usuario for select to ffcmapp_linha_tempo_leitura_owner using (true);
create policy linha_tempo_leitura_usuario_lock on public.usuario for update to ffcmapp_linha_tempo_leitura_owner using (id = (select auth_privado.uid())) with check (false);
create policy linha_tempo_leitura_concessao on identidade.concessao_equipe for select to ffcmapp_linha_tempo_leitura_owner using (usuario_id = (select auth_privado.uid()));
create policy linha_tempo_leitura_concessao_lock on identidade.concessao_equipe for update to ffcmapp_linha_tempo_leitura_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy linha_tempo_leitura_sessao on identidade.sessao for select to ffcmapp_linha_tempo_leitura_owner using (usuario_id = (select auth_privado.uid()));
create policy linha_tempo_leitura_sessao_lock on identidade.sessao for update to ffcmapp_linha_tempo_leitura_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy linha_tempo_leitura_acesso on cadastro.acesso_paciente for select to ffcmapp_linha_tempo_leitura_owner using (usuario_id = (select auth_privado.uid()));
create policy linha_tempo_leitura_acesso_lock on cadastro.acesso_paciente for update to ffcmapp_linha_tempo_leitura_owner using (usuario_id = (select auth_privado.uid())) with check (false);

-- Paciente alcançável: colaborador vinculado OU familiar com acesso vigente, nas mesmas
-- provas já exigidas pelas fatias correspondentes.
create policy linha_tempo_leitura_paciente on cadastro.paciente for select to ffcmapp_linha_tempo_leitura_owner using (
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional')
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
 )
 or exists (
  select 1 from public.usuario u
  join cadastro.acesso_paciente ap on ap.usuario_id=u.id and ap.paciente_id=cadastro.paciente.id and ap.revogada_em is null
  join identidade.sessao s on s.usuario_id=u.id
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='familia'
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='familia'
   and s.concessao_id is null and s.concessao_versao_admissao is null
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='password')
 )
);
create policy linha_tempo_leitura_paciente_lock on cadastro.paciente for update to ffcmapp_linha_tempo_leitura_owner using (true) with check (false);
create policy linha_tempo_leitura_auditoria on auditoria.evento for insert to ffcmapp_linha_tempo_leitura_owner
  with check (ator_usuario_id = (select auth_privado.uid()));
create policy linha_tempo_ator_exclusivo on auditoria.evento as restrictive for insert to ffcmapp_linha_tempo_leitura_owner
  with check (ator_usuario_id is null or ator_auth_id is null);
create policy linha_tempo_auth_nao_admitido on auditoria.evento for insert to ffcmapp_linha_tempo_leitura_owner
  with check (
    ator_usuario_id is null and operador_restrito is null
    and ator_auth_id = (select auth_privado.uid())
    and resultado = 'negado'
    and acao = 'api.ler_linha_tempo'
    and tipo_objeto = 'paciente'
    and not exists (select 1 from public.usuario u where u.id = (select auth_privado.uid()))
  );

set role ffcmapp_linha_tempo_leitura_owner;
create function api.linha_tempo_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; inicio timestamptz; fim timestamptz; concessao uuid; perfil text; sujeito text;
 google record; dominio text; autorizado boolean:=false; papel text; acao text;
 de timestamptz; ate timestamptz; fontes text[]; autor uuid; cursor_em timestamptz;
 cursor_id uuid; limite integer; resultado jsonb;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','atestado','de','ate','fontes','autor_usuario_id','cursor_em','cursor_id','limite'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao is distinct from 'api.ler_linha_tempo'
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- Trilha colaborador.
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
 -- Trilha familiar.
 if not autorizado
  and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.metodo='familia'
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
 -- Recorte por caso do Profissional: acesso vigente, travado na mesma transação.
 if autorizado and papel='colaborador' and perfil='profissional' then
  perform 1 from cadastro.acesso_paciente x where x.usuario_id=ator and x.paciente_id=paciente and x.revogada_em is null for share;
  autorizado:=found;
 end if;
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
 -- Filtros. Tudo opcional; o que vier precisa ser do tipo certo, senão é entrada inválida.
 begin
  if jsonb_typeof(e->'de')='string' then de:=(e->>'de')::timestamptz; end if;
  if jsonb_typeof(e->'ate')='string' then ate:=(e->>'ate')::timestamptz; end if;
  if jsonb_typeof(e->'autor_usuario_id')='string' then autor:=(e->>'autor_usuario_id')::uuid; end if;
  if jsonb_typeof(e->'cursor_em')='string' then cursor_em:=(e->>'cursor_em')::timestamptz; end if;
  if jsonb_typeof(e->'cursor_id')='string' then cursor_id:=(e->>'cursor_id')::uuid; end if;
  if jsonb_typeof(e->'limite')='number' then limite:=(e->>'limite')::integer; end if;
  if jsonb_typeof(e->'fontes')='array' then
   select array_agg(x) into fontes from jsonb_array_elements_text(e->'fontes') x;
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end;
 if jsonb_typeof(e->'de') not in ('string','null','undefined')
  or jsonb_typeof(e->'ate') not in ('string','null','undefined')
  or jsonb_typeof(e->'fontes') not in ('array','null','undefined')
  or (de is not null and ate is not null and ate<=de)
  or (limite is not null and limite not between 1 and 200)
  or ((cursor_em is null) <> (cursor_id is null))
  or (fontes is not null and (array_length(fontes,1) is null or array_length(fontes,1)>12
    or exists(select 1 from unnest(fontes) f where f not in (
      'diario','documento','anamnese','saude','contexto','rede','situacao','objetivo','tarefa','encaminhamento','orientacao','pendencia')))) then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 perform 1 from cadastro.paciente p where p.id=paciente;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 resultado:=cadastro.linha_tempo_caso(paciente,ator,papel='familia',de,ate,fontes,autor,cursor_em,cursor_id,limite)
   || jsonb_build_object('paciente_id',paciente,'papel',papel);
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req);
end $$;
revoke all on function api.linha_tempo_operacao_privada(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_linha_tempo_owner'), false);

revoke create on schema api from ffcmapp_linha_tempo_leitura_owner;
revoke ffcmapp_linha_tempo_leitura_owner from current_user;
