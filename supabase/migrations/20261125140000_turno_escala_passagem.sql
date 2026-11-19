-- Grupo 3 FR-056/057 e FR-009/013. PREPARADO, NÃO EXECUTADO.
-- Suposições conservadoras no design; sem backfill, ativação ou dado real.
create table cadastro.turno_escala_versao (
 escala_id uuid not null, paciente_id uuid not null references cadastro.paciente(id),
 versao integer not null check(versao>0), anterior integer,
 profissional_previsto_usuario_id uuid not null references public.usuario(id),
 profissional_assumiu_usuario_id uuid references public.usuario(id),
 inicio_previsto timestamptz not null, fim_previsto timestamptz not null,
 tipo text not null check(tipo in ('previsto','substituicao','cobertura')),
 motivo_cifrado jsonb, autor_usuario_id uuid not null references public.usuario(id),
 registrado_em timestamptz not null default clock_timestamp(),
 primary key(escala_id,versao), foreign key(escala_id,anterior) references cadastro.turno_escala_versao(escala_id,versao),
 check(fim_previsto>inicio_previsto),check((versao=1 and anterior is null and tipo='previsto' and motivo_cifrado is null and profissional_assumiu_usuario_id is null) or (versao>1 and anterior=versao-1 and tipo<>'previsto' and motivo_cifrado is not null and profissional_assumiu_usuario_id is not null))
);
create index turno_escala_caso_idx on cadastro.turno_escala_versao(paciente_id,inicio_previsto,escala_id,versao);
-- Somente referências operacionais: conteúdo permanece uma única vez no Diário.
create table cadastro.diario_turno_passagem (
 turno_id uuid not null references cadastro.turno(id), versao_passagem integer not null check(versao_passagem>0), anterior integer, paciente_id uuid not null references cadastro.paciente(id),
 diario_registro_id uuid not null unique references cadastro.diario_registro(id), registro_id uuid not null unique references cadastro.diario_registro_versao(id),
 autor_usuario_id uuid not null references public.usuario(id), publicado_em timestamptz not null default clock_timestamp(),
 chave_idempotencia text not null, digest_idempotencia text not null, primary key(turno_id,versao_passagem), foreign key(turno_id,anterior) references cadastro.diario_turno_passagem(turno_id,versao_passagem), check((versao_passagem=1 and anterior is null) or (versao_passagem>1 and anterior=versao_passagem-1)), unique(autor_usuario_id,chave_idempotencia)
);
create table cadastro.diario_turno_destinatario (
 turno_destinatario_id uuid primary key references cadastro.turno(id),
 turno_origem_id uuid not null unique, versao_passagem_origem integer not null,
 foreign key(turno_origem_id,versao_passagem_origem) references cadastro.diario_turno_passagem(turno_id,versao_passagem),
 paciente_id uuid not null references cadastro.paciente(id), usuario_id uuid not null references public.usuario(id)
);
create table cadastro.diario_ciencia_turno (
 turno_destinatario_id uuid primary key references cadastro.diario_turno_destinatario(turno_destinatario_id),
 usuario_id uuid not null references public.usuario(id), registrada_em timestamptz not null default clock_timestamp(),
 chave_idempotencia text not null, digest_idempotencia text not null, unique(usuario_id,chave_idempotencia)
);
create table operacao.turno_escala_recibo (
 ator_usuario_id uuid not null references public.usuario(id), chave_idempotencia text not null,digest_idempotencia text not null,
 escala_id uuid not null,versao integer not null,primary key(ator_usuario_id,chave_idempotencia),
 foreign key(escala_id,versao) references cadastro.turno_escala_versao(escala_id,versao)
);
create function cadastro.turno_grupo3_imutavel() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'REGISTRO_TURNO_IMUTAVEL'; end $$;
revoke all on function cadastro.turno_grupo3_imutavel() from public,anon,authenticated,service_role;
alter table cadastro.turno_escala_versao enable row level security;
alter table cadastro.turno_escala_versao force row level security;
revoke all on cadastro.turno_escala_versao from public,anon,authenticated,service_role;
create trigger turno_escala_versao_imutavel before update or delete on cadastro.turno_escala_versao for each row execute function cadastro.turno_grupo3_imutavel();
alter table cadastro.diario_turno_passagem enable row level security;
alter table cadastro.diario_turno_passagem force row level security;
revoke all on cadastro.diario_turno_passagem from public,anon,authenticated,service_role;
create trigger diario_turno_passagem_imutavel before update or delete on cadastro.diario_turno_passagem for each row execute function cadastro.turno_grupo3_imutavel();
alter table cadastro.diario_turno_destinatario enable row level security;
alter table cadastro.diario_turno_destinatario force row level security;
revoke all on cadastro.diario_turno_destinatario from public,anon,authenticated,service_role;
create trigger diario_turno_destinatario_imutavel before update or delete on cadastro.diario_turno_destinatario for each row execute function cadastro.turno_grupo3_imutavel();
alter table cadastro.diario_ciencia_turno enable row level security;
alter table cadastro.diario_ciencia_turno force row level security;
revoke all on cadastro.diario_ciencia_turno from public,anon,authenticated,service_role;
create trigger diario_ciencia_turno_imutavel before update or delete on cadastro.diario_ciencia_turno for each row execute function cadastro.turno_grupo3_imutavel();
alter table operacao.turno_escala_recibo enable row level security;
alter table operacao.turno_escala_recibo force row level security;
revoke all on operacao.turno_escala_recibo from public,anon,authenticated,service_role;
create trigger turno_escala_recibo_imutavel before update or delete on operacao.turno_escala_recibo for each row execute function cadastro.turno_grupo3_imutavel();

