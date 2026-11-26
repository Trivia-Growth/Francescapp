-- FR-058/059/060/061/064. Local preparation; no remote execution or activation.
begin;
create role ffcmapp_turno_execucao_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_turno_execucao_owner to current_user with inherit false,set true;
grant create on schema api to ffcmapp_turno_execucao_owner;
grant usage on schema api,cadastro,operacao,identidade,auditoria,auth_privado,bloqueios_auth,public to ffcmapp_turno_execucao_owner;
grant execute on function auth_privado.uid(),auth_privado.jwt(),auth_privado.sessoes(),bloqueios_auth.travar(uuid,uuid) to ffcmapp_turno_execucao_owner;
-- Preserve pre-existing memberships and grantors while delegating narrow helpers.
do $$ declare x record; migrador text:=current_user; tinha boolean; begin
 for x in select * from (values
 ('ffcmapp_acessos_owner','identidade.contexto_acesso_vigente(boolean)'),
 ('ffcmapp_sessao_familiar_owner','api.consultar_sessao_familiar_nativa(uuid)'),
 ('ffcmapp_atestado_verificador_owner','identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text)'),
 ('ffcmapp_tarefa_owner','api.tarefa_cuidado_privado(jsonb)'),
 ('ffcmapp_tarefa_owner','api.ler_tarefas_cuidado_privado(jsonb)'),
 ('ffcmapp_diario_owner','api.diario_privado(jsonb)')) v(owner_nome,assinatura) loop
  if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure(x.assinatura) and r.rolname=x.owner_nome and not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin and p.prosecdef and 'search_path=""'=any(p.proconfig)) then raise exception 'WRAPPER_INESPERADO: %',x.assinatura;end if;
  tinha:=pg_has_role(migrador,x.owner_nome,'SET');
  if not tinha then
   if exists(select 1 from pg_auth_members where roleid=x.owner_nome::regrole and member=migrador::regrole and grantor=migrador::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
   execute format('grant %I to %I with inherit false,set true granted by %I',x.owner_nome,migrador,migrador);
  end if;
  perform set_config('role',x.owner_nome,true);execute format('grant execute on function %s to ffcmapp_turno_execucao_owner',x.assinatura);perform set_config('role',migrador,true);
  if not tinha then execute format('revoke %I from %I granted by %I',x.owner_nome,migrador,migrador);end if;
 end loop;
end $$;
alter table cadastro.acesso_paciente add column execucao_medicacao_concedida boolean not null default true;
-- Concession follows the live case link; no role/token alone confers medication access.
create table cadastro.turno_catalogo_medida(
 tipo text primary key, classe text not null check(classe in ('afericao','rotina')), unidade text,
 ativo boolean not null default true, referencia_informativa text,
 check(tipo in ('pressao_sistolica','pressao_diastolica','frequencia_cardiaca','frequencia_respiratoria','temperatura','saturacao_oxigenio','glicemia_capilar','dor','refeicao','hidratacao','sono','eliminacao')),
 check(referencia_informativa is null or length(referencia_informativa)<=300)
);
insert into cadastro.turno_catalogo_medida(tipo,classe,unidade) values
 ('pressao_sistolica','afericao','mmHg'),('pressao_diastolica','afericao','mmHg'),('frequencia_cardiaca','afericao','bpm'),('frequencia_respiratoria','afericao','irpm'),('temperatura','afericao','°C'),('saturacao_oxigenio','afericao','%'),('glicemia_capilar','afericao','mg/dL'),('dor','afericao','0-10'),
 ('refeicao','rotina',null),('hidratacao','rotina','mL'),('sono','rotina',null),('eliminacao','rotina',null);
create table cadastro.turno_execucao_registro(
 id uuid primary key, paciente_id uuid not null references cadastro.paciente(id), turno_id uuid references cadastro.turno(id),
 classe text not null check(classe in ('afericao','rotina','prescricao','administracao','ocorrencia')),
 autor_usuario_id uuid not null references public.usuario(id),
 check((classe='prescricao')=(turno_id is null)), unique(id,paciente_id),unique(id,classe)
);
create table cadastro.turno_medida_versao(
 registro_id uuid not null references cadastro.turno_execucao_registro(id), versao integer not null check(versao>0), anterior integer,
 tipo text not null references cadastro.turno_catalogo_medida(tipo), instante_ocorrencia timestamptz not null,
 valor numeric,unidade text,momento text,aceitacao text,inicio timestamptz,fim timestamptz,qualidade text,eliminacao text,contagem integer,
 observacao jsonb,motivo jsonb,autor_usuario_id uuid not null references public.usuario(id),registrado_em timestamptz not null default clock_timestamp(),
 primary key(registro_id,versao),foreign key(registro_id,anterior) references cadastro.turno_medida_versao(registro_id,versao),
 check((versao=1 and anterior is null and motivo is null) or (versao>1 and anterior=versao-1 and motivo is not null)),
 check(valor is null or valor::text not in ('NaN','Infinity','-Infinity')),
 check(coalesce((tipo='refeicao' and momento in ('cafe','almoco','lanche','jantar','ceia') and aceitacao in ('total','parcial','minima','recusou') and valor is null and inicio is null and contagem is null)
 or (tipo='hidratacao' and valor>=0 and unidade='mL' and momento is null and inicio is null and contagem is null)
 or (tipo='sono' and inicio is not null and fim>=inicio and qualidade in ('tranquilo','agitado','nao_dormiu') and valor is null and momento is null and contagem is null)
 or (tipo='eliminacao' and eliminacao in ('urina','fezes') and contagem>=0 and valor is null and momento is null and inicio is null)
 or (tipo not in ('refeicao','hidratacao','sono','eliminacao') and valor is not null and unidade is not null and momento is null and inicio is null and contagem is null),false)),
 check(tipo<>'dor' or valor between 0 and 10)
);
create table cadastro.turno_prescricao_versao(
 registro_id uuid not null references cadastro.turno_execucao_registro(id), versao integer not null check(versao>0),anterior integer,
 nome jsonb not null,dose jsonb not null,via jsonb not null,fonte_documental jsonb not null,horarios time[] not null,
 vigencia_inicio timestamptz not null,vigencia_fim timestamptz,motivo jsonb,
 autor_usuario_id uuid not null references public.usuario(id),registrado_em timestamptz not null default clock_timestamp(),
 primary key(registro_id,versao),foreign key(registro_id,anterior) references cadastro.turno_prescricao_versao(registro_id,versao),
 check(cardinality(horarios) between 1 and 48),check(vigencia_fim is null or vigencia_fim>=vigencia_inicio),
 check((versao=1 and anterior is null and motivo is null) or (versao>1 and anterior=versao-1 and motivo is not null))
);
create table cadastro.turno_administracao_versao(
 registro_id uuid not null references cadastro.turno_execucao_registro(id),versao integer not null check(versao>0),anterior integer,
 item_id uuid not null,item_versao integer not null,executor_nome jsonb not null,executor_vinculo jsonb not null,
 situacao text not null check(situacao in ('administrado','recusado','adiado','nao_administrado')),motivo_situacao jsonb,motivo jsonb,
 registrador_usuario_id uuid not null references public.usuario(id),registrado_em timestamptz not null default clock_timestamp(),
 primary key(registro_id,versao),foreign key(registro_id,anterior) references cadastro.turno_administracao_versao(registro_id,versao),
 foreign key(item_id,item_versao) references cadastro.turno_prescricao_versao(registro_id,versao),
 check(situacao='administrado' or motivo_situacao is not null),
 check((versao=1 and anterior is null and motivo is null) or (versao>1 and anterior=versao-1 and motivo is not null))
);
create table cadastro.turno_ocorrencia_versao(
 registro_id uuid not null references cadastro.turno_execucao_registro(id),versao integer not null check(versao>0),anterior integer,
 instante_ocorrencia timestamptz not null,descricao jsonb not null,providencia jsonb not null,anexo_documento_id uuid,motivo jsonb,
 autor_usuario_id uuid not null references public.usuario(id),registrado_em timestamptz not null default clock_timestamp(),
 primary key(registro_id,versao),foreign key(registro_id,anterior) references cadastro.turno_ocorrencia_versao(registro_id,versao),
 check((versao=1 and anterior is null and motivo is null) or (versao>1 and anterior=versao-1 and motivo is not null))
);
create table operacao.turno_execucao_recibo(
 ator_usuario_id uuid not null references public.usuario(id),chave text not null,digest text not null,
 registro_id uuid not null references cadastro.turno_execucao_registro(id),versao integer not null,
 primary key(ator_usuario_id,chave),check(length(chave) between 16 and 200),check(digest~'^[A-Za-z0-9_-]{43}$')
);
create table operacao.turno_ocorrencia_conversao(
 ocorrencia_id uuid primary key,ocorrencia_versao integer not null,paciente_id uuid not null references cadastro.paciente(id),
 tarefa_id uuid not null unique references cadastro.tarefa_cuidado(id),evolucao_id uuid not null unique references cadastro.diario_registro(id),
 ator_usuario_id uuid not null references public.usuario(id),registrado_em timestamptz not null default clock_timestamp(),
 chave text not null,digest text not null,unique(ator_usuario_id,chave),
 foreign key(ocorrencia_id,ocorrencia_versao) references cadastro.turno_ocorrencia_versao(registro_id,versao)
);
create index turno_execucao_caso_idx on cadastro.turno_execucao_registro(paciente_id,classe,id);
create index turno_execucao_turno_idx on cadastro.turno_execucao_registro(turno_id,id);
create index turno_medida_instante_idx on cadastro.turno_medida_versao(instante_ocorrencia,registro_id,versao);
create index turno_ocorrencia_instante_idx on cadastro.turno_ocorrencia_versao(instante_ocorrencia,registro_id,versao);
alter table cadastro.turno_catalogo_medida enable row level security;
alter table cadastro.turno_catalogo_medida force row level security;
revoke all on cadastro.turno_catalogo_medida from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_catalogo_medida to ffcmapp_turno_execucao_owner;
create policy execucao_turno_catalogo_medida on cadastro.turno_catalogo_medida to ffcmapp_turno_execucao_owner using(true) with check(true);
alter table cadastro.turno_execucao_registro enable row level security;
alter table cadastro.turno_execucao_registro force row level security;
revoke all on cadastro.turno_execucao_registro from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_execucao_registro to ffcmapp_turno_execucao_owner;
create policy execucao_turno_execucao_registro on cadastro.turno_execucao_registro to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_execucao_registro_imutavel before update or delete on cadastro.turno_execucao_registro for each row execute function cadastro.turno_grupo3_imutavel();
alter table cadastro.turno_medida_versao enable row level security;
alter table cadastro.turno_medida_versao force row level security;
revoke all on cadastro.turno_medida_versao from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_medida_versao to ffcmapp_turno_execucao_owner;
create policy execucao_turno_medida_versao on cadastro.turno_medida_versao to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_medida_versao_imutavel before update or delete on cadastro.turno_medida_versao for each row execute function cadastro.turno_grupo3_imutavel();
alter table cadastro.turno_prescricao_versao enable row level security;
alter table cadastro.turno_prescricao_versao force row level security;
revoke all on cadastro.turno_prescricao_versao from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_prescricao_versao to ffcmapp_turno_execucao_owner;
create policy execucao_turno_prescricao_versao on cadastro.turno_prescricao_versao to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_prescricao_versao_imutavel before update or delete on cadastro.turno_prescricao_versao for each row execute function cadastro.turno_grupo3_imutavel();
alter table cadastro.turno_administracao_versao enable row level security;
alter table cadastro.turno_administracao_versao force row level security;
revoke all on cadastro.turno_administracao_versao from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_administracao_versao to ffcmapp_turno_execucao_owner;
create policy execucao_turno_administracao_versao on cadastro.turno_administracao_versao to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_administracao_versao_imutavel before update or delete on cadastro.turno_administracao_versao for each row execute function cadastro.turno_grupo3_imutavel();
alter table cadastro.turno_ocorrencia_versao enable row level security;
alter table cadastro.turno_ocorrencia_versao force row level security;
revoke all on cadastro.turno_ocorrencia_versao from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_ocorrencia_versao to ffcmapp_turno_execucao_owner;
create policy execucao_turno_ocorrencia_versao on cadastro.turno_ocorrencia_versao to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_ocorrencia_versao_imutavel before update or delete on cadastro.turno_ocorrencia_versao for each row execute function cadastro.turno_grupo3_imutavel();
alter table operacao.turno_execucao_recibo enable row level security;
alter table operacao.turno_execucao_recibo force row level security;
revoke all on operacao.turno_execucao_recibo from public,anon,authenticated,service_role;
grant select,insert on operacao.turno_execucao_recibo to ffcmapp_turno_execucao_owner;
create policy execucao_turno_execucao_recibo on operacao.turno_execucao_recibo to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_execucao_recibo_imutavel before update or delete on operacao.turno_execucao_recibo for each row execute function cadastro.turno_grupo3_imutavel();
alter table operacao.turno_ocorrencia_conversao enable row level security;
alter table operacao.turno_ocorrencia_conversao force row level security;
revoke all on operacao.turno_ocorrencia_conversao from public,anon,authenticated,service_role;
grant select,insert on operacao.turno_ocorrencia_conversao to ffcmapp_turno_execucao_owner;
create policy execucao_turno_ocorrencia_conversao on operacao.turno_ocorrencia_conversao to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_ocorrencia_conversao_imutavel before update or delete on operacao.turno_ocorrencia_conversao for each row execute function cadastro.turno_grupo3_imutavel();
grant execute on function cadastro.turno_grupo3_imutavel() to ffcmapp_turno_execucao_owner;
grant update(ativo,referencia_informativa) on cadastro.turno_catalogo_medida to ffcmapp_turno_execucao_owner;
grant select(paciente_id,usuario_id,revogada_em,execucao_medicacao_concedida) on cadastro.acesso_paciente to ffcmapp_turno_execucao_owner;
create policy execucao_leitura_cadastro_acesso_paciente on cadastro.acesso_paciente for select to ffcmapp_turno_execucao_owner using(true);
grant update(versao) on cadastro.acesso_paciente to ffcmapp_turno_execucao_owner;
create policy execucao_lock_cadastro_acesso_paciente on cadastro.acesso_paciente for update to ffcmapp_turno_execucao_owner using(true) with check(false);
grant select(id) on cadastro.paciente to ffcmapp_turno_execucao_owner;
create policy execucao_leitura_cadastro_paciente on cadastro.paciente for select to ffcmapp_turno_execucao_owner using(true);
grant update(versao) on cadastro.paciente to ffcmapp_turno_execucao_owner;
create policy execucao_lock_cadastro_paciente on cadastro.paciente for update to ffcmapp_turno_execucao_owner using(true) with check(false);
grant select(id,paciente_id,profissional_usuario_id,aberto_em,encerrado_em,situacao,versao,parametros) on cadastro.turno to ffcmapp_turno_execucao_owner;
create policy execucao_leitura_cadastro_turno on cadastro.turno for select to ffcmapp_turno_execucao_owner using(true);
grant update(versao) on cadastro.turno to ffcmapp_turno_execucao_owner;
create policy execucao_lock_cadastro_turno on cadastro.turno for update to ffcmapp_turno_execucao_owner using(true) with check(false);
grant select(chave,valor,tipo) on identidade.configuracao_sistema to ffcmapp_turno_execucao_owner;
create policy execucao_leitura_identidade_configuracao_sistema on identidade.configuracao_sistema for select to ffcmapp_turno_execucao_owner using(true);
grant update(valor) on identidade.configuracao_sistema to ffcmapp_turno_execucao_owner;
create policy execucao_lock_identidade_configuracao_sistema on identidade.configuracao_sistema for update to ffcmapp_turno_execucao_owner using(true) with check(false);
grant select(paciente_id,versao,responsavel_usuario_id) on cadastro.acompanhamento_caso to ffcmapp_turno_execucao_owner;
create policy execucao_leitura_cadastro_acompanhamento_caso on cadastro.acompanhamento_caso for select to ffcmapp_turno_execucao_owner using(true);
grant select(id,perfil,ativo),update(versao) on public.usuario to ffcmapp_turno_execucao_owner;
create policy execucao_leitura_public_usuario on public.usuario for select to ffcmapp_turno_execucao_owner using(true);
create policy execucao_lock_public_usuario on public.usuario for update to ffcmapp_turno_execucao_owner using(true) with check(false);
grant select(id,paciente_id) on cadastro.tarefa_cuidado to ffcmapp_turno_execucao_owner;
create policy execucao_leitura_cadastro_tarefa_cuidado on cadastro.tarefa_cuidado for select to ffcmapp_turno_execucao_owner using(true);
grant select(id,paciente_id) on cadastro.diario_registro to ffcmapp_turno_execucao_owner;
create policy execucao_leitura_cadastro_diario_registro on cadastro.diario_registro for select to ffcmapp_turno_execucao_owner using(true);
grant insert(id,ator_usuario_id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_turno_execucao_owner;
create policy execucao_auditoria on auditoria.evento for insert to ffcmapp_turno_execucao_owner with check((ator_usuario_id=(select auth_privado.uid()) and ator_auth_id is null) or (ator_usuario_id is null and ator_auth_id=(select auth_privado.uid()) and resultado='negado'));
grant select(usuario_id) on identidade.acesso_gerenciado to ffcmapp_turno_execucao_owner;
create policy execucao_gerenciado_existente on identidade.acesso_gerenciado for select to ffcmapp_turno_execucao_owner using(usuario_id=(select auth_privado.uid()));
create function operacao.contexto_execucao_turno(p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare ctx jsonb;familiar jsonb;
begin
 ctx:=identidade.contexto_acesso_vigente(false);
 if ctx is not null then return ctx;end if;
 -- Only the legacy, admitted family method may use its existing dedicated authority.
 -- A failed managed account never falls back to legacy authentication.
 if exists(select 1 from identidade.acesso_gerenciado where usuario_id=auth_privado.uid()) then return null;end if;
 familiar:=api.consultar_sessao_familiar_nativa(p_request);
 if familiar#>>'{usuario,id}' is distinct from auth_privado.uid()::text or familiar#>>'{usuario,perfil}' is distinct from 'familia' or familiar->>'session_id' is distinct from auth_privado.jwt()->>'session_id' then return null;end if;
 return jsonb_build_object('usuario_id',auth_privado.uid(),'session_id',familiar->'session_id','perfil','familia','metodo','familia');
end $$;
revoke all on function operacao.contexto_execucao_turno(uuid) from public,anon,authenticated,service_role;
grant execute on function operacao.contexto_execucao_turno(uuid) to ffcmapp_turno_execucao_owner;
-- Every future operation shares this authority check; context helper has no technical bypass.
create function operacao.autorizar_execucao_turno(p_transporte jsonb,p_acoes text[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e jsonb:=p_transporte->'entrada';a jsonb:=e->'atestado';ctx jsonb;ator uuid:=auth_privado.uid();sid uuid;req uuid;paciente_alvo uuid;inicio timestamptz;fim timestamptz;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object' or p_transporte-array['entrada','entrada_canonica','dados_canonicos']<>'{}'::jsonb or jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(a) is distinct from 'object' then raise insufficient_privilege;end if;
 sid:=(auth_privado.jwt()->>'session_id')::uuid;req:=(e->>'request_id')::uuid;paciente_alvo:=(e->>'paciente_id')::uuid;inicio:=(a->>'emitido_em')::timestamptz;fim:=(a->>'expira_em')::timestamptz;
 if ator is null or sid is null or req is null or paciente_alvo is null or inicio is null or fim is null
 or not coalesce(a->>'operacao'=any(p_acoes),false) or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sid::text or a->>'request_id' is distinct from req::text
 or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
 or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then raise insufficient_privilege;end if;
 ctx:=operacao.contexto_execucao_turno(req);
 if ctx is null then raise insufficient_privilege;end if;
 perform 1 from cadastro.acesso_paciente where paciente_id=paciente_alvo and usuario_id=ator and revogada_em is null for share;
 if not found then raise insufficient_privilege;end if;
 perform 1 from identidade.configuracao_sistema where chave='ffcm.turno.ativo' and tipo='booleano' and valor='true'::jsonb for share;
 if not found then raise insufficient_privilege;end if;
 -- Target access must precede patient lock, matching revocation order.
 if a->>'operacao' in ('api.gravar_fundamento_turno','api.consultar_fundamento_turno') and e ? 'familiar_usuario_id' then
  perform 1 from cadastro.acesso_paciente where paciente_id=paciente_alvo and usuario_id=(e->>'familiar_usuario_id')::uuid and revogada_em is null for share;
  if not found then raise insufficient_privilege;end if;
 end if;
 if a->>'operacao'='api.conceder_medicacao_turno' then
  perform 1 from cadastro.acesso_paciente where paciente_id=paciente_alvo and usuario_id=(e->>'usuario_id')::uuid and revogada_em is null for update;
  if not found then raise insufficient_privilege;end if;
 end if;
 perform 1 from cadastro.paciente where id=paciente_alvo for update;
 if not found or fim<=clock_timestamp() then raise insufficient_privilege;end if;
 return ctx;
end $$;
revoke all on function operacao.autorizar_execucao_turno(jsonb,text[]) from public,anon,authenticated,service_role;
grant execute on function operacao.autorizar_execucao_turno(jsonb,text[]) to ffcmapp_turno_execucao_owner;
-- Envelopes carry authenticated field-specific AAD, including original turn and version.
create function operacao.validar_cifra_execucao(p_cifra jsonb,p_aad jsonb,p_paciente uuid,p_turno uuid,p_registro uuid,p_versao integer,p_tabela text,p_campo text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p_cifra)='object' and p_cifra-array['formato','key_id','nonce','ciphertext','tag']='{}'::jsonb and p_cifra->'formato'='1'::jsonb
 and length(p_cifra->>'key_id') between 1 and 128 and p_cifra->>'nonce'~'^[A-Za-z0-9_-]+$' and p_cifra->>'ciphertext'~'^[A-Za-z0-9_-]+$' and p_cifra->>'tag'~'^[A-Za-z0-9_-]+$'
 and length(p_cifra->>'ciphertext')<=32768 and p_aad=jsonb_build_object('tabela',p_tabela,'paciente_id',p_paciente,'turno_id',p_turno,'registro_id',p_registro,'versao',p_versao,'campo',p_campo,'formato',1),false)
$$;
revoke all on function operacao.validar_cifra_execucao(jsonb,jsonb,uuid,uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function operacao.validar_cifra_execucao(jsonb,jsonb,uuid,uuid,uuid,integer,text,text) to ffcmapp_turno_execucao_owner;

grant update(execucao_medicacao_concedida) on cadastro.acesso_paciente to ffcmapp_turno_execucao_owner;
create policy execucao_concessao_medicacao on cadastro.acesso_paciente for update to ffcmapp_turno_execucao_owner using(true) with check(true);
create view cadastro.turno_execucao_serie with(security_invoker=true) as
 select r.*,m.versao,m.instante_ocorrencia,m.registrado_em,(to_jsonb(m)-'registro_id')||jsonb_build_object('retificada',m.versao>1) as dados from cadastro.turno_execucao_registro r join cadastro.turno_medida_versao m on m.registro_id=r.id
 union all select r.*,m.versao,m.registrado_em,m.registrado_em,(to_jsonb(m)-'registro_id')||jsonb_build_object('retificada',m.versao>1) from cadastro.turno_execucao_registro r join cadastro.turno_prescricao_versao m on m.registro_id=r.id
 union all select r.*,m.versao,(select v1.registrado_em from cadastro.turno_administracao_versao v1 where v1.registro_id=m.registro_id and v1.versao=1),m.registrado_em,(to_jsonb(m)-'registro_id')||jsonb_build_object('retificada',m.versao>1,'prescricao_referenciada',(select jsonb_build_object('registro_id',p.registro_id,'versao',p.versao,'paciente_id',r.paciente_id,'turno_id',null,'dados',to_jsonb(p)-'registro_id') from cadastro.turno_prescricao_versao p where p.registro_id=m.item_id and p.versao=m.item_versao)) from cadastro.turno_execucao_registro r join cadastro.turno_administracao_versao m on m.registro_id=r.id
 union all select r.*,m.versao,m.instante_ocorrencia,m.registrado_em,(to_jsonb(m)-'registro_id')||jsonb_build_object('retificada',m.versao>1) from cadastro.turno_execucao_registro r join cadastro.turno_ocorrencia_versao m on m.registro_id=r.id;
revoke all on cadastro.turno_execucao_serie from public,anon,authenticated,service_role;
grant select on cadastro.turno_execucao_serie to ffcmapp_turno_execucao_owner;
create function operacao.execucao_turno_privada(p_transporte jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare e jsonb:=p_transporte->'entrada';a jsonb:=e->'atestado';ctx jsonb;ator uuid:=auth_privado.uid();paciente uuid;req uuid;acao text;
 classe text;d jsonb;payload jsonb;registro uuid;versao integer;esperada integer;t cadastro.turno;r cadastro.turno_execucao_registro;recibo operacao.turno_execucao_recibo;
 tabela text;campos text[];campo text;envelope jsonb;colunas text;resultado jsonb;itens jsonb;proximo jsonb;quantidade integer;limite integer;inicio timestamptz;fim timestamptz;instante timestamptz;turno uuid;atual integer;
 autorizacao jsonb;tarefa jsonb;diario jsonb;filho record;resposta jsonb;tarefa_id uuid;evolucao_id uuid;conversao operacao.turno_ocorrencia_conversao;repeticao boolean:=false;identidades jsonb:='[]'::jsonb;ids uuid[];
begin
 ctx:=operacao.autorizar_execucao_turno(p_transporte,array['api.gravar_execucao_turno','api.consultar_execucao_turno','api.consultar_catalogo_turno','api.configurar_catalogo_turno','api.conceder_medicacao_turno','api.consultar_concessoes_medicacao_turno','api.consultar_conversao_ocorrencia_turno','api.converter_ocorrencia_turno']);
 paciente:=(e->>'paciente_id')::uuid;req:=(e->>'request_id')::uuid;acao:=a->>'operacao';
 -- Family reads have their own explicit foundation gate in the report wrapper.
 if ctx->>'perfil' not in ('profissional','administrador') then raise insufficient_privilege;end if;
 if acao='api.consultar_concessoes_medicacao_turno' then
  if e-array['request_id','paciente_id','cursor_id','limite','atestado']<>'{}'::jsonb or coalesce((e->>'limite')::integer,25) not between 1 and 100 then raise invalid_parameter_value;end if;
  resultado:=operacao.candidatos_turno(paciente,'profissional',(e->>'cursor_id')::uuid,coalesce((e->>'limite')::integer,25))||jsonb_build_object('pode_gerir',ctx->>'perfil'='administrador' or (ctx->>'perfil'='profissional' and exists(select 1 from cadastro.acompanhamento_caso x where x.paciente_id=paciente and x.responsavel_usuario_id=ator and x.versao=(select max(z.versao) from cadastro.acompanhamento_caso z where z.paciente_id=paciente))));
 elsif acao='api.conceder_medicacao_turno' then
  if e-array['request_id','paciente_id','usuario_id','concedida','atestado']<>'{}'::jsonb or jsonb_typeof(e->'concedida') is distinct from 'boolean'
   or not(ctx->>'perfil'='administrador' or (ctx->>'perfil'='profissional' and exists(select 1 from cadastro.acompanhamento_caso x where x.paciente_id=paciente and x.responsavel_usuario_id=ator and x.versao=(select max(z.versao) from cadastro.acompanhamento_caso z where z.paciente_id=paciente)))) then raise insufficient_privilege;end if;
  perform 1 from cadastro.acesso_paciente where paciente_id=paciente and usuario_id=(e->>'usuario_id')::uuid and revogada_em is null for update;
  if not found then raise insufficient_privilege;end if;
  update cadastro.acesso_paciente set execucao_medicacao_concedida=(e->>'concedida')::boolean where paciente_id=paciente and usuario_id=(e->>'usuario_id')::uuid and revogada_em is null;
  resultado:=jsonb_build_object('usuario_id',e->'usuario_id','concedida',e->'concedida');
 elsif acao in ('api.consultar_catalogo_turno','api.configurar_catalogo_turno') then
  if acao='api.configurar_catalogo_turno' then
   if e-array['request_id','paciente_id','tipo','ativo','referencia_informativa','atestado']<>'{}'::jsonb or ctx->>'perfil'<>'administrador' or jsonb_typeof(e->'ativo') is distinct from 'boolean' or (e ? 'referencia_informativa' and jsonb_typeof(e->'referencia_informativa') not in ('string','null')) then raise insufficient_privilege;end if;
   update cadastro.turno_catalogo_medida set ativo=(e->>'ativo')::boolean,referencia_informativa=e->>'referencia_informativa' where tipo=e->>'tipo';
   if not found then raise invalid_parameter_value;end if;
  elsif e-array['request_id','paciente_id','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by tipo),'[]'::jsonb) into resultado from cadastro.turno_catalogo_medida c;
 elsif acao='api.consultar_execucao_turno' then
  if e-array['request_id','paciente_id','classe','inicio','fim','vigente_em','turno_id','registro_id','historico','cursor_instante','cursor_id','cursor_versao','limite','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
  classe:=e->>'classe';inicio:=(e->>'inicio')::timestamptz;fim:=(e->>'fim')::timestamptz;turno:=(e->>'turno_id')::uuid;limite:=coalesce((e->>'limite')::integer,25);
  if (coalesce((e->>'historico')::boolean,false) and not(e ? 'registro_id')) or classe is null or classe not in ('afericao','rotina','prescricao','administracao','ocorrencia') or (not(e ? 'registro_id') and not(classe='prescricao' and e ? 'vigente_em') and (inicio is null or fim is null or fim<=inicio)) or (e ? 'vigente_em' and (classe<>'prescricao' or (e->>'vigente_em')::timestamptz is null)) or limite not between 1 and 100
   or (num_nonnulls(e->>'cursor_instante',e->>'cursor_id',e->>'cursor_versao') not in (0,3)) then raise invalid_parameter_value;end if;
  with pagina as (select s.* from cadastro.turno_execucao_serie s where s.paciente_id=paciente and s.classe=classe
    and (not coalesce((e->>'historico')::boolean,false) and s.versao=(select max(z.versao) from cadastro.turno_execucao_serie z where z.id=s.id and (not(e ? 'vigente_em') or z.registrado_em<=(e->>'vigente_em')::timestamptz)) or coalesce((e->>'historico')::boolean,false) and s.id=(e->>'registro_id')::uuid)
    and (not(e ? 'registro_id') or s.id=(e->>'registro_id')::uuid) and ((e ? 'registro_id') or (e ? 'vigente_em' and classe='prescricao' and (s.dados->>'vigencia_inicio')::timestamptz<=(e->>'vigente_em')::timestamptz and (s.dados->>'vigencia_fim' is null or (s.dados->>'vigencia_fim')::timestamptz>=(e->>'vigente_em')::timestamptz)) or (not(e ? 'vigente_em') and s.instante_ocorrencia>=inicio and s.instante_ocorrencia<fim)) and (turno is null or s.turno_id=turno)
    and (not(e ? 'cursor_id') or (s.instante_ocorrencia,s.id,s.versao)>((e->>'cursor_instante')::timestamptz,(e->>'cursor_id')::uuid,(e->>'cursor_versao')::integer))
    order by s.instante_ocorrencia,s.id,s.versao limit limite+1), numerada as(select *,row_number() over(order by instante_ocorrencia,id,versao) n from pagina)
   select coalesce(jsonb_agg(to_jsonb(linha)-'n' order by instante_ocorrencia,id,versao) filter(where linha.n<=limite),'[]'::jsonb),count(*) into itens,quantidade from numerada linha;
  if quantidade>limite then proximo:=jsonb_build_object('instante',itens->(limite-1)->'instante_ocorrencia','id',itens->(limite-1)->'id','versao',itens->(limite-1)->'versao');end if;
  resultado:=jsonb_build_object('itens',itens,'proximo_cursor',proximo);
 elsif acao='api.consultar_conversao_ocorrencia_turno' then
  if e-array['request_id','paciente_id','registro_id','autorizacao_tarefa','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
  autorizacao:=e->'autorizacao_tarefa';
  if autorizacao#>>'{entrada,paciente_id}' is distinct from paciente::text or autorizacao#>>'{entrada,request_id}' is distinct from req::text or autorizacao#>>'{entrada,atestado,usuario_id}' is distinct from ator::text or autorizacao#>>'{entrada,atestado,session_id}' is distinct from ctx->>'session_id' or autorizacao#>>'{entrada,atestado,operacao}' is distinct from 'api.ler_tarefas_cuidado' or autorizacao#>'{entrada,autorizacao_somente}' is distinct from 'true'::jsonb or (autorizacao->'entrada')-array['request_id','paciente_id','autorizacao_somente','atestado']<>'{}'::jsonb then raise insufficient_privilege;end if;
  resposta:=api.ler_tarefas_cuidado_privado(autorizacao);
  if resposta->>'ok' is distinct from 'true' or resposta->'dados' is distinct from '[]'::jsonb then raise insufficient_privilege;end if;
  registro:=(e->>'registro_id')::uuid;
  if not exists(select 1 from cadastro.turno_execucao_registro raiz where raiz.id=registro and raiz.paciente_id=paciente and raiz.classe='ocorrencia') then raise insufficient_privilege;end if;
  select to_jsonb(c)-array['chave','digest'] into resultado from operacao.turno_ocorrencia_conversao c where c.ocorrencia_id=registro and c.paciente_id=paciente;
 elsif acao='api.converter_ocorrencia_turno' then
  if e-array['request_id','paciente_id','registro_id','versao_esperada','chave_idempotencia','digest_idempotencia','autorizacao_tarefa','tarefa','diario','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
  registro:=(e->>'registro_id')::uuid;esperada:=(e->>'versao_esperada')::integer;
  select * into r from cadastro.turno_execucao_registro raiz where raiz.id=registro and raiz.paciente_id=paciente and raiz.classe='ocorrencia';
  if not found then raise insufficient_privilege;end if;
  select max(v.versao) into atual from cadastro.turno_ocorrencia_versao v where v.registro_id=registro;
  if atual is distinct from esperada then raise exception using errcode='PZ064',message='conflito';end if;
  autorizacao:=e->'autorizacao_tarefa';tarefa:=e->'tarefa';diario:=e->'diario';
  for filho in select * from (values(autorizacao,'api.ler_tarefas_cuidado'),(tarefa,'api.gravar_tarefa_cuidado'),(diario,'api.gravar_diario')) v(transporte,acao_filha) loop
   if filho.transporte#>>'{entrada,paciente_id}' is distinct from paciente::text or filho.transporte#>>'{entrada,request_id}' is distinct from req::text
    or filho.transporte#>>'{entrada,atestado,usuario_id}' is distinct from ator::text or filho.transporte#>>'{entrada,atestado,session_id}' is distinct from ctx->>'session_id'
    or filho.transporte#>>'{entrada,atestado,operacao}' is distinct from filho.acao_filha then raise insufficient_privilege;end if;
  end loop;
  if autorizacao#>'{entrada,autorizacao_somente}' is distinct from 'true'::jsonb or (autorizacao->'entrada')-array['request_id','paciente_id','autorizacao_somente','atestado']<>'{}'::jsonb then raise insufficient_privilege;end if;
  resposta:=api.ler_tarefas_cuidado_privado(autorizacao);
  if resposta->>'ok' is distinct from 'true' or resposta->'dados' is distinct from '[]'::jsonb then raise insufficient_privilege;end if;
  if length(coalesce(e->>'chave_idempotencia','')) not between 16 and 200 or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$' then raise invalid_parameter_value;end if;
  select * into conversao from operacao.turno_ocorrencia_conversao where ocorrencia_id=registro;
  if found then
   if conversao.digest is distinct from e->>'digest_idempotencia' or conversao.ator_usuario_id<>ator then raise exception using errcode='PZ064',message='conflito_idempotencia';end if;
   repeticao:=true;
  else
   tarefa_id:=(tarefa#>>'{entrada,tarefa_id}')::uuid;evolucao_id:=(diario#>>'{entrada,diario_registro_id}')::uuid;
   if tarefa_id is null or evolucao_id is null or tarefa#>'{entrada,versao_esperada}' is distinct from '0'::jsonb or diario#>'{entrada,versao_esperada}' is distinct from '0'::jsonb
    or tarefa#>>'{entrada,chave_idempotencia}' is distinct from e->>'chave_idempotencia' or diario#>>'{entrada,chave_idempotencia}' is distinct from e->>'chave_idempotencia'
    or diario#>>'{entrada,tipo}' is distinct from 'evolucao_profissional' or diario#>>'{entrada,estado}' is distinct from 'publicado' or diario#>>'{entrada,audiencia}' is distinct from 'equipe'
    or diario#>'{entrada,atencao}' is distinct from 'true'::jsonb or diario#>'{entrada,retorno_solicitado}' is distinct from 'false'::jsonb or diario#>>'{entrada,origem_conteudo}' is distinct from 'texto'
    or diario#>>'{entrada,tarefa_id}' is distinct from tarefa_id::text or (diario->'entrada') ?| array['responde_registro_id','justificativa','aad_justificativa']
    or exists(select 1 from cadastro.tarefa_cuidado where id=tarefa_id) or exists(select 1 from cadastro.diario_registro where id=evolucao_id) then raise invalid_parameter_value;end if;
   resposta:=api.tarefa_cuidado_privado(tarefa);
   if resposta->>'ok' is distinct from 'true' or resposta#>>'{dados,registro_id}' is distinct from tarefa#>>'{entrada,registro_id}' or resposta#>>'{dados,tarefa_id}' is distinct from tarefa_id::text or resposta#>>'{dados,paciente_id}' is distinct from paciente::text or resposta#>'{dados,versao}' is distinct from '1'::jsonb then raise exception using errcode='PZ064',message='conflito';end if;
   resposta:=api.diario_privado(diario);
   if resposta->>'ok' is distinct from 'true' or resposta->'repeticao' is distinct from 'false'::jsonb or resposta#>>'{dados,registro_id}' is distinct from diario#>>'{entrada,registro_id}' or resposta#>>'{dados,diario_registro_id}' is distinct from evolucao_id::text or resposta#>>'{dados,paciente_id}' is distinct from paciente::text or resposta#>'{dados,versao}' is distinct from '1'::jsonb then raise exception using errcode='PZ064',message='conflito';end if;
   insert into operacao.turno_ocorrencia_conversao(ocorrencia_id,ocorrencia_versao,paciente_id,tarefa_id,evolucao_id,ator_usuario_id,chave,digest) values(registro,esperada,paciente,tarefa_id,evolucao_id,ator,e->>'chave_idempotencia',e->>'digest_idempotencia') returning * into conversao;
  end if;
  resultado:=to_jsonb(conversao)-array['chave','digest'];
 else
  if e-array['request_id','paciente_id','registro_id','versao','versao_esperada','conteudo','motivo','aad','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb or ctx->>'perfil'<>'profissional' then raise insufficient_privilege;end if;
  if jsonb_typeof(e->'conteudo') is distinct from 'object' or (e->'conteudo')-array['classe','dados']<>'{}'::jsonb then raise invalid_parameter_value;end if;
  classe:=e#>>'{conteudo,classe}';d:=e#>'{conteudo,dados}';registro:=(e->>'registro_id')::uuid;versao:=(e->>'versao')::integer;esperada:=(e->>'versao_esperada')::integer;
  if registro is null or esperada is null or esperada<0 or versao is null or versao<>esperada+1 or versao<1 or classe is null or classe not in ('afericao','prescricao','administracao','ocorrencia','rotina') or jsonb_typeof(d) is distinct from 'object'
   or length(coalesce(e->>'chave_idempotencia','')) not between 16 and 200 or coalesce(e->>'chave_idempotencia','')!~'^[A-Za-z0-9_-]+$' or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$'
   or (versao=1 and e ? 'motivo') or (versao>1 and not(e ? 'motivo')) then raise invalid_parameter_value;end if;
  turno:=(d->>'turno_id')::uuid;
  if classe<>'prescricao' then
   select * into t from cadastro.turno where id=turno and paciente_id=paciente and profissional_usuario_id=ator and situacao='aberto' for share;
   if not found then raise insufficient_privilege;end if;
  elsif turno is not null then raise invalid_parameter_value;end if;
  if classe in ('prescricao','administracao') then
   perform 1 from cadastro.acesso_paciente where paciente_id=paciente and usuario_id=ator and revogada_em is null and execucao_medicacao_concedida for share;
   if not found then raise insufficient_privilege;end if;
  end if;
  tabela:=case classe when 'afericao' then 'cadastro.turno_medida_versao' when 'rotina' then 'cadastro.turno_medida_versao' when 'prescricao' then 'cadastro.turno_prescricao_versao' when 'administracao' then 'cadastro.turno_administracao_versao' else 'cadastro.turno_ocorrencia_versao' end;
  select * into r from cadastro.turno_execucao_registro where id=registro;
  if found and (r.paciente_id<>paciente or r.classe<>classe or (classe<>'prescricao' and r.autor_usuario_id<>ator) or r.turno_id is distinct from turno) then raise insufficient_privilege;end if;
  -- Authorization, live concession and turn state precede idempotent replay.
  select * into recibo from operacao.turno_execucao_recibo where ator_usuario_id=ator and chave=e->>'chave_idempotencia';
  if found then
   if recibo.digest is distinct from e->>'digest_idempotencia' or recibo.registro_id<>registro or recibo.versao<>versao then raise exception using errcode='PZ064',message='conflito_idempotencia';end if;
   repeticao:=true;
  else
   execute format('select max(versao) from %s where registro_id=$1',tabela) into atual using registro;
   if coalesce(atual,0)<>esperada then raise exception using errcode='PZ064',message='conflito';end if;
   payload:=jsonb_build_object('registro_id',registro,'versao',versao,'anterior',case when versao=1 then null else esperada end,'autor_usuario_id',ator,'motivo',e->'motivo');
   campos:=array['motivo'];
   if classe='afericao' then
    if d-array['turno_id','tipo','valor','unidade','instante_afericao']<>'{}'::jsonb or jsonb_typeof(d->'valor') is distinct from 'number' then raise invalid_parameter_value;end if;
    instante:=(d->>'instante_afericao')::timestamptz;
    perform 1 from cadastro.turno_catalogo_medida catalogo where catalogo.tipo=d->>'tipo' and catalogo.classe='afericao' and catalogo.ativo and catalogo.unidade=d->>'unidade' for share;
    if not found then raise invalid_parameter_value;end if;
    payload:=payload||jsonb_build_object('tipo',d->'tipo','valor',d->'valor','unidade',d->'unidade','instante_ocorrencia',instante);
   elsif classe='rotina' then
    instante:=(d->>'instante_ocorrencia')::timestamptz;
    perform 1 from cadastro.turno_catalogo_medida catalogo where catalogo.tipo=d->>'tipo' and catalogo.classe='rotina' and catalogo.ativo for share;
    if not found then raise invalid_parameter_value;end if;
    campos:=campos||array['observacao'];
    if d->>'tipo'='refeicao' then
     if d-array['tipo','turno_id','instante_ocorrencia','momento','aceitacao','observacao']<>'{}'::jsonb or d->>'momento' is null or d->>'aceitacao' is null then raise invalid_parameter_value;end if;
     payload:=payload||jsonb_build_object('momento',d->'momento','aceitacao',d->'aceitacao');
    elsif d->>'tipo'='hidratacao' then
     if d-array['tipo','turno_id','instante_ocorrencia','mililitros','observacao']<>'{}'::jsonb or jsonb_typeof(d->'mililitros') is distinct from 'number' then raise invalid_parameter_value;end if;
     payload:=payload||jsonb_build_object('valor',d->'mililitros','unidade','mL');
    elsif d->>'tipo'='sono' then
     if d-array['tipo','turno_id','instante_ocorrencia','inicio','fim','qualidade','observacao']<>'{}'::jsonb or d->>'inicio' is null or d->>'fim' is null or d->>'qualidade' is null or (d->>'inicio')::timestamptz<t.aberto_em or (d->>'fim')::timestamptz>clock_timestamp() then raise invalid_parameter_value;end if;
     payload:=payload||jsonb_build_object('inicio',d->'inicio','fim',d->'fim','qualidade',d->'qualidade');
    elsif d->>'tipo'='eliminacao' then
     if d-array['tipo','turno_id','instante_ocorrencia','eliminacao','contagem','observacao']<>'{}'::jsonb or d->>'eliminacao' is null or jsonb_typeof(d->'contagem') is distinct from 'number' or d->>'contagem'!~'^[0-9]+$' then raise invalid_parameter_value;end if;
     payload:=payload||jsonb_build_object('eliminacao',d->'eliminacao','contagem',d->'contagem');
    else raise invalid_parameter_value;end if;
    payload:=payload||jsonb_build_object('tipo',d->'tipo','instante_ocorrencia',instante,'observacao',d->'observacao');
   elsif classe='prescricao' then
    if d-array['nome','dose','via','horarios','vigencia_inicio','vigencia_fim','fonte_documental']<>'{}'::jsonb or jsonb_typeof(d->'horarios') is distinct from 'array' or d->>'vigencia_inicio' is null or not(d ? 'vigencia_fim') then raise invalid_parameter_value;end if;
    if exists(select 1 from jsonb_array_elements_text(d->'horarios') v where v!~'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$') then raise invalid_parameter_value;end if;
    campos:=campos||array['nome','dose','via','fonte_documental'];payload:=payload||d;
   elsif classe='administracao' then
    if d-array['turno_id','item_id','versao','executor','situacao','motivo']<>'{}'::jsonb or jsonb_typeof(d->'executor') is distinct from 'object' or (d->'executor')-array['nome','vinculo']<>'{}'::jsonb then raise invalid_parameter_value;end if;
    if versao>1 then
     if not exists(select 1 from cadastro.turno_administracao_versao original join cadastro.turno_execucao_registro pr on pr.id=original.item_id where original.registro_id=registro and original.versao=1 and original.item_id=(d->>'item_id')::uuid and original.item_versao=(d->>'versao')::integer and pr.paciente_id=paciente and pr.classe='prescricao') then raise insufficient_privilege;end if;
    else
     perform 1 from cadastro.turno_prescricao_versao v join cadastro.turno_execucao_registro p on p.id=v.registro_id where p.id=(d->>'item_id')::uuid and p.paciente_id=paciente and p.classe='prescricao' and v.versao=(d->>'versao')::integer
      and v.versao=(select max(x.versao) from cadastro.turno_prescricao_versao x where x.registro_id=p.id) and v.vigencia_inicio<=clock_timestamp() and (v.vigencia_fim is null or v.vigencia_fim>=clock_timestamp());
     if not found then raise insufficient_privilege;end if;
    end if;
    campos:=campos||array['executor_nome','executor_vinculo','motivo_situacao'];
    payload:=payload-'autor_usuario_id'||jsonb_build_object('item_id',d->'item_id','item_versao',d->'versao','executor_nome',d#>'{executor,nome}','executor_vinculo',d#>'{executor,vinculo}','situacao',d->'situacao','motivo_situacao',d->'motivo','registrador_usuario_id',ator);
   else
    if d-array['turno_id','descricao','instante_ocorrencia','providencia','anexo_documento_id']<>'{}'::jsonb then raise invalid_parameter_value;end if;
    -- New attachments are authorized by the private metadata FK added in 230000.
    if d ? 'anexo_documento_id' then raise invalid_parameter_value;end if;
    instante:=(d->>'instante_ocorrencia')::timestamptz;campos:=campos||array['descricao','providencia'];payload:=payload||(d-'turno_id');
   end if;
   if classe in ('afericao','rotina','ocorrencia') and (instante is null or instante<t.aberto_em or instante>clock_timestamp()) then raise invalid_parameter_value;end if;
   foreach campo in array campos loop
    envelope:=case when campo='motivo' then e->'motivo' else payload->campo end;
    if envelope is null or envelope='null'::jsonb then
     if campo in ('nome','dose','via','fonte_documental','executor_nome','executor_vinculo','descricao','providencia') then raise invalid_parameter_value;end if;
    elsif not operacao.validar_cifra_execucao(envelope,e->'aad'->campo,paciente,turno,registro,versao,tabela,campo) then raise invalid_parameter_value;end if;
   end loop;
   if r.id is null then insert into cadastro.turno_execucao_registro(id,paciente_id,turno_id,classe,autor_usuario_id) values(registro,paciente,turno,classe,ator);end if;
   -- Only allowlisted table names. Populate typed columns; unknown input keys were rejected above.
   select string_agg(quote_ident(key),',') into colunas from jsonb_object_keys(payload) key;
   execute format('insert into %s(%s) select %s from jsonb_populate_record(null::%s,$1) returning to_jsonb(%s.*)',tabela,colunas,colunas,tabela,split_part(tabela,'.',2)) into resultado using payload;
   insert into operacao.turno_execucao_recibo(ator_usuario_id,chave,digest,registro_id,versao) values(ator,e->>'chave_idempotencia',e->>'digest_idempotencia',registro,versao);
  end if;
  select to_jsonb(s) into resultado from cadastro.turno_execucao_serie s where s.id=registro and s.versao=versao;
 end if;
 if (a->>'expira_em')::timestamptz<=clock_timestamp() or operacao.contexto_execucao_turno(req) is null then raise insufficient_privilege;end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 if acao='api.consultar_execucao_turno' then
  select array_agg(distinct usuario) into ids from (select (v->>'autor_usuario_id')::uuid usuario from jsonb_array_elements(resultado->'itens')v union select (v#>>'{dados,autor_usuario_id}')::uuid from jsonb_array_elements(resultado->'itens')v union select (v#>>'{dados,registrador_usuario_id}')::uuid from jsonb_array_elements(resultado->'itens')v)autores where usuario is not null;
 elsif acao='api.gravar_execucao_turno' then ids:=array[(resultado->>'autor_usuario_id')::uuid,(resultado#>>'{dados,autor_usuario_id}')::uuid,(resultado#>>'{dados,registrador_usuario_id}')::uuid];end if;
 if ids is not null then identidades:=operacao.identidades_execucao_turno(ids);end if;
 if (a->>'expira_em')::timestamptz<=clock_timestamp() or operacao.contexto_execucao_turno(req) is null then raise insufficient_privilege;end if;
 return jsonb_build_object('ok',true,'repeticao',repeticao,'dados',resultado,'identidades',identidades,'request_id',req);
end $$;
revoke all on function operacao.execucao_turno_privada(jsonb) from public,anon,authenticated,service_role;
grant execute on function operacao.execucao_turno_privada(jsonb) to ffcmapp_turno_execucao_owner;
create function api.turno_execucao(p_transporte jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare ator uuid:=auth_privado.uid();req uuid;paciente uuid;codigo text;acao text;
begin
 begin return operacao.execucao_turno_privada(p_transporte);
 exception when others then codigo:=case when sqlstate='PZ064' and sqlerrm in ('conflito','conflito_idempotencia') then sqlerrm when sqlstate='42501' then 'sem_permissao' when sqlstate in ('22023','22P02','22007','22008','22003','23514','23502') then 'entrada_invalida' when sqlstate in ('23505','23503') then 'conflito' else 'servico_indisponivel' end;end;
 req:=(p_transporte#>>'{entrada,request_id}')::uuid;paciente:=(p_transporte#>>'{entrada,paciente_id}')::uuid;
 if ator is null or req is null then raise insufficient_privilege;end if;
 acao:=p_transporte#>>'{entrada,atestado,operacao}';
 if acao is null or acao not in ('api.gravar_execucao_turno','api.consultar_execucao_turno','api.consultar_catalogo_turno','api.configurar_catalogo_turno','api.conceder_medicacao_turno','api.consultar_concessoes_medicacao_turno','api.consultar_conversao_ocorrencia_turno','api.converter_ocorrencia_turno') then acao:='api.gravar_execucao_turno';end if;
 if exists(select 1 from public.usuario where id=ator) then insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
 else insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);end if;
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo',codigo),'request_id',req);
end $$;
alter function api.turno_execucao(jsonb) owner to ffcmapp_turno_execucao_owner;
do $acl$ declare migrador text:=current_user;begin
 perform set_config('role','ffcmapp_turno_execucao_owner',true);
 revoke all on function api.turno_execucao(jsonb) from public,anon,authenticated,service_role;
 grant execute on function api.turno_execucao(jsonb) to authenticated;
 perform set_config('role',migrador,true);
end $acl$;
revoke create on schema api from ffcmapp_turno_execucao_owner;
revoke ffcmapp_turno_execucao_owner from current_user;
commit;
