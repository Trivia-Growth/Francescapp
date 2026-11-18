-- Leitura da família nas orientações (decisão do solicitante, 17/11/2026): família lê só
-- orientações cuja última versão está marcada `visibilidade='publica'`; nunca grava. Trilha de
-- autorização idêntica à de `api.consultar_paciente_familiar_privado` — nenhuma das duas
-- provas (colaborador, familiar) é afrouxada por estar aqui.
grant select (usuario_id, paciente_id, revogada_em), update (versao) on cadastro.acesso_paciente to ffcmapp_orientacao_owner;
grant select (concessao_versao_admissao) on identidade.sessao to ffcmapp_orientacao_owner;
create policy orientacao_owner_acesso_familiar on cadastro.acesso_paciente for select to ffcmapp_orientacao_owner
  using (usuario_id = (select auth_privado.uid()) and revogada_em is null);
-- `using` espelha a policy de select (nunca `false`): `for share`/`for update` também aplicam a
-- `using` da policy de UPDATE para decidir se a linha pode ser travada — `false` bloquearia o
-- próprio `for share` da trilha familiar, não só a escrita (achado real, ver
-- plano-cuidado-objetivos/design.md "Decisão do solicitante (17/11/2026)").
create policy orientacao_owner_acesso_familiar_lock on cadastro.acesso_paciente for update to ffcmapp_orientacao_owner
  using (usuario_id = (select auth_privado.uid())) with check (false);
-- Segunda policy PERMISSIVE em `cadastro.paciente`: Postgres combina com OR a já existente
-- `orientacao_owner_paciente` (colaborador). Não se mexe na policy do colaborador.
create policy orientacao_owner_paciente_familiar on cadastro.paciente for select to ffcmapp_orientacao_owner
  using (
    exists (
      select 1 from public.usuario u
      join cadastro.acesso_paciente ap on ap.usuario_id = u.id and ap.paciente_id = cadastro.paciente.id and ap.revogada_em is null
      join identidade.sessao s on s.usuario_id = u.id
      where u.id = (select auth_privado.uid()) and u.ativo and u.perfil = 'familia'
        and s.session_id::text = (select auth_privado.jwt() ->> 'session_id') and s.metodo = 'familia'
        and s.concessao_id is null and s.concessao_versao_admissao is null
        and s.revogada_em is null and s.encerrada_em is null
        and exists (select 1 from auth_privado.sessoes() a where a.id = s.session_id and a.user_id = u.id and (a.not_after is null or a.not_after > clock_timestamp()))
        and exists (select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt()) -> 'amr') = 'array' then (select auth_privado.jwt()) -> 'amr' else '[]'::jsonb end) m where m ->> 'method' = 'password')
    )
  );

select set_config('ffcmapp.migrador_orientacao_familia', current_user, false);
select set_config('ffcmapp.orientacao_familia_tinha_set', pg_has_role(current_user, 'ffcmapp_orientacao_owner', 'SET')::text, false);
select set_config('ffcmapp.orientacao_familia_tinha_create', exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a join pg_roles r on r.oid = a.grantee where n.nspname = 'api' and r.rolname = 'ffcmapp_orientacao_owner' and a.privilege_type = 'CREATE')::text, false);
do $$
begin
  if not exists (select 1 from pg_proc p join pg_roles r on r.oid = p.proowner where p.oid = 'api.orientacao_operacao_privada(jsonb)'::regprocedure and r.rolname = 'ffcmapp_orientacao_owner') then
    raise exception 'OWNER_INESPERADO';
  end if;
  if current_setting('ffcmapp.orientacao_familia_tinha_set') = 'false' then
    if exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member join pg_roles g on g.oid = m.grantor where r.rolname = 'ffcmapp_orientacao_owner' and u.rolname = current_user and g.rolname = current_user) then
      raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
    end if;
    execute format('grant ffcmapp_orientacao_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  end if;
  if current_setting('ffcmapp.orientacao_familia_tinha_create') = 'false' then
    grant create on schema api to ffcmapp_orientacao_owner;
  end if;
end $$;
set role ffcmapp_orientacao_owner;
create or replace function api.orientacao_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
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
  or e - array['request_id','paciente_id','orientacao_id','registro_id','versao_esperada','situacao','conteudo','aad','apenas_vigentes','visibilidade','atestado'] <> '{}'::jsonb
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
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
  return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
 end if;
 if acao='api.ler_orientacoes' then
  if e - array['request_id','paciente_id','apenas_vigentes','atestado'] <> '{}'::jsonb
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
   join lateral (select * from cadastro.orientacao_versao x where x.orientacao_id=o.id order by x.versao desc limit 1) v on true
   where o.paciente_id=paciente and (somente_vigentes is not true or v.situacao='vigente');
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'dados',resultado,'request_id',req);
end $$;
reset role;
select set_config('role', current_setting('ffcmapp.migrador_orientacao_familia'), false);
do $$ begin
 if current_setting('ffcmapp.orientacao_familia_tinha_create')='false' then revoke create on schema api from ffcmapp_orientacao_owner; end if;
 if current_setting('ffcmapp.orientacao_familia_tinha_set')='false' then execute format('revoke ffcmapp_orientacao_owner from %I granted by %I',current_user,current_user); end if;
end $$;
