-- FR-062/065/066: authorized derived reports; foundation is distinct from case link.
begin;
create temporary table turno_execucao_privilegios on commit drop as select current_user::text migrador,pg_has_role(current_user,'ffcmapp_turno_execucao_owner','SET') tinha_set,has_schema_privilege('ffcmapp_turno_execucao_owner','api','CREATE') tinha_api,has_schema_privilege('ffcmapp_turno_execucao_owner','operacao','CREATE') tinha_operacao;
do $$ declare p record;begin select * into p from turno_execucao_privilegios;
 if not p.tinha_set then
  if exists(select 1 from pg_auth_members where roleid='ffcmapp_turno_execucao_owner'::regrole and member=current_user::regrole and grantor=current_user::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
  execute format('grant ffcmapp_turno_execucao_owner to %I with inherit false,set true granted by %I',p.migrador,p.migrador);
 end if;
end $$;
create table cadastro.turno_fundamento_familiar_versao(
 paciente_id uuid not null references cadastro.paciente(id),familiar_usuario_id uuid not null references public.usuario(id),
 versao integer not null check(versao>0),anterior integer,estado text not null check(estado in ('vigente','revogado')),
 fundamento jsonb not null,vigencia_inicio timestamptz not null,vigencia_fim timestamptz,
 autor_usuario_id uuid not null references public.usuario(id),registrado_em timestamptz not null default clock_timestamp(),
 chave text not null,digest text not null,primary key(paciente_id,familiar_usuario_id,versao),unique(autor_usuario_id,chave),
 foreign key(paciente_id,familiar_usuario_id,anterior) references cadastro.turno_fundamento_familiar_versao(paciente_id,familiar_usuario_id,versao),
 check((versao=1 and anterior is null) or (versao>1 and anterior=versao-1)),check(vigencia_fim is null or vigencia_fim>vigencia_inicio),
 check(length(chave) between 16 and 200),check(digest~'^[A-Za-z0-9_-]{43}$')
);
create table cadastro.turno_exportacao_pdf(
 id uuid primary key,paciente_id uuid not null references cadastro.paciente(id),solicitante_usuario_id uuid not null references public.usuario(id),
 tipo text not null check(tipo in ('turno','diario','semanal','caso')),turno_id uuid references cadastro.turno(id),
 inicio timestamptz not null,fim timestamptz not null,destinatario jsonb not null,proposito jsonb not null,
 digest_pdf text not null check(digest_pdf~'^[A-Za-z0-9_-]{43}$'),registrado_em timestamptz not null default clock_timestamp(),
 chave text not null,digest text not null,unique(solicitante_usuario_id,chave),check(fim>inicio)
);
alter table cadastro.turno_fundamento_familiar_versao enable row level security;
alter table cadastro.turno_fundamento_familiar_versao force row level security;
revoke all on cadastro.turno_fundamento_familiar_versao from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_fundamento_familiar_versao to ffcmapp_turno_execucao_owner;
create policy execucao_turno_fundamento_familiar_versao on cadastro.turno_fundamento_familiar_versao to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_fundamento_familiar_versao_imutavel before update or delete on cadastro.turno_fundamento_familiar_versao for each row execute function cadastro.turno_grupo3_imutavel();
alter table cadastro.turno_exportacao_pdf enable row level security;
alter table cadastro.turno_exportacao_pdf force row level security;
revoke all on cadastro.turno_exportacao_pdf from public,anon,authenticated,service_role;
grant select,insert on cadastro.turno_exportacao_pdf to ffcmapp_turno_execucao_owner;
create policy execucao_turno_exportacao_pdf on cadastro.turno_exportacao_pdf to ffcmapp_turno_execucao_owner using(true) with check(true);
create trigger turno_exportacao_pdf_imutavel before update or delete on cadastro.turno_exportacao_pdf for each row execute function cadastro.turno_grupo3_imutavel();
-- Opaque server-owned snapshot token prevents corrections moving across PDF pages.
create table operacao.turno_relatorio_consulta(
 id uuid primary key,ator_usuario_id uuid not null references public.usuario(id),paciente_id uuid not null references cadastro.paciente(id),
 contexto jsonb not null,tipo text not null,turno_id uuid,inicio timestamptz not null,fim timestamptz not null,
 instante_corte timestamptz not null default clock_timestamp(),expira_em timestamptz not null default(clock_timestamp()+interval '15 minutes')
);
alter table operacao.turno_relatorio_consulta enable row level security;
alter table operacao.turno_relatorio_consulta force row level security;
revoke all on operacao.turno_relatorio_consulta from public,anon,authenticated,service_role;
grant select,insert on operacao.turno_relatorio_consulta to ffcmapp_turno_execucao_owner;
create policy execucao_relatorio_consulta on operacao.turno_relatorio_consulta to ffcmapp_turno_execucao_owner using(ator_usuario_id=(select auth_privado.uid())) with check(ator_usuario_id=(select auth_privado.uid()));
create trigger turno_relatorio_consulta_imutavel before update or delete on operacao.turno_relatorio_consulta for each row execute function cadastro.turno_grupo3_imutavel();
alter table cadastro.turno_exportacao_pdf add column consulta_id uuid not null references operacao.turno_relatorio_consulta(id);
grant select(id,versao) on cadastro.acesso_paciente to ffcmapp_turno_execucao_owner;
grant select(versao) on identidade.concessao_equipe to ffcmapp_turno_execucao_owner;
grant select(perfil) on public.usuario to ffcmapp_turno_execucao_owner;
grant select on cadastro.diario_turno_passagem to ffcmapp_turno_execucao_owner;
create policy execucao_passagem on cadastro.diario_turno_passagem for select to ffcmapp_turno_execucao_owner using(true);
grant select(id,diario_registro_id,versao,estado,audiencia,area,conteudo_cifrado,criado_em) on cadastro.diario_registro_versao to ffcmapp_turno_execucao_owner;
create policy execucao_diario_versao on cadastro.diario_registro_versao for select to ffcmapp_turno_execucao_owner using(true);
-- Only page authors are projected by the report; never an account directory.
grant select(id,usuario_id,email_cifrado,criada_em,estado) on identidade.concessao_equipe to ffcmapp_turno_execucao_owner;
create policy execucao_rotulos on identidade.concessao_equipe for select to ffcmapp_turno_execucao_owner using(true);
grant select(operacao_id,usuario_id,nome_cifrado,email_cifrado,estado) on identidade.acesso_gerenciado to ffcmapp_turno_execucao_owner;
create policy execucao_rotulos_gerenciados on identidade.acesso_gerenciado for select to ffcmapp_turno_execucao_owner using(true);
create function operacao.identidades_execucao_turno(p_usuarios uuid[]) returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('usuario_id',au.id,'operacao_id',g.operacao_id,'nome_cifrado',g.nome_cifrado,'email_cifrado',g.email_cifrado,'concessao_id',c.id,'email_concessao_cifrado',c.email_cifrado) order by au.id),'[]'::jsonb) from(select distinct unnest(p_usuarios) id)au left join identidade.acesso_gerenciado g on g.usuario_id=au.id left join lateral(select id,email_cifrado from identidade.concessao_equipe x where x.usuario_id=au.id order by x.criada_em desc,x.id desc limit 1)c on true where au.id is not null
$$;
revoke all on function operacao.identidades_execucao_turno(uuid[]) from public,anon,authenticated,service_role;
grant execute on function operacao.identidades_execucao_turno(uuid[]) to ffcmapp_turno_execucao_owner;
create function operacao.candidatos_turno(p_paciente uuid,p_perfil text,p_cursor uuid,p_limite integer) returns jsonb language sql security invoker set search_path='' as $$
 with pagina as(select u.id usuario_id,u.perfil,ap.execucao_medicacao_concedida concedida,g.operacao_id,g.nome_cifrado,g.email_cifrado,c.id concessao_id,c.email_cifrado email_concessao_cifrado
  from cadastro.acesso_paciente ap join public.usuario u on u.id=ap.usuario_id left join identidade.acesso_gerenciado g on g.usuario_id=u.id
  left join lateral(select id,email_cifrado from identidade.concessao_equipe x where x.usuario_id=u.id and x.estado='vinculada' order by criada_em desc,id desc limit 1) c on true
  where ap.paciente_id=p_paciente and ap.revogada_em is null and u.perfil=p_perfil and u.ativo and (p_perfil='familia' or c.id is not null) and (g.usuario_id is null or g.estado='ativo') and (p_cursor is null or u.id>p_cursor) order by u.id limit least(greatest(p_limite,1),100)+1),n as(select *,row_number() over(order by usuario_id) n from pagina)
 select jsonb_build_object('itens',coalesce(jsonb_agg(to_jsonb(linha)-'n' order by usuario_id) filter(where linha.n<=p_limite),'[]'::jsonb),'proximo_cursor',case when count(*)>p_limite then (array_agg(usuario_id order by usuario_id))[p_limite] else null end) from n linha
