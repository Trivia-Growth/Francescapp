-- FR-027/FR-028: leitura das pendências derivadas e gravação do acordo e da tratativa.
-- Owner dedicado, como nas demais fatias: a função só enxerga o que precisa e nenhuma
-- outra fatia herda estes privilégios.
--
-- Autorização mais estrita que a da fatia de saúde, de propósito: o Profissional precisa de
-- `cadastro.acesso_paciente` vigente, exatamente como na carteira. A pendência é lida a
-- partir da carteira e não pode mostrar caso que a carteira não mostraria.
--
-- O acordo (periodicidade do caso) é escrita só do Administrador, como a situação do caso
-- em `cadastro.acompanhamento_caso`. Reconhecer, atribuir e resolver vale para os dois
-- perfis: é trabalho de acompanhamento, não decisão de gestão do caso.
--
-- Exige prova real e autorização específica antes de qualquer aplicação remota.
select set_config('ffcmapp.migrador_pendencia_owner', current_user, false);

create role ffcmapp_pendencia_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_pendencia_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_pendencia_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_pendencia_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid, uuid) to ffcmapp_pendencia_owner;

grant ffcmapp_atestado_verificador_owner to current_user with inherit false, set true;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text, text, jsonb, jsonb, text) to ffcmapp_pendencia_owner;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_pendencia_owner'), false);
revoke ffcmapp_atestado_verificador_owner from current_user;

-- O derivador do sinal é de outro owner; conceder o execute exige assumir aquele papel.
grant ffcmapp_sinal_operacional_owner to current_user with inherit false, set true;
set role ffcmapp_sinal_operacional_owner;
grant execute on function cadastro.sinal_operacional_caso(uuid) to ffcmapp_pendencia_owner;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_pendencia_owner'), false);
revoke ffcmapp_sinal_operacional_owner from current_user;

