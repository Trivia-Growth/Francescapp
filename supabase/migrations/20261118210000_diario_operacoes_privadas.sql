-- Leitura e gravação privadas do diário (FR-008, FR-009, FR-012, FR-013, FR-014).
--
-- Esta é a primeira fatia de conteúdo com duas trilhas de autorização no mesmo wrapper:
--  - colaborador: idêntica à de anamnese/saúde/encaminhamento (Google Workspace, amr `oauth`,
--    concessão `vinculada`, sessão `google_workspace`);
--  - familiar: idêntica à de `api.consultar_paciente_familiar_privado` (20261112040000) —
--    perfil `familia`, `cadastro.acesso_paciente` vigente, sessão `familia` sem concessão,
--    amr `password`.
-- Nenhuma delas é afrouxada aqui, e nenhuma depende da outra: um ator é uma coisa ou a outra.
-- Esta migration não liga a jornada de login familiar; ela só deixa de negar o familiar que
-- já estiver autenticado pelos mecanismos existentes.
--
-- Matriz de audiência aplicada (origens, não invenção desta fatia):
--  - `registrar-fundacao-real/specs/sigilo-e-governanca/spec.md`: familiares acessam somente
--    pacientes vinculados, seus próprios relatos e o conteúdo disponibilizado à família; o
--    vínculo não expõe evoluções internas nem relatos de outros familiares;
--  - `diario-textual-privado/design.md`: a audiência inicial publicada é autor e coordenação;
--  - `relato-textual-inicial/design.md`: divulgação adicional exige audiência explícita.
-- Decorrência desta fatia, registrada no design: um retorno (`responde_registro_id`) a um
-- relato familiar precisa alcançar quem o escreveu, senão FR-013 é inalcançável — por isso a
-- resposta a `relato_familiar` é obrigada a `equipe_e_familia` e só é visível ao autor do
-- relato respondido, não a todos os familiares do paciente.
select set_config('ffcmapp.migrador_diario_owner',current_user,false);
create role ffcmapp_diario_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_diario_owner to current_user with inherit false, set true;
grant usage, create on schema api to ffcmapp_diario_owner;
grant usage on schema public, identidade, cadastro, operacao, auditoria, auth_privado, bloqueios_auth to ffcmapp_diario_owner;
grant execute on function auth_privado.uid(), auth_privado.jwt(), auth_privado.identidades(), auth_privado.sessoes(), bloqueios_auth.travar(uuid,uuid) to ffcmapp_diario_owner;
select set_config('ffcmapp.diario_tinha_verificador',
  pg_has_role(current_user,'ffcmapp_atestado_verificador_owner','SET')::text,false);
do $$ begin
 if current_setting('ffcmapp.diario_tinha_verificador')='false' then
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
   where r.rolname='ffcmapp_atestado_verificador_owner' and u.rolname=current_user and g.rolname=current_user) then
   raise exception 'MEMBERSHIP_VERIFICADOR_CONCEDENTE_EXISTENTE_SEM_SET';
  end if;
  execute format('grant ffcmapp_atestado_verificador_owner to %I with inherit false, set true granted by %I',current_user,current_user);
 end if;
end $$;
set role ffcmapp_atestado_verificador_owner;
grant execute on function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) to ffcmapp_diario_owner;
reset role;
select set_config('role',current_setting('ffcmapp.migrador_diario_owner'),false);
do $$ begin
 if current_setting('ffcmapp.diario_tinha_verificador')='false' then
  execute format('revoke ffcmapp_atestado_verificador_owner from %I granted by %I',current_user,current_user);
 end if;
end $$;