insert into identidade.configuracao_sistema(id,chave,valor,tipo,rotulo,descricao,exposicao) values
(gen_random_uuid(),'ffcm.turno.area_passagem','""','texto','Área do modelo de passagem','Selecionar rótulo existente nas áreas do Diário. Em branco impede publicação e encerramento.','administracao');
select set_config('ffcmapp.grupo3_migrador',current_user,false);
create role ffcmapp_turno_grupo3_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_turno_grupo3_owner to current_user with inherit false,set true;
grant usage,create on schema api to ffcmapp_turno_grupo3_owner;
grant usage on schema public,cadastro,identidade,operacao,auditoria,auth_privado,bloqueios_auth to ffcmapp_turno_grupo3_owner;
grant execute on function auth_privado.uid(),auth_privado.jwt(),auth_privado.identidades(),auth_privado.sessoes(),bloqueios_auth.travar(uuid,uuid) to ffcmapp_turno_grupo3_owner;
do $$ declare item record; migrador text:=current_user; tinha_set boolean; begin
 for item in select * from (values
  ('ffcmapp_diario_owner','api.diario_privado(jsonb)'),
  ('ffcmapp_atestado_verificador_owner','identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text)')
 ) as alvos(owner_nome,assinatura) loop
  if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure(item.assinatura) and r.rolname=item.owner_nome and not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin and not r.rolcreatedb and not r.rolcreaterole and p.prokind='f' and p.prosecdef and 'search_path=""'=any(p.proconfig)
   and (item.owner_nome='ffcmapp_atestado_verificador_owner' or ('row_security=on'=any(p.proconfig) and p.pronargs=1 and p.proargtypes[0]='jsonb'::regtype and p.prorettype='jsonb'::regtype))) then raise exception 'WRAPPER_INESPERADO: %',item.assinatura; end if;
  tinha_set:=pg_has_role(migrador,item.owner_nome,'SET');
  if not tinha_set then
   if exists(select 1 from pg_auth_members m where m.roleid=item.owner_nome::regrole and m.member=migrador::regrole and m.grantor=migrador::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET'; end if;
   execute format('grant %I to %I with inherit false,set true granted by %I',item.owner_nome,migrador,migrador);
  end if;
  perform set_config('role',item.owner_nome,true);
  execute format('grant execute on function %s to ffcmapp_turno_grupo3_owner',item.assinatura);
  perform set_config('role',migrador,true);
  if not tinha_set then execute format('revoke %I from %I granted by %I',item.owner_nome,migrador,migrador); end if;
 end loop;
end $$;
grant select(id,perfil,ativo) on public.usuario to ffcmapp_turno_grupo3_owner;
create policy grupo3_leitura_0 on public.usuario for select to ffcmapp_turno_grupo3_owner using(true);
grant update(versao) on public.usuario to ffcmapp_turno_grupo3_owner;
create policy grupo3_lock_0 on public.usuario for update to ffcmapp_turno_grupo3_owner using(true) with check(false);
grant select(id,usuario_id,perfil,estado,metodo,subject_google,email_cifrado,criada_em) on identidade.concessao_equipe to ffcmapp_turno_grupo3_owner;
create policy grupo3_leitura_1 on identidade.concessao_equipe for select to ffcmapp_turno_grupo3_owner using(true);
grant update(versao) on identidade.concessao_equipe to ffcmapp_turno_grupo3_owner;
create policy grupo3_lock_1 on identidade.concessao_equipe for update to ffcmapp_turno_grupo3_owner using(true) with check(false);
grant select(session_id,usuario_id,concessao_id,metodo,revogada_em,encerrada_em) on identidade.sessao to ffcmapp_turno_grupo3_owner;
create policy grupo3_leitura_2 on identidade.sessao for select to ffcmapp_turno_grupo3_owner using(true);
grant update(revogada_em) on identidade.sessao to ffcmapp_turno_grupo3_owner;
create policy grupo3_lock_2 on identidade.sessao for update to ffcmapp_turno_grupo3_owner using(true) with check(false);
grant select(dominio_workspace,google_unico_oauth_confirmado) on identidade.configuracao_auth_nativo to ffcmapp_turno_grupo3_owner;
create policy grupo3_leitura_3 on identidade.configuracao_auth_nativo for select to ffcmapp_turno_grupo3_owner using(true);
grant update(dominio_workspace) on identidade.configuracao_auth_nativo to ffcmapp_turno_grupo3_owner;
create policy grupo3_lock_3 on identidade.configuracao_auth_nativo for update to ffcmapp_turno_grupo3_owner using(true) with check(false);
grant select(chave,valor,tipo) on identidade.configuracao_sistema to ffcmapp_turno_grupo3_owner;
create policy grupo3_leitura_4 on identidade.configuracao_sistema for select to ffcmapp_turno_grupo3_owner using(true);
grant update(valor) on identidade.configuracao_sistema to ffcmapp_turno_grupo3_owner;
create policy grupo3_lock_4 on identidade.configuracao_sistema for update to ffcmapp_turno_grupo3_owner using(true) with check(false);
grant select(paciente_id,usuario_id,revogada_em) on cadastro.acesso_paciente to ffcmapp_turno_grupo3_owner;
create policy grupo3_leitura_5 on cadastro.acesso_paciente for select to ffcmapp_turno_grupo3_owner using(true);
grant update(versao) on cadastro.acesso_paciente to ffcmapp_turno_grupo3_owner;
create policy grupo3_lock_5 on cadastro.acesso_paciente for update to ffcmapp_turno_grupo3_owner using(true) with check(false);
grant select(id) on cadastro.paciente to ffcmapp_turno_grupo3_owner;
create policy grupo3_leitura_6 on cadastro.paciente for select to ffcmapp_turno_grupo3_owner using(true);
grant update(versao) on cadastro.paciente to ffcmapp_turno_grupo3_owner;
create policy grupo3_lock_6 on cadastro.paciente for update to ffcmapp_turno_grupo3_owner using(true) with check(false);
grant select(paciente_id,versao,responsavel_usuario_id) on cadastro.acompanhamento_caso to ffcmapp_turno_grupo3_owner;
create policy grupo3_leitura_7 on cadastro.acompanhamento_caso for select to ffcmapp_turno_grupo3_owner using(true);
grant select(id,paciente_id,profissional_usuario_id,aberto_em,encerrado_em,situacao,versao) on cadastro.turno to ffcmapp_turno_grupo3_owner;
create policy grupo3_leitura_8 on cadastro.turno for select to ffcmapp_turno_grupo3_owner using(true);
grant select(id,paciente_id,tipo,autor_usuario_id) on cadastro.diario_registro to ffcmapp_turno_grupo3_owner;
create policy grupo3_leitura_9 on cadastro.diario_registro for select to ffcmapp_turno_grupo3_owner using(true);
grant select(id,diario_registro_id,versao,estado,audiencia,area,conteudo_cifrado,criado_em) on cadastro.diario_registro_versao to ffcmapp_turno_grupo3_owner;
create policy grupo3_leitura_10 on cadastro.diario_registro_versao for select to ffcmapp_turno_grupo3_owner using(true);
grant select,insert on cadastro.turno_escala_versao to ffcmapp_turno_grupo3_owner;
create policy grupo3_turno_escala_versao on cadastro.turno_escala_versao to ffcmapp_turno_grupo3_owner using(true) with check(true);
grant select,insert on cadastro.diario_turno_passagem to ffcmapp_turno_grupo3_owner;
create policy grupo3_diario_turno_passagem on cadastro.diario_turno_passagem to ffcmapp_turno_grupo3_owner using(true) with check(true);
grant select,insert on cadastro.diario_turno_destinatario to ffcmapp_turno_grupo3_owner;
create policy grupo3_diario_turno_destinatario on cadastro.diario_turno_destinatario to ffcmapp_turno_grupo3_owner using(true) with check(true);
grant select,insert on cadastro.diario_ciencia_turno to ffcmapp_turno_grupo3_owner;
create policy grupo3_diario_ciencia_turno on cadastro.diario_ciencia_turno to ffcmapp_turno_grupo3_owner using(true) with check(true);
grant select,insert on operacao.turno_escala_recibo to ffcmapp_turno_grupo3_owner;
create policy grupo3_turno_escala_recibo on operacao.turno_escala_recibo to ffcmapp_turno_grupo3_owner using(true) with check(true);

grant select,insert on cadastro.diario_consulta to ffcmapp_turno_grupo3_owner;
create policy grupo3_consulta on cadastro.diario_consulta for select to ffcmapp_turno_grupo3_owner using(true);
create policy grupo3_consulta_inserir on cadastro.diario_consulta for insert to ffcmapp_turno_grupo3_owner with check(usuario_id=(select auth_privado.uid()));
grant insert(id,ator_usuario_id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_turno_grupo3_owner;
create policy grupo3_auditoria on auditoria.evento for insert to ffcmapp_turno_grupo3_owner with check((ator_usuario_id=(select auth_privado.uid()) and ator_auth_id is null) or (ator_usuario_id is null and ator_auth_id=(select auth_privado.uid()) and resultado='negado'));
-- Owners sem login/sem membership; aplicação só alcança wrapper atestado.
create function operacao.turno_grupo3_privada(p_transporte jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid; paciente uuid; turno uuid; escala uuid;
 inicio timestamptz; fim timestamptz; acao text; autorizado boolean:=false; gestor boolean:=false; concessao uuid; perfil text; sujeito text; google record; dominio text;
 area text; resultado jsonb; t cadastro.turno; escala_atual cadastro.turno_escala_versao; recibo operacao.turno_escala_recibo;
 propria cadastro.diario_turno_passagem; destino cadastro.diario_turno_destinatario; ciencia cadastro.diario_ciencia_turno;
 diario jsonb; de jsonb; da jsonb; diario_resposta jsonb; publicado uuid; diario_id uuid; anterior_ref jsonb; propria_ref jsonb; recebimento jsonb; identidades jsonb; pagina jsonb; proximo jsonb; cursor_escala uuid; cursor_versao integer;
 repeticao boolean:=false; esperada integer; previsto uuid; assumiu uuid; janela_inicio timestamptz; janela_fim timestamptz;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object' or p_transporte-array['entrada','entrada_canonica','dados_canonicos']<>'{}'::jsonb
 or jsonb_typeof(e) is distinct from 'object' or e-array['request_id','paciente_id','cursor_escala_id','cursor_versao','turno_id','escala_id','profissional_previsto_usuario_id','profissional_assumiu_usuario_id','inicio_previsto','fim_previsto','versao_esperada','tipo','motivo','aad_motivo','diario','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb or jsonb_typeof(a) is distinct from 'object' then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 begin
 ator:=auth_privado.uid();sessao:=(auth_privado.jwt()->>'session_id')::uuid;req:=(e->>'request_id')::uuid;paciente:=(e->>'paciente_id')::uuid;turno:=(e->>'turno_id')::uuid;escala:=(e->>'escala_id')::uuid;
 inicio:=(a->>'emitido_em')::timestamptz;fim:=(a->>'expira_em')::timestamptz;acao:=a->>'operacao';
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception using errcode='42501',message='SEM_PERMISSAO'; end;
 if ator is null or sessao is null or req is null or paciente is null or inicio is null or fim is null or acao is null
 or acao not in ('api.consultar_escala_turno','api.criar_escala_turno','api.alterar_escala_turno','api.consultar_passagem_turno','api.publicar_passagem_turno','api.ciencia_passagem_turno')
 or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
 or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
 or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
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
   if found and perfil in ('profissional','administrador') and sujeito=google.provider_id then
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

 perform 1 from identidade.configuracao_sistema where chave='ffcm.turno.ativo' and tipo='booleano' and valor='true'::jsonb for share;
 autorizado:=autorizado and found;
 perform 1 from cadastro.acesso_paciente where paciente_id=paciente and usuario_id=ator and revogada_em is null for share;
 autorizado:=autorizado and found;
 if not autorizado or fim<=clock_timestamp() then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
 perform 1 from cadastro.paciente where id=paciente for update;
 if not found then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
 gestor:=perfil='administrador' and (select h.responsavel_usuario_id from cadastro.acompanhamento_caso h where h.paciente_id=paciente order by h.versao desc limit 1)=ator;
 gestor:=coalesce(gestor,false);
 perform 1 from identidade.configuracao_sistema where chave in ('ffcm.turno.area_passagem','ffcm.diario.areas_sintese','ffcm.diario.ativo') order by chave for share;
 select nullif(valor#>>'{}','') into area from identidade.configuracao_sistema where chave='ffcm.turno.area_passagem' and tipo='texto';
 if acao in ('api.consultar_escala_turno','api.consultar_passagem_turno') then
  if e-array['request_id','paciente_id','turno_id','cursor_escala_id','cursor_versao','atestado']<>'{}'::jsonb or (acao='api.consultar_escala_turno' and e?'turno_id') then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
 else
  if jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256 or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$' then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
 end if;
 if acao in ('api.criar_escala_turno','api.alterar_escala_turno') then
  if not gestor then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
  if escala is null then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
  select * into recibo from operacao.turno_escala_recibo where ator_usuario_id=ator and chave_idempotencia=e->>'chave_idempotencia';
  if found then
   if recibo.digest_idempotencia is distinct from e->>'digest_idempotencia' or recibo.escala_id<>escala then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='conflito_idempotencia';end if;
   select * into strict escala_atual from cadastro.turno_escala_versao where escala_id=recibo.escala_id and versao=recibo.versao and paciente_id=paciente;repeticao:=true;
  else
   select * into escala_atual from cadastro.turno_escala_versao where escala_id=escala order by versao desc limit 1;
   if acao='api.criar_escala_turno' then
    if e-array['request_id','paciente_id','escala_id','profissional_previsto_usuario_id','inicio_previsto','fim_previsto','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb or escala_atual.escala_id is not null then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='conflito';end if;
    begin previsto:=(e->>'profissional_previsto_usuario_id')::uuid;janela_inicio:=(e->>'inicio_previsto')::timestamptz;janela_fim:=(e->>'fim_previsto')::timestamptz;exception when others then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end;
    if previsto is null or janela_inicio is null or janela_fim is null or janela_fim<=janela_inicio then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
    perform 1 from cadastro.acesso_paciente ap join public.usuario u on u.id=ap.usuario_id join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil where ap.paciente_id=paciente and ap.usuario_id=previsto and ap.revogada_em is null and u.ativo and u.perfil='profissional' and c.estado='vinculada' and c.metodo='google_workspace' for share of ap,u,c;
    if not found then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
    insert into cadastro.turno_escala_versao(escala_id,paciente_id,versao,profissional_previsto_usuario_id,inicio_previsto,fim_previsto,tipo,autor_usuario_id) values(escala,paciente,1,previsto,janela_inicio,janela_fim,'previsto',ator) returning * into escala_atual;
   else
    if e-array['request_id','paciente_id','escala_id','profissional_assumiu_usuario_id','tipo','motivo','aad_motivo','versao_esperada','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
    begin esperada:=(e->>'versao_esperada')::integer;assumiu:=(e->>'profissional_assumiu_usuario_id')::uuid;exception when others then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end;
    if escala_atual.escala_id is null or escala_atual.paciente_id<>paciente or esperada is null or esperada<>escala_atual.versao or esperada>=2147483647 then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='conflito';end if;
    if assumiu is null or e->>'tipo' not in ('substituicao','cobertura') or jsonb_typeof(e->'motivo') is distinct from 'object'
     or (e->'motivo')-array['formato','key_id','nonce','ciphertext','tag']<>'{}'::jsonb or e#>'{motivo,formato}' is distinct from '1'::jsonb or coalesce(e#>>'{motivo,ciphertext}','')=''
     or e->'aad_motivo' is distinct from jsonb_build_object('tabela','cadastro.turno_escala_versao','paciente_id',paciente,'escala_id',escala,'versao',esperada+1,'campo','motivo','formato',1) then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
    perform 1 from cadastro.acesso_paciente ap join public.usuario u on u.id=ap.usuario_id join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil where ap.paciente_id=paciente and ap.usuario_id=assumiu and ap.revogada_em is null and u.ativo and u.perfil='profissional' and c.estado='vinculada' and c.metodo='google_workspace' for share of ap,u,c;
    if not found then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
    insert into cadastro.turno_escala_versao(escala_id,paciente_id,versao,anterior,profissional_previsto_usuario_id,profissional_assumiu_usuario_id,inicio_previsto,fim_previsto,tipo,motivo_cifrado,autor_usuario_id) values(escala,paciente,escala_atual.versao+1,escala_atual.versao,escala_atual.profissional_previsto_usuario_id,assumiu,escala_atual.inicio_previsto,escala_atual.fim_previsto,e->>'tipo',e->'motivo',ator) returning * into escala_atual;
   end if;
   insert into operacao.turno_escala_recibo values(ator,e->>'chave_idempotencia',e->>'digest_idempotencia',escala,escala_atual.versao);
  end if;
  resultado:=to_jsonb(escala_atual)-'anterior'-'motivo_cifrado'||jsonb_build_object('motivo',escala_atual.motivo_cifrado);
 elsif acao='api.consultar_escala_turno' then
  begin cursor_escala:=(e->>'cursor_escala_id')::uuid;cursor_versao:=(e->>'cursor_versao')::integer;exception when others then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end;
  if (cursor_escala is null)<>(cursor_versao is null) or cursor_versao<1 then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
  select coalesce(jsonb_agg(to_jsonb(q)-'anterior'-'motivo_cifrado'||jsonb_build_object('motivo',q.motivo_cifrado) order by q.escala_id,q.versao),'[]'::jsonb) into pagina from (select * from cadastro.turno_escala_versao where paciente_id=paciente and (cursor_escala is null or (escala_id,versao)>(cursor_escala,cursor_versao)) order by escala_id,versao limit 50) q;
  if jsonb_array_length(pagina)=50 and exists(select 1 from cadastro.turno_escala_versao where paciente_id=paciente and (escala_id,versao)>((pagina->49->>'escala_id')::uuid,(pagina->49->>'versao')::integer)) then proximo:=jsonb_build_object('escala_id',pagina->49->>'escala_id','versao',pagina->49->'versao');end if;
  select jsonb_build_object('pode_gerir',gestor,'itens',pagina,'proximo_cursor',proximo,'profissionais',case when gestor then coalesce((select jsonb_agg(jsonb_build_object('usuario_id',u.id,'concessao_id',c.id,'email',c.email_cifrado) order by u.id) from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil where u.ativo and u.perfil='profissional' and c.estado='vinculada' and c.metodo='google_workspace' and exists(select 1 from cadastro.acesso_paciente ap where ap.paciente_id=paciente and ap.usuario_id=u.id and ap.revogada_em is null)),'[]'::jsonb) else '[]'::jsonb end) into resultado;
 else
  if e ?| array['cursor_escala_id','cursor_versao'] then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
  if perfil<>'profissional' or turno is null then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
  select id,situacao into t.id,t.situacao from cadastro.turno where id=turno and paciente_id=paciente and profissional_usuario_id=ator;
  if not found then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
  select * into propria from cadastro.diario_turno_passagem where turno_id=turno and paciente_id=paciente and autor_usuario_id=ator order by versao_passagem desc limit 1;
  if acao='api.publicar_passagem_turno' then
   if e-array['request_id','paciente_id','turno_id','versao_esperada','diario','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='conflito';end if;
   if area is null or not exists(select 1 from identidade.configuracao_sistema where chave='ffcm.diario.areas_sintese' and tipo='lista' and valor @> jsonb_build_array(area)) then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='conflito';end if;
   begin esperada:=(e->>'versao_esperada')::integer;exception when others then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end;
   if esperada is null or esperada<0 or esperada>=2147483647 or jsonb_typeof(e->'versao_esperada') is distinct from 'number' then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
   if exists(select 1 from cadastro.diario_turno_passagem where autor_usuario_id=ator and chave_idempotencia=e->>'chave_idempotencia') then
    select * into propria from cadastro.diario_turno_passagem where autor_usuario_id=ator and chave_idempotencia=e->>'chave_idempotencia';
    if propria.turno_id<>turno or propria.paciente_id<>paciente or propria.versao_passagem<>esperada+1 or propria.digest_idempotencia is distinct from e->>'digest_idempotencia' then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='conflito_idempotencia';end if;repeticao:=true;
   else
    if esperada<>coalesce(propria.versao_passagem,0) then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='conflito';end if;
    if t.situacao<>'aberto' then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='conflito';end if;
    diario:=e->'diario';de:=diario->'entrada';da:=de->'atestado';
    if jsonb_typeof(diario) is distinct from 'object' or diario-array['entrada','entrada_canonica','dados_canonicos']<>'{}'::jsonb or jsonb_typeof(de) is distinct from 'object' or jsonb_typeof(da) is distinct from 'object'
    or de->>'request_id' is distinct from req::text or de->>'paciente_id' is distinct from paciente::text or da->>'usuario_id' is distinct from ator::text or da->>'session_id' is distinct from sessao::text or da->>'request_id' is distinct from req::text or da->>'operacao' is distinct from 'api.gravar_diario'
    or de->>'tipo' is distinct from 'evolucao_profissional' or de->>'estado' is distinct from 'publicado' or de->>'audiencia' is distinct from 'equipe' or de->>'area' is distinct from area or de->'versao_esperada' is distinct from '0'::jsonb
    or de->'atencao' is distinct from 'false'::jsonb or de->'retorno_solicitado' is distinct from 'false'::jsonb or de->>'origem_conteudo' is distinct from 'texto' or de ?| array['responde_registro_id','tarefa_id','justificativa','aad_justificativa']
    or de->>'chave_idempotencia' is distinct from e->>'chave_idempotencia' then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
    diario_resposta:=api.diario_privado(diario);
    if diario_resposta->>'ok' is distinct from 'true' then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='conflito';end if;
    publicado:=(diario_resposta#>>'{dados,registro_id}')::uuid;diario_id:=(diario_resposta#>>'{dados,diario_registro_id}')::uuid;
    if diario_resposta#>>'{dados,paciente_id}' is distinct from paciente::text or diario_resposta#>>'{dados,autor_usuario_id}' is distinct from ator::text or diario_resposta#>>'{dados,estado}' is distinct from 'publicado' then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='conflito';end if;
    insert into cadastro.diario_turno_passagem(turno_id,versao_passagem,anterior,paciente_id,diario_registro_id,registro_id,autor_usuario_id,chave_idempotencia,digest_idempotencia) values(turno,esperada+1,nullif(esperada,0),paciente,diario_id,publicado,ator,e->>'chave_idempotencia',e->>'digest_idempotencia') returning * into propria;
   end if;
  end if;
  select * into destino from cadastro.diario_turno_destinatario where turno_destinatario_id=turno and paciente_id=paciente and usuario_id=ator;
  if acao='api.ciencia_passagem_turno' then
   if e-array['request_id','paciente_id','turno_id','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb or destino.turno_destinatario_id is null then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
   select * into ciencia from cadastro.diario_ciencia_turno where turno_destinatario_id=turno;
   if found then
    if ciencia.usuario_id<>ator or ciencia.chave_idempotencia is distinct from e->>'chave_idempotencia' or ciencia.digest_idempotencia is distinct from e->>'digest_idempotencia' then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='conflito_idempotencia';end if;repeticao:=true;
   else insert into cadastro.diario_ciencia_turno values(turno,ator,clock_timestamp(),e->>'chave_idempotencia',e->>'digest_idempotencia') returning * into ciencia;end if;
   resultado:=jsonb_build_object('usuario_id',ciencia.usuario_id,'registrada_em',ciencia.registrada_em);
  else
   if propria.turno_id is not null then
    select jsonb_build_object('turno_aberto_em',origem.aberto_em,'turno_encerrado_em',origem.encerrado_em,'versao_passagem',p.versao_passagem,'registro_id',v.id,'diario_registro_id',p.diario_registro_id,'turno_id',p.turno_id,'autor_usuario_id',p.autor_usuario_id,'publicado_em',p.publicado_em,'conteudo',v.conteudo_cifrado,'versao',v.versao) into propria_ref from cadastro.diario_turno_passagem p join cadastro.turno origem on origem.id=p.turno_id and origem.paciente_id=paciente join cadastro.diario_registro_versao v on v.id=p.registro_id where p.turno_id=turno and p.versao_passagem=propria.versao_passagem and v.estado in ('publicado','retificado');
   end if;
   if acao='api.publicar_passagem_turno' then resultado:=propria_ref;
   else
    if destino.turno_destinatario_id is not null then
     insert into cadastro.diario_consulta(diario_registro_id,usuario_id) select diario_registro_id,ator from cadastro.diario_turno_passagem where turno_id=destino.turno_origem_id and versao_passagem=destino.versao_passagem_origem on conflict do nothing;
     select jsonb_build_object('referencia',jsonb_build_object('turno_aberto_em',origem.aberto_em,'turno_encerrado_em',origem.encerrado_em,'versao_passagem',p.versao_passagem,'registro_id',v.id,'diario_registro_id',p.diario_registro_id,'turno_id',p.turno_id,'autor_usuario_id',p.autor_usuario_id,'publicado_em',p.publicado_em,'conteudo',v.conteudo_cifrado,'versao',v.versao),'turno_destinatario_id',destino.turno_destinatario_id,'ciencia',(select jsonb_build_object('usuario_id',c.usuario_id,'registrada_em',c.registrada_em) from cadastro.diario_ciencia_turno c where c.turno_destinatario_id=turno)) into anterior_ref from cadastro.diario_turno_passagem p join cadastro.turno origem on origem.id=p.turno_id and origem.paciente_id=paciente join cadastro.diario_registro_versao v on v.id=p.registro_id where p.turno_id=destino.turno_origem_id and p.versao_passagem=destino.versao_passagem_origem and p.paciente_id=paciente and v.estado in ('publicado','retificado');
    end if;
    select jsonb_build_object('turno_destinatario_id',d.turno_destinatario_id,'usuario_id',d.usuario_id,'consultado_em',c.consultado_em,'ciencia',(select jsonb_build_object('usuario_id',s.usuario_id,'registrada_em',s.registrada_em) from cadastro.diario_ciencia_turno s where s.turno_destinatario_id=d.turno_destinatario_id)) into recebimento from cadastro.diario_turno_destinatario d left join cadastro.diario_consulta c on c.diario_registro_id=propria.diario_registro_id and c.usuario_id=d.usuario_id where d.turno_origem_id=turno and d.paciente_id=paciente;
    resultado:=jsonb_build_object('propria',propria_ref,'anterior',anterior_ref,'area_passagem',area,'recebimento',recebimento);
   end if;
  end if;
 end if;
 if acao in ('api.consultar_escala_turno','api.consultar_passagem_turno') then
  with usuarios as (
   select distinct x::uuid usuario_id from (
    select item->>'autor_usuario_id' x from jsonb_array_elements(case when acao='api.consultar_escala_turno' then resultado->'itens' else '[]'::jsonb end) item
    union select item->>'profissional_previsto_usuario_id' from jsonb_array_elements(case when acao='api.consultar_escala_turno' then resultado->'itens' else '[]'::jsonb end) item
    union select item->>'profissional_assumiu_usuario_id' from jsonb_array_elements(case when acao='api.consultar_escala_turno' then resultado->'itens' else '[]'::jsonb end) item
    union select resultado#>>'{propria,autor_usuario_id}' where acao='api.consultar_passagem_turno'
    union select resultado#>>'{anterior,referencia,autor_usuario_id}' where acao='api.consultar_passagem_turno'
    union select resultado#>>'{anterior,ciencia,usuario_id}' where acao='api.consultar_passagem_turno'
    union select resultado#>>'{recebimento,usuario_id}' where acao='api.consultar_passagem_turno'
   ) a where x is not null
  ) select coalesce(jsonb_agg(jsonb_build_object('usuario_id',u.usuario_id,'concessao_id',c.id,'email',c.email_cifrado) order by u.usuario_id),'[]'::jsonb) into identidades from usuarios u left join lateral(select id,email_cifrado from identidade.concessao_equipe where usuario_id=u.usuario_id order by criada_em desc,id desc limit 1) c on true;
  resultado:=resultado||jsonb_build_object('identidades',identidades);
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
 return jsonb_build_object('ok',true,'repeticao',repeticao,'dados',resultado,'request_id',req);
end $$;
revoke all on function operacao.turno_grupo3_privada(jsonb) from public,anon,authenticated,service_role;
grant execute on function operacao.turno_grupo3_privada(jsonb) to ffcmapp_turno_grupo3_owner;
set role ffcmapp_turno_grupo3_owner;
create function api.turno_grupo3_privado(p_transporte jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare ator uuid:=auth_privado.uid();req uuid;paciente uuid;sessao uuid;acao text;codigo text;detalhe text;
begin
 begin return operacao.turno_grupo3_privada(p_transporte);
 exception when others then
  get stacked diagnostics detalhe=pg_exception_detail;
  codigo:=case when sqlstate='PZ057' and detalhe in ('sem_permissao','conflito','conflito_idempotencia','servico_indisponivel') then detalhe when sqlstate in ('42501','22023') then 'sem_permissao' when sqlstate in ('23505','23503','23514') then 'conflito' else 'servico_indisponivel' end;
 end;
 begin req:=(p_transporte#>>'{entrada,request_id}')::uuid;paciente:=(p_transporte#>>'{entrada,paciente_id}')::uuid;sessao:=(auth_privado.jwt()->>'session_id')::uuid;exception when others then raise exception using errcode='42501',message='SEM_PERMISSAO';end;
 if ator is null or req is null or sessao is null or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='42501',message='SEM_PERMISSAO';end if;
 acao:=p_transporte#>>'{entrada,atestado,operacao}';if acao is null or acao not in ('api.consultar_escala_turno','api.criar_escala_turno','api.alterar_escala_turno','api.consultar_passagem_turno','api.publicar_passagem_turno','api.ciencia_passagem_turno') then acao:='api.consultar_passagem_turno';end if;
 if exists(select 1 from public.usuario where id=ator) then insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
 else insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);end if;
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA';end if;
 return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo',codigo),'request_id',req);
end $$;
revoke all on function api.turno_grupo3_privado(jsonb) from public,anon,authenticated,service_role;
-- Wrapper único com ACL estreita; flag de turno deve continuar fechada na migração.
do $$ begin
 if not exists(select 1 from identidade.configuracao_sistema where chave='ffcm.turno.ativo' and valor='false'::jsonb) then raise exception 'TURNO_DEVE_PERMANECER_DESLIGADO';end if;
 if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='api.turno_grupo3_privado(jsonb)'::regprocedure and r.rolname='ffcmapp_turno_grupo3_owner' and not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin and p.prosecdef and 'search_path=""'=any(p.proconfig) and 'row_security=on'=any(p.proconfig)) then raise exception 'WRAPPER_GRUPO3_INESPERADO';end if;
end $$;
grant execute on function api.turno_grupo3_privado(jsonb) to authenticated;
reset role;
select set_config('role',current_setting('ffcmapp.grupo3_migrador'),false);
revoke create on schema api from ffcmapp_turno_grupo3_owner;
revoke ffcmapp_turno_grupo3_owner from current_user;

-- Extensão estreita do owner de turno para encerramento e destinatário operacional.
-- Policy aditiva: preserva abertura e admite somente requisição própria de encerramento.
create policy turno_requisicao_encerrar on operacao.requisicao for all to ffcmapp_turno_owner using(ator_usuario_id=(select auth_privado.uid()) and operacao='api.encerrar_turno') with check(ator_usuario_id=(select auth_privado.uid()) and operacao='api.encerrar_turno');
grant select(tipo) on identidade.configuracao_sistema to ffcmapp_turno_owner;
create policy turno_area_passagem_config on identidade.configuracao_sistema for select to ffcmapp_turno_owner using(chave='ffcm.turno.area_passagem');
-- Metadados de origem necessários somente para derivar destinatário; nenhuma listagem pública.
create policy turno_origem_passagem on cadastro.turno for select to ffcmapp_turno_owner using(exists(select 1 from cadastro.paciente p where p.id=paciente_id));
grant update(situacao,encerrado_em,versao) on cadastro.turno to ffcmapp_turno_owner;
create policy turno_encerramento on cadastro.turno for update to ffcmapp_turno_owner using(profissional_usuario_id=(select auth_privado.uid())) with check(profissional_usuario_id=(select auth_privado.uid()) and situacao='encerrado');
grant select on cadastro.diario_turno_passagem,cadastro.diario_turno_destinatario to ffcmapp_turno_owner;
grant insert on cadastro.diario_turno_destinatario to ffcmapp_turno_owner;
create policy turno_passagem_select on cadastro.diario_turno_passagem for select to ffcmapp_turno_owner using(exists(select 1 from cadastro.paciente p where p.id=paciente_id));
create policy turno_destino_select on cadastro.diario_turno_destinatario for select to ffcmapp_turno_owner using(exists(select 1 from cadastro.paciente p where p.id=paciente_id));
create policy turno_destino_insert on cadastro.diario_turno_destinatario for insert to ffcmapp_turno_owner with check(usuario_id=(select auth_privado.uid()) and exists(select 1 from cadastro.turno t where t.id=turno_destinatario_id and t.profissional_usuario_id=(select auth_privado.uid()) and t.paciente_id=diario_turno_destinatario.paciente_id));
grant select(id,paciente_id,tipo,autor_usuario_id) on cadastro.diario_registro to ffcmapp_turno_owner;
grant select(id,diario_registro_id,versao,estado,area) on cadastro.diario_registro_versao to ffcmapp_turno_owner;
create policy turno_diario_select on cadastro.diario_registro for select to ffcmapp_turno_owner using(exists(select 1 from cadastro.paciente p where p.id=paciente_id));
create policy turno_diario_versao_select on cadastro.diario_registro_versao for select to ffcmapp_turno_owner using(exists(select 1 from cadastro.diario_registro r where r.id=diario_registro_id));
create or replace function operacao.turno_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare
 e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid; sessao uuid; req uuid;
 paciente uuid; turno uuid; reserva uuid; geracao bigint; inicio timestamptz; fim timestamptz;
 concessao uuid; perfil text; sujeito text; google record; dominio text; autorizado boolean:=false;
 acao text; resultado jsonb; codigo text; parametros jsonb; duracao text; tolerancia text; tratamento text;
 b operacao.barreira_turno; r operacao.reserva_turno; anterior operacao.requisicao; t cadastro.turno; novo boolean:=false;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
  or p_transporte-array['entrada','entrada_canonica','dados_canonicos']<>'{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object'
  or e-array['request_id','paciente_id','turno_id','reserva_id','geracao_reserva','versao_esperada','sintese_registro_id','modo','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb
  or jsonb_typeof(a) is distinct from 'object' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 begin
  ator:=auth_privado.uid(); sessao:=(auth_privado.jwt()->>'session_id')::uuid;
  req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid; turno:=(e->>'turno_id')::uuid;
  reserva:=(e->>'reserva_id')::uuid; geracao:=(e->>'geracao_reserva')::bigint;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz; acao:=a->>'operacao';
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end;
 if ator is null or sessao is null or req is null or paciente is null or (turno is null and acao is distinct from 'api.consultar_turno') or inicio is null or fim is null
  or acao is null or acao not in ('api.abrir_turno','api.encerrar_turno','api.consultar_turno')
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
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
 perform 1 from identidade.configuracao_sistema where chave='ffcm.turno.ativo' and valor='true'::jsonb for share;
 autorizado:=autorizado and found;
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
 -- Vínculo e identidade foram travados antes do paciente/barreira.
 perform 1 from cadastro.paciente where id=paciente for update;
 if not found then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 if acao='api.consultar_turno' then
  if e->>'modo'='ultimo' then
   if e-array['request_id','paciente_id','modo','atestado']<>'{}'::jsonb then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
   select * into t from cadastro.turno where paciente_id=paciente and profissional_usuario_id=ator order by aberto_em desc,id desc limit 1;
  elsif not (e ? 'turno_id') then
   -- Consulta atual: só esta forma estrita dispensa UUID. Autor vem do Auth;
   -- identidade, vínculo, flag e locks já foram conferidos antes da consulta.
   if e-array['request_id','paciente_id','atestado']<>'{}'::jsonb then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
   select * into t from cadastro.turno where paciente_id=paciente and profissional_usuario_id=ator and situacao='aberto';
  else
   if turno is null or e-array['request_id','paciente_id','turno_id','atestado']<>'{}'::jsonb then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
   select * into t from cadastro.turno where id=turno and paciente_id=paciente and profissional_usuario_id=ator;
  end if;
  -- Ausente e turno alheio retornam a mesma resposta, sem expor existência.
 elsif acao='api.encerrar_turno' then
  if e-array['request_id','paciente_id','turno_id','reserva_id','geracao_reserva','versao_esperada','sintese_registro_id','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb
   or reserva is null or geracao is null or geracao<1 or geracao>9007199254740991
   or jsonb_typeof(e->'versao_esperada') is distinct from 'number' or coalesce(e->>'versao_esperada','')!~'^[1-9][0-9]{0,9}$'
   or (e->>'versao_esperada')::bigint>=2147483647 or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$'
   or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256 then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
  -- Paciente exclusivo serializa publicação/retificação/responsável antes de barreira/turno.
  select * into b from operacao.barreira_turno where ator_usuario_id=ator for update;
  select * into r from operacao.reserva_turno re where re.id=reserva and re.ator_usuario_id=ator and re.epoca=geracao and re.paciente_reservado_id=paciente and re.turno_reservada_id=turno and re.versao_esperada=(e->>'versao_esperada')::integer for update;
  select * into t from cadastro.turno where id=turno and paciente_id=paciente and profissional_usuario_id=ator for update;
  if t.id is null or r.id is null or b.epoca is distinct from geracao or b.reserva_atual is distinct from reserva or b.resultado_pendente is not null
   or r.estado not in ('aberta','confirmada')
   or not exists(select 1 from cadastro.diario_turno_passagem p join cadastro.diario_registro dr on dr.id=p.diario_registro_id join cadastro.diario_registro_versao dv on dv.id=p.registro_id
     where p.turno_id=turno and p.paciente_id=paciente and p.autor_usuario_id=ator and p.registro_id::text=e->>'sintese_registro_id' and p.versao_passagem=(select max(z.versao_passagem) from cadastro.diario_turno_passagem z where z.turno_id=turno)
     and dr.paciente_id=paciente and dr.autor_usuario_id=ator and dr.tipo='evolucao_profissional' and dv.estado in ('publicado','retificado')
     and dv.versao=(select max(x.versao) from cadastro.diario_registro_versao x where x.diario_registro_id=p.diario_registro_id)
     and exists(select 1 from identidade.configuracao_sistema c where c.chave='ffcm.turno.area_passagem' and c.tipo='texto' and c.valor#>>'{}'=dv.area)) then codigo:='conflito';
  elsif r.estado='confirmada' then
   if r.chave_idempotencia is distinct from e->>'chave_idempotencia' or r.digest_idempotencia is distinct from e->>'digest_idempotencia' or t.situacao<>'encerrado' or t.versao<>(e->>'versao_esperada')::integer+1 then codigo:='conflito_idempotencia';end if;
  elsif t.situacao<>'aberto' or t.versao<>(e->>'versao_esperada')::integer then codigo:='conflito';
  else
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',turno,t.versao+1) on conflict(ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   novo:=found;
   if not novo then codigo:='conflito_idempotencia';
   else
    update cadastro.turno set situacao='encerrado',encerrado_em=clock_timestamp(),versao=versao+1 where id=turno and profissional_usuario_id=ator and situacao='aberto' and versao=(e->>'versao_esperada')::integer returning * into t;
    if not found then raise exception using errcode='P0002',message='ENCERRAMENTO_NAO_CONFIRMADO';end if;
    update operacao.reserva_turno set estado='confirmada',chave_idempotencia=e->>'chave_idempotencia',digest_idempotencia=e->>'digest_idempotencia',paciente_id=paciente,turno_resultado_id=turno where id=reserva;
    if not found then raise exception using errcode='P0002',message='RESERVA_NAO_CONFIRMADA';end if;
   end if;
  end if;
 else
  if e-array['request_id','paciente_id','turno_id','reserva_id','geracao_reserva','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb
   or reserva is null or geracao is null or geracao<1 or geracao>9007199254740991
   or jsonb_typeof(e->'geracao_reserva') is distinct from 'number' or coalesce(e->>'geracao_reserva','')!~'^[1-9][0-9]*$'
   or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$' then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
  end if;
  select * into b from operacao.barreira_turno where ator_usuario_id=ator for update;
  select * into r from operacao.reserva_turno re where re.id=reserva and re.ator_usuario_id=ator and re.epoca=geracao
   and re.paciente_reservado_id=paciente and re.turno_reservada_id=turno and re.versao_esperada=0 for update;
  if not found or b.epoca is distinct from geracao or b.reserva_atual is distinct from reserva or b.resultado_pendente is not null
   or r.estado not in ('aberta','confirmada') then codigo:='conflito';
  elsif r.estado='confirmada' and (r.chave_idempotencia is distinct from e->>'chave_idempotencia' or r.digest_idempotencia is distinct from e->>'digest_idempotencia') then codigo:='conflito_idempotencia';
  else
   insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
    values(gen_random_uuid(),ator,acao,e->>'chave_idempotencia',e->>'digest_idempotencia','concluida',turno,1)
    on conflict(ator_usuario_id,operacao,chave_idempotencia) do nothing returning * into anterior;
   novo:=found;
   if not novo then
    select * into anterior from operacao.requisicao re where re.ator_usuario_id=ator and re.operacao=acao and re.chave_idempotencia=e->>'chave_idempotencia';
    if anterior.digest_entrada is distinct from e->>'digest_idempotencia' or anterior.resultado_id is distinct from turno or anterior.estado<>'concluida' then codigo:='conflito_idempotencia';
    else
     select * into t from cadastro.turno where id=turno and paciente_id=paciente and profissional_usuario_id=ator;
     if not found then codigo:='conflito_idempotencia'; end if;
    end if;
   else
    -- Ler e travar as três linhas em ordem estável evita snapshot misturado com edição.
    perform 1 from identidade.configuracao_sistema where chave in ('ffcm.turno.duracao_padrao_minutos','ffcm.turno.tolerancia_atraso_minutos','ffcm.turno.tratamento_nao_encerrado') order by chave for share;
    select valor#>>'{}' into duracao from identidade.configuracao_sistema where chave='ffcm.turno.duracao_padrao_minutos';
    select valor#>>'{}' into tolerancia from identidade.configuracao_sistema where chave='ffcm.turno.tolerancia_atraso_minutos';
    select valor#>>'{}' into tratamento from identidade.configuracao_sistema where chave='ffcm.turno.tratamento_nao_encerrado';
    if coalesce(duracao,'')!~'^[1-9][0-9]{0,8}$' or coalesce(tolerancia,'')!~'^(0|[1-9][0-9]{0,8})$' or tratamento is distinct from 'sinalizar_pendencia' then codigo:='conflito';
    else
     parametros:=jsonb_build_object('duracao_padrao_minutos',duracao::integer,'tolerancia_atraso_minutos',tolerancia::integer,'tratamento_nao_encerrado',tratamento);
     begin
      insert into cadastro.turno(id,paciente_id,profissional_usuario_id,parametros) values(turno,paciente,ator,parametros) returning * into t;
      -- Primeira abertura sucessora efetiva é destinatária; nenhum cliente informa usuário.
      insert into cadastro.diario_turno_destinatario(turno_destinatario_id,turno_origem_id,versao_passagem_origem,paciente_id,usuario_id)
       select turno,p.turno_id,p.versao_passagem,paciente,ator from cadastro.diario_turno_passagem p join cadastro.turno origem on origem.id=p.turno_id
       where p.paciente_id=paciente and origem.id=(select z.id from cadastro.turno z where z.paciente_id=paciente and z.situacao='encerrado' and z.encerrado_em<=t.aberto_em order by z.encerrado_em desc,z.id desc limit 1) and p.versao_passagem=(select max(z.versao_passagem) from cadastro.diario_turno_passagem z where z.turno_id=p.turno_id) and origem.situacao='encerrado' and origem.encerrado_em<=t.aberto_em
        and not exists(select 1 from cadastro.diario_turno_destinatario d where d.turno_origem_id=p.turno_id)
       order by origem.encerrado_em desc,origem.id desc,p.versao_passagem desc limit 1;
     exception when unique_violation then codigo:='conflito'; end;
    end if;
    if codigo is not null then delete from operacao.requisicao where id=anterior.id; end if;
   end if;
   if codigo is null and r.estado='aberta' then
    update operacao.reserva_turno set estado='confirmada',chave_idempotencia=e->>'chave_idempotencia',digest_idempotencia=e->>'digest_idempotencia',paciente_id=paciente,turno_resultado_id=turno where id=reserva;
    if not found then raise exception using errcode='P0002',message='RESERVA_NAO_CONFIRMADA'; end if;
   end if;
  end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,acao,'paciente',paciente,case when codigo is null then 'permitido' else 'negado' end,req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA'; end if;
 if codigo is not null then return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo',codigo),'request_id',req); end if;
 resultado:=case when t.id is null then null else jsonb_build_object('turno_id',t.id,'paciente_id',t.paciente_id,'profissional_usuario_id',t.profissional_usuario_id,'aberto_em',t.aberto_em,'encerrado_em',t.encerrado_em,'situacao',t.situacao,'versao',t.versao,'parametros',t.parametros) end;
 return jsonb_build_object('ok',true,'repeticao',acao in ('api.abrir_turno','api.encerrar_turno') and not novo,'dados',resultado,'request_id',req);
end $$;