-- `for share`/`for update` exigem privilégio de UPDATE além do de SELECT; por isso cada
-- tabela travada recebe update de uma coluna inócua e uma policy de trava que nunca grava.
grant select (dominio_workspace, google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_pendencia_owner;
grant select (id, perfil, ativo), update (versao) on public.usuario to ffcmapp_pendencia_owner;
grant select (id, usuario_id, perfil, estado, subject_google, metodo), update (versao) on identidade.concessao_equipe to ffcmapp_pendencia_owner;
grant select (session_id, usuario_id, concessao_id, metodo, revogada_em, encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_pendencia_owner;
grant select (id), update (versao) on cadastro.paciente to ffcmapp_pendencia_owner;
grant select (usuario_id, paciente_id, revogada_em), update (revogada_em) on cadastro.acesso_paciente to ffcmapp_pendencia_owner;
grant select (paciente_id, versao) on cadastro.acordo_acompanhamento to ffcmapp_pendencia_owner;
grant insert on cadastro.acordo_acompanhamento, cadastro.pendencia_tratativa to ffcmapp_pendencia_owner;
grant select (id, paciente_id) on cadastro.pendencia_tratativa to ffcmapp_pendencia_owner;
grant select, insert on operacao.requisicao to ffcmapp_pendencia_owner;
grant insert (id, ator_usuario_id, ator_auth_id, acao, tipo_objeto, objeto_id, resultado, request_id) on auditoria.evento to ffcmapp_pendencia_owner;

create policy pendencia_owner_config on identidade.configuracao_auth_nativo for select to ffcmapp_pendencia_owner using (true);
create policy pendencia_owner_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_pendencia_owner using (true) with check (false);
create policy pendencia_owner_usuario on public.usuario for select to ffcmapp_pendencia_owner using (true);
create policy pendencia_owner_usuario_lock on public.usuario for update to ffcmapp_pendencia_owner using (id = (select auth_privado.uid())) with check (false);
create policy pendencia_owner_concessao on identidade.concessao_equipe for select to ffcmapp_pendencia_owner using (usuario_id = (select auth_privado.uid()));
create policy pendencia_owner_concessao_lock on identidade.concessao_equipe for update to ffcmapp_pendencia_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy pendencia_owner_sessao on identidade.sessao for select to ffcmapp_pendencia_owner using (usuario_id = (select auth_privado.uid()));
create policy pendencia_owner_sessao_lock on identidade.sessao for update to ffcmapp_pendencia_owner using (usuario_id = (select auth_privado.uid())) with check (false);
create policy pendencia_owner_acesso on cadastro.acesso_paciente for select to ffcmapp_pendencia_owner using (usuario_id = (select auth_privado.uid()));
create policy pendencia_owner_acesso_lock on cadastro.acesso_paciente for update to ffcmapp_pendencia_owner using (usuario_id = (select auth_privado.uid())) with check (false);

-- Mesma prova de vínculo exigida na anamnese e na saúde: colaborador ativo, concessão
-- vinculada, sessão viva e identidade Google única do workspace confirmado. O recorte por
-- caso (acesso_paciente do Profissional) fica na própria função, com trava.
create policy pendencia_owner_paciente on cadastro.paciente for select to ffcmapp_pendencia_owner using (
  exists (
    select 1
    from public.usuario u
    join identidade.concessao_equipe c on c.usuario_id = u.id and c.perfil = u.perfil
    join identidade.sessao s on s.usuario_id = u.id and s.concessao_id = c.id
    join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
    join auth_privado.identidades() i on i.user_id = u.id and i.provider = 'google'
    where u.id = (select auth_privado.uid())
      and u.ativo
      and u.perfil in ('administrador', 'profissional')
      and c.estado = 'vinculada'
      and c.metodo = 'google_workspace'
      and c.subject_google = i.provider_id
      and s.session_id::text = (select auth_privado.jwt() ->> 'session_id')
      and s.metodo = 'google_workspace'
      and s.revogada_em is null
      and s.encerrada_em is null
      and exists (
        select 1 from auth_privado.sessoes() a
        where a.id = s.session_id and a.user_id = u.id
          and (a.not_after is null or a.not_after > clock_timestamp())
      )
      and (select count(*) from auth_privado.identidades() j where j.user_id = u.id and j.provider = 'google') = 1
      and i.identity_data ->> 'sub' = i.provider_id
      and i.identity_data ->> 'email_verified' = 'true'
      and i.identity_data #>> '{custom_claims,hd}' = cfg.dominio_workspace
      and exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof((select auth_privado.jwt()) -> 'amr') = 'array'
            then (select auth_privado.jwt()) -> 'amr' else '[]'::jsonb end
        ) m where m ->> 'method' = 'oauth'
      )
  )
);
create policy pendencia_owner_paciente_lock on cadastro.paciente for update to ffcmapp_pendencia_owner using (true) with check (false);
create policy pendencia_owner_acordo on cadastro.acordo_acompanhamento for select to ffcmapp_pendencia_owner using (exists (select 1 from cadastro.paciente p where p.id = paciente_id));
create policy pendencia_owner_acordo_inserir on cadastro.acordo_acompanhamento for insert to ffcmapp_pendencia_owner with check (ator_usuario_id = (select auth_privado.uid()) and exists (select 1 from cadastro.paciente p where p.id = paciente_id));
create policy pendencia_owner_tratativa on cadastro.pendencia_tratativa for select to ffcmapp_pendencia_owner using (exists (select 1 from cadastro.paciente p where p.id = paciente_id));
create policy pendencia_owner_tratativa_inserir on cadastro.pendencia_tratativa for insert to ffcmapp_pendencia_owner with check (ator_usuario_id = (select auth_privado.uid()) and exists (select 1 from cadastro.paciente p where p.id = paciente_id));
create policy pendencia_owner_requisicao on operacao.requisicao for select to ffcmapp_pendencia_owner using (ator_usuario_id = (select auth_privado.uid()) and operacao in ('api.gravar_acordo_acompanhamento', 'api.tratar_pendencia'));
create policy pendencia_owner_requisicao_inserir on operacao.requisicao for insert to ffcmapp_pendencia_owner with check (ator_usuario_id = (select auth_privado.uid()) and operacao in ('api.gravar_acordo_acompanhamento', 'api.tratar_pendencia'));
create policy pendencia_owner_auditoria on auditoria.evento for insert to ffcmapp_pendencia_owner with check (ator_usuario_id = (select auth_privado.uid()));
create policy pendencia_ator_exclusivo on auditoria.evento as restrictive for insert to ffcmapp_pendencia_owner
  with check (ator_usuario_id is null or ator_auth_id is null);