-- `for share` exige privilégio de UPDATE além do de SELECT; cada tabela travada recebe update
-- de uma coluna inócua e uma policy de trava que nunca grava.
grant select (dominio_workspace,google_unico_oauth_confirmado), update (dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_diario_owner;
grant select (id,perfil,ativo), update (versao) on public.usuario to ffcmapp_diario_owner;
grant select (id,usuario_id,perfil,estado,subject_google,metodo), update (versao) on identidade.concessao_equipe to ffcmapp_diario_owner;
grant select (session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo,revogada_em,encerrada_em), update (revogada_em) on identidade.sessao to ffcmapp_diario_owner;
grant select (id,paciente_id,usuario_id,revogada_em), update (versao) on cadastro.acesso_paciente to ffcmapp_diario_owner;
grant select (id), update (versao) on cadastro.paciente to ffcmapp_diario_owner;
grant select,insert on cadastro.diario_registro,cadastro.diario_registro_versao,cadastro.diario_consulta,operacao.requisicao to ffcmapp_diario_owner;
grant insert (id,ator_usuario_id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_diario_owner;

create policy diario_owner_config on identidade.configuracao_auth_nativo for select to ffcmapp_diario_owner using (true);
create policy diario_owner_config_lock on identidade.configuracao_auth_nativo for update to ffcmapp_diario_owner using (true) with check (false);
create policy diario_owner_usuario on public.usuario for select to ffcmapp_diario_owner using (id=(select auth_privado.uid()));
create policy diario_owner_usuario_lock on public.usuario for update to ffcmapp_diario_owner using (id=(select auth_privado.uid())) with check (false);
create policy diario_owner_concessao on identidade.concessao_equipe for select to ffcmapp_diario_owner using (usuario_id=(select auth_privado.uid()));
create policy diario_owner_concessao_lock on identidade.concessao_equipe for update to ffcmapp_diario_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy diario_owner_sessao on identidade.sessao for select to ffcmapp_diario_owner using (usuario_id=(select auth_privado.uid()));
create policy diario_owner_sessao_lock on identidade.sessao for update to ffcmapp_diario_owner using (usuario_id=(select auth_privado.uid())) with check (false);
create policy diario_owner_acesso on cadastro.acesso_paciente for select to ffcmapp_diario_owner using (usuario_id=(select auth_privado.uid()));
create policy diario_owner_acesso_lock on cadastro.acesso_paciente for update to ffcmapp_diario_owner using (usuario_id=(select auth_privado.uid())) with check (false);

-- Paciente alcançável: colaborador vinculado OU familiar com acesso vigente. As duas provas
-- são as já exigidas nas fatias correspondentes; nenhuma delas é relaxada por estar aqui.
create policy diario_owner_paciente on cadastro.paciente for select to ffcmapp_diario_owner using (
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
create policy diario_owner_paciente_lock on cadastro.paciente for update to ffcmapp_diario_owner using (true) with check (false);

-- O registro só diz paciente, tipo e autor. O conteúdo e a audiência estão na versão, e é lá
-- que a visibilidade é decidida; por isso esta policy não se refere à versão (seria recursiva).
create policy diario_registro_select on cadastro.diario_registro for select to ffcmapp_diario_owner
 using (exists(select 1 from cadastro.paciente p where p.id=paciente_id));
create policy diario_registro_insert on cadastro.diario_registro for insert to ffcmapp_diario_owner
 with check (autor_usuario_id=(select auth_privado.uid()) and exists(select 1 from cadastro.paciente p where p.id=paciente_id));

create policy diario_versao_select on cadastro.diario_registro_versao for select to ffcmapp_diario_owner using (
 exists (
  select 1 from cadastro.diario_registro r
  where r.id=diario_registro_id
   and (
    r.autor_usuario_id=(select auth_privado.uid())
    or (
     estado<>'rascunho'
     and (
      exists(select 1 from public.usuario u where u.id=(select auth_privado.uid()) and u.perfil in ('administrador','profissional'))
      or (
       audiencia='equipe_e_familia'
       and (
        responde_registro_id is null
        or exists(select 1 from cadastro.diario_registro o where o.id=responde_registro_id and o.autor_usuario_id=(select auth_privado.uid()))
       )
      )
     )
    )
   )
 )
);
-- Só o autor escreve versões do próprio registro: FR-012 dá a retificação ao autor, e
-- ninguém reescreve o registro de outra pessoa (quem responde cria o próprio registro).
create policy diario_versao_insert on cadastro.diario_registro_versao for insert to ffcmapp_diario_owner
 with check (
  criado_por_usuario_id=(select auth_privado.uid())
  and exists(select 1 from cadastro.diario_registro r where r.id=diario_registro_id and r.autor_usuario_id=(select auth_privado.uid()))
 );
-- Consulta: o remetente vê quem consultou o seu registro; o leitor vê apenas a própria marca.
create policy diario_consulta_select on cadastro.diario_consulta for select to ffcmapp_diario_owner using (
 usuario_id=(select auth_privado.uid())
 or exists(select 1 from cadastro.diario_registro r where r.id=diario_registro_id and r.autor_usuario_id=(select auth_privado.uid()))
);
create policy diario_consulta_insert on cadastro.diario_consulta for insert to ffcmapp_diario_owner with check (
 usuario_id=(select auth_privado.uid())
 and exists(select 1 from cadastro.diario_registro r where r.id=diario_registro_id and r.autor_usuario_id<>(select auth_privado.uid()))
);
create policy diario_requisicao on operacao.requisicao for select to ffcmapp_diario_owner
 using (ator_usuario_id=(select auth_privado.uid()) and operacao='api.gravar_diario');
create policy diario_requisicao_inserir on operacao.requisicao for insert to ffcmapp_diario_owner
 with check (ator_usuario_id=(select auth_privado.uid()) and operacao='api.gravar_diario');
create policy diario_auditoria on auditoria.evento for insert to ffcmapp_diario_owner with check (ator_usuario_id=(select auth_privado.uid()));
create policy diario_ator_exclusivo on auditoria.evento as restrictive for insert to ffcmapp_diario_owner
 with check (ator_usuario_id is null or ator_auth_id is null);
create policy diario_auth_nao_admitido on auditoria.evento for insert to ffcmapp_diario_owner with check (
 ator_usuario_id is null and operador_restrito is null
 and ator_auth_id=(select auth_privado.uid())
 and resultado='negado'
 and acao in ('api.ler_diario','api.gravar_diario')
 and tipo_objeto='paciente'
 and not exists(select 1 from public.usuario u where u.id=(select auth_privado.uid()))
);

set role ffcmapp_diario_owner;
create function api.diario_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
#variable_conflict use_variable
declare
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
  or e - array['request_id','paciente_id','diario_registro_id','registro_id','versao_esperada','tipo','estado','audiencia','atencao','retorno_solicitado','origem_conteudo','responde_registro_id','tarefa_id','conteudo','justificativa','aad','aad_justificativa','chave_idempotencia','digest_idempotencia','atestado'] <> '{}'::jsonb
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
 if acao='api.ler_diario' then
  if e - array['request_id','paciente_id','atestado'] <> '{}'::jsonb then
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
    insert into cadastro.diario_registro_versao(id,diario_registro_id,versao,versao_esperada,estado,audiencia,atencao,retorno_solicitado,origem_conteudo,responde_registro_id,tarefa_id,conteudo_cifrado,justificativa_cifrada,criado_por_usuario_id)
     values(registro,diario,esperada+1,nullif(esperada,0),estado,audiencia,atencao,retorno,origem,responde,tarefa,envelope,case when estado='retificado' then justificativa end,ator);
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
   join lateral (select * from cadastro.diario_registro_versao x where x.diario_registro_id=r.id order by x.versao desc limit 1) v on true
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
   join lateral (select * from cadastro.diario_registro_versao x where x.diario_registro_id=r.id order by x.versao desc limit 1) v on true
   where r.paciente_id=paciente
  ) visiveis;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req,'repeticao',repeticao);
end $$;
revoke all on function api.diario_operacao_privada(jsonb) from public,anon,authenticated,service_role;
create function api.diario_privado(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare req uuid; paciente uuid; acao text;
begin
 begin
  return api.diario_operacao_privada(p_transporte);
 exception when sqlstate 'PZ001' then
  req:=(p_transporte#>>'{entrada,request_id}')::uuid;
  paciente:=(p_transporte#>>'{entrada,paciente_id}')::uuid;
  acao:=p_transporte#>>'{entrada,atestado,operacao}';
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),auth_privado.uid(),acao,'paciente',paciente,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end;
end $$;
revoke all on function api.diario_privado(jsonb) from public,anon,authenticated,service_role;
reset role;
select set_config('role',current_setting('ffcmapp.migrador_diario_owner'),false);
revoke create on schema api from ffcmapp_diario_owner;
revoke ffcmapp_diario_owner from current_user;