$$;
revoke all on function operacao.candidatos_turno(uuid,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function operacao.candidatos_turno(uuid,text,uuid,integer) to ffcmapp_turno_execucao_owner;
create function operacao.fundamento_turno_vigente(p_paciente uuid,p_familiar uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select f.estado='vigente' and f.vigencia_inicio<=statement_timestamp() and (f.vigencia_fim is null or f.vigencia_fim>statement_timestamp()) from cadastro.turno_fundamento_familiar_versao f where f.paciente_id=p_paciente and f.familiar_usuario_id=p_familiar order by versao desc limit 1),false)
$$;
revoke all on function operacao.fundamento_turno_vigente(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function operacao.fundamento_turno_vigente(uuid,uuid) to ffcmapp_turno_execucao_owner;
create function operacao.relatorio_turno_privado(p_transporte jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare e jsonb:=p_transporte->'entrada';a jsonb:=e->'atestado';ctx jsonb;ator uuid:=auth_privado.uid();paciente uuid;req uuid;acao text;gestor boolean;familiar boolean;alvo uuid;
 versao integer;esperada integer;f cadastro.turno_fundamento_familiar_versao;exportacao cadastro.turno_exportacao_pdf;
 tipo text;turno uuid;inicio timestamptz;fim timestamptz;limite integer;itens jsonb;quantidade integer;proximo jsonb;lacunas jsonb;resultado jsonb;identidades jsonb;repeticao boolean:=false;snapshot operacao.turno_relatorio_consulta;corte timestamptz;contexto_atual jsonb;
begin
 ctx:=operacao.autorizar_execucao_turno(p_transporte,array['api.consultar_relatorio_turno','api.gravar_fundamento_turno','api.consultar_fundamento_turno','api.consultar_exportacao_turno','api.registrar_exportacao_turno']);
 paciente:=(e->>'paciente_id')::uuid;req:=(e->>'request_id')::uuid;acao:=a->>'operacao';familiar:=ctx->>'perfil'='familia';
 gestor:=ctx->>'perfil'='administrador' or (ctx->>'perfil'='profissional' and exists(select 1 from cadastro.acompanhamento_caso x where x.paciente_id=paciente and x.responsavel_usuario_id=ator and x.versao=(select max(z.versao) from cadastro.acompanhamento_caso z where z.paciente_id=paciente)));
 if acao in ('api.gravar_fundamento_turno','api.consultar_fundamento_turno') then
  alvo:=(e->>'familiar_usuario_id')::uuid;
  if not gestor then raise insufficient_privilege;end if;
  if alvo is null and acao='api.consultar_fundamento_turno' then
   if e-array['request_id','paciente_id','cursor_id','limite','atestado']<>'{}'::jsonb or coalesce((e->>'limite')::integer,25) not between 1 and 100 then raise invalid_parameter_value;end if;
   resultado:=operacao.candidatos_turno(paciente,'familia',(e->>'cursor_id')::uuid,coalesce((e->>'limite')::integer,25))||jsonb_build_object('pode_gerir',true);
  else
  if alvo is null or not exists(select 1 from public.usuario where id=alvo and perfil='familia' and ativo) or not exists(select 1 from cadastro.acesso_paciente where paciente_id=paciente and usuario_id=alvo and revogada_em is null) then raise insufficient_privilege;end if;
  if acao='api.gravar_fundamento_turno' then
   if e-array['request_id','paciente_id','familiar_usuario_id','versao_esperada','estado','fundamento','aad_fundamento','vigencia_inicio','vigencia_fim','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
   esperada:=(e->>'versao_esperada')::integer;
   if esperada is null or esperada<0 or esperada>=2147483647 or jsonb_typeof(e->'fundamento') is distinct from 'object' or e->>'estado' is null or e->>'estado' not in ('vigente','revogado') or length(coalesce(e->>'chave_idempotencia','')) not between 16 and 200 or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$' then raise invalid_parameter_value;end if;
   if not operacao.validar_cifra_execucao(e->'fundamento',e->'aad_fundamento',paciente,null,alvo,esperada+1,'cadastro.turno_fundamento_familiar_versao','fundamento') then raise invalid_parameter_value;end if;
   select * into f from cadastro.turno_fundamento_familiar_versao where autor_usuario_id=ator and chave=e->>'chave_idempotencia';
   if found then
    if f.paciente_id<>paciente or f.familiar_usuario_id<>alvo or f.digest is distinct from e->>'digest_idempotencia' or f.versao<>esperada+1 then raise exception using errcode='PZ064',message='conflito_idempotencia';end if;
    repeticao:=true;
   else
    select max(x.versao) into versao from cadastro.turno_fundamento_familiar_versao x where x.paciente_id=paciente and x.familiar_usuario_id=alvo;
    if coalesce(versao,0)<>esperada then raise exception using errcode='PZ064',message='conflito';end if;
    insert into cadastro.turno_fundamento_familiar_versao(paciente_id,familiar_usuario_id,versao,anterior,estado,fundamento,vigencia_inicio,vigencia_fim,autor_usuario_id,chave,digest)
     values(paciente,alvo,esperada+1,case when esperada=0 then null else esperada end,e->>'estado',e->'fundamento',(e->>'vigencia_inicio')::timestamptz,(e->>'vigencia_fim')::timestamptz,ator,e->>'chave_idempotencia',e->>'digest_idempotencia') returning * into f;
   end if;
   resultado:=to_jsonb(f)-array['chave','digest'];
  else
   if e-array['request_id','paciente_id','familiar_usuario_id','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
   select to_jsonb(x)-array['chave','digest'] into resultado from cadastro.turno_fundamento_familiar_versao x where x.paciente_id=paciente and x.familiar_usuario_id=alvo order by x.versao desc limit 1;
  end if;
  end if;
 elsif acao='api.consultar_exportacao_turno' then
  if e-array['request_id','paciente_id','exportacao_id','atestado']<>'{}'::jsonb or (familiar and not operacao.fundamento_turno_vigente(paciente,ator)) then raise insufficient_privilege;end if;
  select jsonb_build_object('exportacao_id',x.id,'registrado_em',x.registrado_em) into resultado from cadastro.turno_exportacao_pdf x where x.id=(e->>'exportacao_id')::uuid and x.paciente_id=paciente and x.solicitante_usuario_id=ator;
 else
  if familiar and not operacao.fundamento_turno_vigente(paciente,ator) then raise insufficient_privilege;end if;
  if familiar then
   select * into f from cadastro.turno_fundamento_familiar_versao x where x.paciente_id=paciente and x.familiar_usuario_id=ator order by x.versao desc limit 1;
  end if;
  if ctx->>'perfil' not in ('familia','profissional','administrador') then raise insufficient_privilege;end if;
  if e-array['request_id','paciente_id','tipo','turno_id','inicio','fim','cursor_instante','cursor_id','cursor_versao','cursor_classe','limite','consulta_id','exportacao_id','destinatario','proposito','aad_destinatario','aad_proposito','digest_pdf','chave_idempotencia','digest_idempotencia','atestado']<>'{}'::jsonb then raise invalid_parameter_value;end if;
  tipo:=e->>'tipo';turno:=(e->>'turno_id')::uuid;inicio:=(e->>'inicio')::timestamptz;fim:=(e->>'fim')::timestamptz;limite:=coalesce((e->>'limite')::integer,25);
  if tipo is null or tipo not in ('turno','diario','semanal','caso') or inicio is null or fim is null or fim<=inicio or limite not between 1 and 100
   or (tipo='diario' and fim-inicio<>interval '1 day') or (tipo='semanal' and fim-inicio<>interval '7 days') or (tipo='turno' and turno is null)
   or num_nonnulls(e->>'cursor_instante',e->>'cursor_id',e->>'cursor_versao',e->>'cursor_classe') not in (0,4) then raise invalid_parameter_value;end if;
  if tipo='caso' and familiar then raise insufficient_privilege;end if;
  if tipo='turno' then
   if not exists(select 1 from cadastro.turno where id=turno and paciente_id=paciente) then raise insufficient_privilege;end if;
  elsif turno is not null then raise invalid_parameter_value;end if;
  select jsonb_build_object('session_id',ctx->'session_id','perfil',ctx->'perfil','funcao',ctx->'funcao','metodo',ctx->'metodo','usuario_versao',ctx->'versao','concessao_id',ctx->'concessao_id','concessao_versao',(select c.versao from identidade.concessao_equipe c where c.id=(ctx->>'concessao_id')::uuid),'vinculo_id',ap.id,'vinculo_versao',ap.versao,'fundamento_versao',case when familiar then f.versao else null end) into contexto_atual from cadastro.acesso_paciente ap where ap.paciente_id=paciente and ap.usuario_id=ator and ap.revogada_em is null;
  if contexto_atual is null then raise insufficient_privilege;end if;
  if e ? 'consulta_id' then
   select * into snapshot from operacao.turno_relatorio_consulta where id=(e->>'consulta_id')::uuid and ator_usuario_id=ator and paciente_id=paciente and operacao.turno_relatorio_consulta.tipo=tipo and turno_id is not distinct from turno and operacao.turno_relatorio_consulta.inicio=inicio and operacao.turno_relatorio_consulta.fim=fim and expira_em>clock_timestamp() and contexto=contexto_atual;
   if not found then raise exception using errcode='PZ064',message='conflito';end if;
  else
   if e ? 'cursor_id' or acao='api.registrar_exportacao_turno' then raise invalid_parameter_value;end if;
   insert into operacao.turno_relatorio_consulta(id,ator_usuario_id,paciente_id,contexto,tipo,turno_id,inicio,fim) values(gen_random_uuid(),ator,paciente,contexto_atual,tipo,turno,inicio,fim) returning * into snapshot;
  end if;
  corte:=snapshot.instante_corte;
  -- Snapshot fixes source versions; live authorization is never frozen.
  -- One stable timeline, including historical corrections; no clinical inference.
  with eventos_base as(
   select 'turno'::text categoria,t.id,case when t.encerrado_em>corte then 1 else t.versao end,t.aberto_em instante,to_jsonb(t)||case when t.encerrado_em>corte then jsonb_build_object('situacao','aberto','encerrado_em',null,'versao',1) else '{}'::jsonb end dados from cadastro.turno t where t.paciente_id=paciente and (turno is null or t.id=turno) and t.aberto_em<=corte and t.aberto_em<fim and coalesce(least(t.encerrado_em,corte),corte)>=inicio
   union all select s.classe,s.id,s.versao,s.instante_ocorrencia,to_jsonb(s)||case when s.classe='ocorrencia' then jsonb_build_object('anexos',(select coalesce(jsonb_agg(jsonb_build_object('anexo_id',ax.id,'mime_type',ax.mime_type,'tamanho_bytes',ax.tamanho_bytes) order by ax.id),'[]'::jsonb) from cadastro.turno_anexo ax join cadastro.turno_anexo_confirmacao ac on ac.anexo_id=ax.id where ax.ocorrencia_id=s.id and ac.confirmado_em<=corte and (not familiar or (ax.audiencia='equipe_e_familia' and ax.registrado_em>=f.vigencia_inicio and (f.vigencia_fim is null or ax.registrado_em<f.vigencia_fim))))) else '{}'::jsonb end from cadastro.turno_execucao_serie s where s.paciente_id=paciente and s.versao=(select max(z.versao) from cadastro.turno_execucao_serie z where z.id=s.id and z.registrado_em<=corte) and s.registrado_em<=corte and (turno is null or s.turno_id=turno) and s.instante_ocorrencia>=inicio and s.instante_ocorrencia<fim
   union all select 'passagem',p.registro_id,p.versao_passagem,p.publicado_em,jsonb_build_object('turno_id',p.turno_id,'registro_id',p.registro_id,'diario_registro_id',p.diario_registro_id,'autor_usuario_id',p.autor_usuario_id,'publicado_em',p.publicado_em,'versao',dv.versao,'audiencia',dv.audiencia,'conteudo_cifrado',dv.conteudo_cifrado)
    from cadastro.diario_turno_passagem p join cadastro.diario_registro_versao dv on dv.id=p.registro_id where p.paciente_id=paciente and (turno is null or p.turno_id=turno) and p.publicado_em<=corte and p.versao_passagem=(select max(z.versao_passagem) from cadastro.diario_turno_passagem z where z.turno_id=p.turno_id and z.publicado_em<=corte) and p.publicado_em>=inicio and p.publicado_em<fim and dv.estado in ('publicado','retificado') and (not familiar or dv.audiencia='equipe_e_familia')
  ),eventos as(select * from eventos_base x where not familiar or (x.instante>=f.vigencia_inicio and (f.vigencia_fim is null or x.instante<f.vigencia_fim))),pagina as(select * from eventos x where not(e ? 'cursor_id') or (x.instante,x.id,x.versao,x.categoria)>((e->>'cursor_instante')::timestamptz,(e->>'cursor_id')::uuid,(e->>'cursor_versao')::integer,e->>'cursor_classe') order by instante,id,versao,categoria limit limite+1),numerada as(select *,row_number() over(order by instante,id,versao,categoria) n from pagina)
  select coalesce(jsonb_agg(to_jsonb(linha)-'n' order by instante,id,versao,categoria) filter(where linha.n<=limite),'[]'::jsonb),count(*) into itens,quantidade from numerada linha;
  if quantidade>limite then proximo:=jsonb_build_object('instante',itens->(limite-1)->'instante','id',itens->(limite-1)->'id','versao',itens->(limite-1)->'versao','classe',itens->(limite-1)->'categoria');end if;
  -- Range subtraction merges overlap and reports only gaps, never presence or performance.
  with limites as(select case when familiar then greatest(inicio,f.vigencia_inicio) else inicio end de,case when familiar and f.vigencia_fim is not null then least(fim,f.vigencia_fim) else fim end ate),cobertura as(select coalesce(range_agg(tstzrange(greatest(t.aberto_em,inicio),least(coalesce(least(t.encerrado_em,corte),corte),fim),'[)')),'{}'::tstzmultirange) r from cadastro.turno t where t.paciente_id=paciente and t.aberto_em<corte and t.aberto_em<fim and coalesce(least(t.encerrado_em,corte),corte)>inicio), faltas as(select unnest(tstzmultirange(tstzrange(least((select de from limites),(select ate from limites)),(select ate from limites),'[)'))-r) r from cobertura)
  select coalesce(jsonb_agg(jsonb_build_object('inicio',lower(r),'fim',upper(r)) order by lower(r)),'[]'::jsonb) into lacunas from faltas;
  with autores as(select distinct (v#>>'{dados,autor_usuario_id}')::uuid id from jsonb_array_elements(itens) v where v#>>'{dados,autor_usuario_id}' is not null union select distinct (v#>>'{dados,profissional_usuario_id}')::uuid from jsonb_array_elements(itens) v where v#>>'{dados,profissional_usuario_id}' is not null union select distinct (v#>>'{dados,dados,autor_usuario_id}')::uuid from jsonb_array_elements(itens) v where v#>>'{dados,dados,autor_usuario_id}' is not null union select distinct (v#>>'{dados,dados,registrador_usuario_id}')::uuid from jsonb_array_elements(itens) v where v#>>'{dados,dados,registrador_usuario_id}' is not null)
  select coalesce(jsonb_agg(jsonb_build_object('usuario_id',au.id,'operacao_id',g.operacao_id,'nome_cifrado',g.nome_cifrado,'email_cifrado',g.email_cifrado,'concessao_id',c.id,'email_concessao_cifrado',c.email_cifrado) order by au.id),'[]'::jsonb) into identidades from autores au left join identidade.acesso_gerenciado g on g.usuario_id=au.id left join lateral(select id,email_cifrado from identidade.concessao_equipe x where x.usuario_id=au.id order by x.criada_em desc,x.id desc limit 1)c on true;
  resultado:=jsonb_build_object('tipo',tipo,'paciente_id',paciente,'inicio',inicio,'fim',fim,'itens',itens,'proximo_cursor',proximo,'lacunas',lacunas,'identidades',identidades,'rotulos_atuais',true,'consulta_id',snapshot.id,'instante_corte',corte);
  if acao='api.registrar_exportacao_turno' then
   if not operacao.validar_cifra_execucao(e->'destinatario',e->'aad_destinatario',paciente,turno,(e->>'exportacao_id')::uuid,1,'cadastro.turno_exportacao_pdf','destinatario') or not operacao.validar_cifra_execucao(e->'proposito',e->'aad_proposito',paciente,turno,(e->>'exportacao_id')::uuid,1,'cadastro.turno_exportacao_pdf','proposito')
    or length(coalesce(e->>'chave_idempotencia','')) not between 16 and 200 or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$' then raise invalid_parameter_value;end if;
   select * into exportacao from cadastro.turno_exportacao_pdf where solicitante_usuario_id=ator and chave=e->>'chave_idempotencia';
   if found then
    if exportacao.digest is distinct from e->>'digest_idempotencia' or exportacao.paciente_id<>paciente or exportacao.id is distinct from (e->>'exportacao_id')::uuid or exportacao.consulta_id is distinct from snapshot.id or exportacao.digest_pdf is distinct from e->>'digest_pdf' then raise exception using errcode='PZ064',message='conflito_idempotencia';end if;repeticao:=true;
   else insert into cadastro.turno_exportacao_pdf(id,paciente_id,solicitante_usuario_id,tipo,turno_id,inicio,fim,destinatario,proposito,digest_pdf,chave,digest,consulta_id) values((e->>'exportacao_id')::uuid,paciente,ator,tipo,turno,inicio,fim,e->'destinatario',e->'proposito',e->>'digest_pdf',e->>'chave_idempotencia',e->>'digest_idempotencia',snapshot.id) returning * into exportacao;end if;
   resultado:=jsonb_build_object('exportacao_id',exportacao.id,'registrado_em',exportacao.registrado_em,'consulta_id',snapshot.id,'instante_corte',corte);
  end if;
 end if;
 if (a->>'expira_em')::timestamptz<=clock_timestamp() or operacao.contexto_execucao_turno(req) is null then raise insufficient_privilege;end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 if (a->>'expira_em')::timestamptz<=clock_timestamp() or operacao.contexto_execucao_turno(req) is null then raise insufficient_privilege;end if;
 return jsonb_build_object('ok',true,'repeticao',repeticao,'dados',resultado,'request_id',req);
end $$;
revoke all on function operacao.relatorio_turno_privado(jsonb) from public,anon,authenticated,service_role;
grant execute on function operacao.relatorio_turno_privado(jsonb) to ffcmapp_turno_execucao_owner;
grant create on schema api to ffcmapp_turno_execucao_owner;
create function api.turno_relatorio(p_transporte jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security=on as $$
declare ator uuid:=auth_privado.uid();req uuid;paciente uuid;codigo text;acao text;
begin
 begin return operacao.relatorio_turno_privado(p_transporte);
 exception when others then codigo:=case when sqlstate='PZ064' and sqlerrm in ('conflito','conflito_idempotencia') then sqlerrm when sqlstate='42501' then 'sem_permissao' when sqlstate in ('22023','22P02','22007','22008','22003','23514','23502') then 'entrada_invalida' when sqlstate in ('23505','23503') then 'conflito' else 'servico_indisponivel' end;end;
 req:=(p_transporte#>>'{entrada,request_id}')::uuid;paciente:=(p_transporte#>>'{entrada,paciente_id}')::uuid;
 if ator is null or req is null then raise insufficient_privilege;end if;
 acao:=p_transporte#>>'{entrada,atestado,operacao}';
 if acao is null or acao not in ('api.consultar_relatorio_turno','api.gravar_fundamento_turno','api.consultar_fundamento_turno','api.consultar_exportacao_turno','api.registrar_exportacao_turno') then acao:='api.consultar_relatorio_turno';end if;
 if exists(select 1 from public.usuario where id=ator) then insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
 else insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);end if;
 if not found then raise exception 'AUDITORIA_NAO_INSERIDA';end if;
 return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo',codigo),'request_id',req);
end $$;
alter function api.turno_relatorio(jsonb) owner to ffcmapp_turno_execucao_owner;
do $acl$ declare migrador text:=current_user;begin
 perform set_config('role','ffcmapp_turno_execucao_owner',true);
 revoke all on function api.turno_relatorio(jsonb) from public,anon,authenticated,service_role;
 grant execute on function api.turno_relatorio(jsonb) to authenticated;
 perform set_config('role',migrador,true);
end $acl$;

do $$ declare p record;begin select * into p from turno_execucao_privilegios;
 if not p.tinha_api then revoke create on schema api from ffcmapp_turno_execucao_owner;end if;
 if not p.tinha_operacao then revoke create on schema operacao from ffcmapp_turno_execucao_owner;end if;
 if not p.tinha_set then execute format('revoke ffcmapp_turno_execucao_owner from %I granted by %I',p.migrador,p.migrador);end if;
end $$;
commit;