create policy pendencia_auth_nao_admitido on auditoria.evento for insert to ffcmapp_pendencia_owner
  with check (
    ator_usuario_id is null and operador_restrito is null
    and ator_auth_id = (select auth_privado.uid())
    and resultado = 'negado'
    and acao in ('api.listar_pendencias', 'api.gravar_acordo_acompanhamento', 'api.tratar_pendencia')
    and tipo_objeto = 'paciente'
    and not exists (select 1 from public.usuario u where u.id = (select auth_privado.uid()))
  );

set role ffcmapp_pendencia_owner;
create function api.pendencia_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path = '' set row_security = on as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; registro uuid; esperada integer; atual integer; inicio timestamptz; fim timestamptz;
 concessao uuid; perfil text; sujeito text; google record; dominio text; autorizado boolean:=false;
 acao text; resultado jsonb; anterior operacao.requisicao; repeticao boolean:=false;
 revisao date; atribuido uuid; tratativa_acao text; tipo_pendencia text; chave text;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e - array['request_id','paciente_id','registro_id','versao_esperada','atestado','chave_idempotencia','digest_idempotencia','dias_entre_atualizacoes','dias_antecedencia_revisao','dias_retorno_encaminhamento','proxima_revisao_em','tipo','chave_origem','acao','atribuido_usuario_id'] <> '{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz;
  acao:=a->>'operacao';
  if acao<>'api.listar_pendencias' then
   registro:=(e->>'registro_id')::uuid;
  end if;
  if acao='api.gravar_acordo_acompanhamento' then
   esperada:=(e->>'versao_esperada')::integer;
   if e ? 'proxima_revisao_em' and jsonb_typeof(e->'proxima_revisao_em')='string' then revisao:=(e->>'proxima_revisao_em')::date; end if;
  end if;
  if acao='api.tratar_pendencia' and e ? 'atribuido_usuario_id' and jsonb_typeof(e->'atribuido_usuario_id')='string' then
   atribuido:=(e->>'atribuido_usuario_id')::uuid;
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null
  or acao is null or acao not in ('api.listar_pendencias','api.gravar_acordo_acompanhamento','api.tratar_pendencia')
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text
  or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
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
 -- Recorte por caso: o Profissional precisa de acesso vigente ao paciente, travado na
 -- mesma transação. O acordo do caso é decisão de gestão e fica só com o Administrador.
 if autorizado and perfil='profissional' then
  perform 1 from cadastro.acesso_paciente x where x.usuario_id=ator and x.paciente_id=paciente and x.revogada_em is null for share;
  autorizado:=found;
 end if;
 if autorizado and acao='api.gravar_acordo_acompanhamento' and perfil<>'administrador' then
  autorizado:=false;
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
 if acao='api.listar_pendencias' then
  if e - array['request_id','paciente_id','atestado'] <> '{}'::jsonb then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','') !~ '^[A-Za-z0-9_-]{43}$'
   or registro is null then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  if acao='api.gravar_acordo_acompanhamento' then
   if e - array['request_id','paciente_id','registro_id','versao_esperada','atestado','chave_idempotencia','digest_idempotencia','dias_entre_atualizacoes','dias_antecedencia_revisao','dias_retorno_encaminhamento','proxima_revisao_em'] <> '{}'::jsonb
    or esperada is null or esperada<0 or esperada=2147483647
    or jsonb_typeof(e->'versao_esperada') is distinct from 'number'
    or coalesce(e->>'versao_esperada','') !~ '^(0|[1-9][0-9]*)$'
    or jsonb_typeof(e->'dias_antecedencia_revisao') is distinct from 'number'
    or coalesce(e->>'dias_antecedencia_revisao','') !~ '^[1-9][0-9]{0,2}$'
    or (e->>'dias_antecedencia_revisao')::integer not between 1 and 180
    or jsonb_typeof(e->'dias_retorno_encaminhamento') is distinct from 'number'
    or coalesce(e->>'dias_retorno_encaminhamento','') !~ '^[1-9][0-9]{0,2}$'
    or (e->>'dias_retorno_encaminhamento')::integer not between 1 and 365
    or jsonb_typeof(e->'dias_entre_atualizacoes') not in ('number','null')
    or (jsonb_typeof(e->'dias_entre_atualizacoes')='number'
      and (coalesce(e->>'dias_entre_atualizacoes','') !~ '^[1-9][0-9]{0,2}$'
        or (e->>'dias_entre_atualizacoes')::integer not between 1 and 365))
    or jsonb_typeof(e->'proxima_revisao_em') not in ('string','null')
    or (jsonb_typeof(e->'proxima_revisao_em')='string' and (revisao is null or coalesce(e->>'proxima_revisao_em','') !~ '^\d{4}-\d{2}-\d{2}$')) then
    raise exception using errcode='22023',message='ENTRADA_INVALIDA';
   end if;
  else
   tipo_pendencia:=e->>'tipo'; chave:=e->>'chave_origem'; tratativa_acao:=e->>'acao';
   if e - array['request_id','paciente_id','registro_id','atestado','chave_idempotencia','digest_idempotencia','tipo','chave_origem','acao','atribuido_usuario_id'] <> '{}'::jsonb
    or tipo_pendencia is null or tipo_pendencia not in ('revisao_proxima','atualizacao_ausente','encaminhamento_sem_retorno','tarefa_atrasada')
    or chave is null or length(chave) not between 1 and 200
    or tratativa_acao is null or tratativa_acao not in ('reconhecida','atribuida','resolvida','reaberta')
    or (tratativa_acao='atribuida') <> (atribuido is not null) then
    raise exception using errcode='22023',message='ENTRADA_INVALIDA';
   end if;
  end if;
  perform 1 from cadastro.paciente p where p.id=paciente for update;
 end if;
 if not found then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 -- Quem recebe a atribuição precisa ser colaborador ativo; atribuir a um desconhecido ou a
 -- um perfil familiar não é recusa de permissão do ator, é entrada inválida.
 if acao='api.tratar_pendencia' and atribuido is not null then
  perform 1 from public.usuario u where u.id=atribuido and u.ativo and u.perfil in ('administrador','profissional');
  if not found then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 if acao<>'api.listar_pendencias' then
  select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
  repeticao:=found;
  if not found then
   if acao='api.gravar_acordo_acompanhamento' then
    select c.versao into atual from cadastro.acordo_acompanhamento c where c.paciente_id=paciente order by c.versao desc limit 1;
    if coalesce(atual,0)<>esperada then
     insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
      values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
     if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
     return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
    end if;
   end if;
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',registro,
      case when acao='api.gravar_acordo_acompanhamento' then esperada+1 else 1 end)
    on conflict (ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   if found then
    if acao='api.gravar_acordo_acompanhamento' then
     insert into cadastro.acordo_acompanhamento(id,paciente_id,versao,dias_entre_atualizacoes,dias_antecedencia_revisao,dias_retorno_encaminhamento,proxima_revisao_em,ator_usuario_id)
      values(registro,paciente,esperada+1,
        case when jsonb_typeof(e->'dias_entre_atualizacoes')='number' then (e->>'dias_entre_atualizacoes')::integer end,
        (e->>'dias_antecedencia_revisao')::integer,(e->>'dias_retorno_encaminhamento')::integer,revisao,ator);
    else
     insert into cadastro.pendencia_tratativa(id,paciente_id,tipo,chave_origem,acao,atribuido_usuario_id,ator_usuario_id)
      values(registro,paciente,tipo_pendencia,chave,tratativa_acao,atribuido,ator);
    end if;
   else
    repeticao:=true;
    select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
   end if;
  end if;
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.estado <> 'concluida'
   or (acao='api.gravar_acordo_acompanhamento'
     and not exists(select 1 from cadastro.acordo_acompanhamento c where c.paciente_id=paciente and c.versao=anterior.resultado_versao))
   or (acao='api.tratar_pendencia'
     and not exists(select 1 from cadastro.pendencia_tratativa t where t.id=anterior.resultado_id and t.paciente_id=paciente)) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
 end if;
 resultado:=cadastro.sinal_operacional_caso(paciente)
   || jsonb_build_object('paciente_id',paciente,'perfil_escrita_acordo',perfil='administrador');
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $$;
revoke all on function api.pendencia_operacao_privada(jsonb) from public, anon, authenticated, service_role;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_pendencia_owner'), false);

revoke create on schema api from ffcmapp_pendencia_owner;
revoke ffcmapp_pendencia_owner from current_user;
