-- FR-014. Preparação LOCAL: validações adiadas, flag desligada. Nenhuma aplicação remota.
-- Uma conversão por origem é suposição conservadora registrada na mudança OpenSpec.
-- Ledger somente operacional; conteúdo humano continua cifrado nos domínios existentes.
create table operacao.conversao_diario_tarefa (
 id uuid primary key,
 paciente_id uuid not null references cadastro.paciente(id),
 origem_id uuid not null unique references cadastro.diario_registro(id),
 origem_versao integer not null check(origem_versao>0),
 tarefa_id uuid not null unique references cadastro.tarefa_cuidado(id),
 evolucao_id uuid not null unique references cadastro.diario_registro(id),
 ator_usuario_id uuid not null references public.usuario(id),
 registrado_em timestamptz not null default clock_timestamp(),
 chave_idempotencia text not null check(length(btrim(chave_idempotencia)) between 1 and 256),
 digest_idempotencia text not null check(digest_idempotencia ~ '^[A-Za-z0-9_-]{43}$'),
 unique(ator_usuario_id,chave_idempotencia),
 foreign key(origem_id,origem_versao) references cadastro.diario_registro_versao(diario_registro_id,versao),
 check(origem_id<>evolucao_id)
);
create index conversao_diario_tarefa_paciente_idx on operacao.conversao_diario_tarefa(paciente_id);
alter table operacao.conversao_diario_tarefa enable row level security;
alter table operacao.conversao_diario_tarefa force row level security;
revoke all on operacao.conversao_diario_tarefa from public,anon,authenticated,service_role;
create function operacao.impedir_alteracao_conversao_diario_tarefa() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'CONVERSAO_IMUTAVEL'; end $$;
revoke all on function operacao.impedir_alteracao_conversao_diario_tarefa() from public,anon,authenticated,service_role;
create trigger conversao_diario_tarefa_imutavel before update or delete on operacao.conversao_diario_tarefa for each row execute function operacao.impedir_alteracao_conversao_diario_tarefa();
insert into identidade.configuracao_sistema(id,chave,valor,tipo,rotulo,descricao,exposicao)
 values(gen_random_uuid(),'ffcm.diario.conversao_tarefa_ativa','false','booleano','Conversão do diário em tarefa','Cria tarefa e evolução interna de atenção juntas. Validações pendentes; desligado inicialmente. Não modifica autorização nem envia retorno à família.','servidor');
select set_config('ffcmapp.conversao_migrador',current_user,false);
create role ffcmapp_conversao_diario_tarefa_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ffcmapp_conversao_diario_tarefa_owner to current_user with inherit false,set true;
grant usage,create on schema api to ffcmapp_conversao_diario_tarefa_owner;
grant usage on schema public,cadastro,identidade,operacao,auditoria,auth_privado,bloqueios_auth to ffcmapp_conversao_diario_tarefa_owner;
grant execute on function auth_privado.uid(),auth_privado.jwt(),auth_privado.sessoes(),bloqueios_auth.travar(uuid,uuid) to ffcmapp_conversao_diario_tarefa_owner;
-- Grants novos somente para a role nova. Preservar memberships das roles existentes,
-- concedentes/opções e CREATE preexistentes; não tocar grants de aplicação anteriores.
do $$ declare item record; migrador text:=current_user; tinha_set boolean; begin
 for item in select * from (values
  ('ffcmapp_tarefa_owner','api.ler_tarefas_cuidado_privado(jsonb)'),
  ('ffcmapp_tarefa_owner','api.tarefa_cuidado_privado(jsonb)'),
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
  execute format('grant execute on function %s to ffcmapp_conversao_diario_tarefa_owner',item.assinatura);
  perform set_config('role',migrador,true);
  if not tinha_set then execute format('revoke %I from %I granted by %I',item.owner_nome,migrador,migrador); end if;
 end loop;
end $$;
grant select(id) on public.usuario to ffcmapp_conversao_diario_tarefa_owner;
create policy conversao_usuario on public.usuario for select to ffcmapp_conversao_diario_tarefa_owner using(id=(select auth_privado.uid()));
grant select(paciente_id,usuario_id,revogada_em) on cadastro.acesso_paciente to ffcmapp_conversao_diario_tarefa_owner;
create policy conversao_acesso on cadastro.acesso_paciente for select to ffcmapp_conversao_diario_tarefa_owner using(usuario_id=(select auth_privado.uid()));
grant select(id),update(versao) on cadastro.paciente to ffcmapp_conversao_diario_tarefa_owner;
create policy conversao_paciente on cadastro.paciente for select to ffcmapp_conversao_diario_tarefa_owner using(exists(select 1 from cadastro.acesso_paciente ap where ap.paciente_id=cadastro.paciente.id and ap.usuario_id=(select auth_privado.uid()) and ap.revogada_em is null));
create policy conversao_paciente_lock on cadastro.paciente for update to ffcmapp_conversao_diario_tarefa_owner using(exists(select 1 from cadastro.acesso_paciente ap where ap.paciente_id=cadastro.paciente.id and ap.usuario_id=(select auth_privado.uid()) and ap.revogada_em is null)) with check(false);
-- Provar novidade antes de chamar filha; não basta confiar em UUID recém-gerado.
-- Somente metadados da tarefa em caso com vínculo vigente, nunca conteúdo ou escrita.
grant select(id,paciente_id) on cadastro.tarefa_cuidado to ffcmapp_conversao_diario_tarefa_owner;
create policy conversao_tarefa_novidade on cadastro.tarefa_cuidado for select to ffcmapp_conversao_diario_tarefa_owner using(exists(select 1 from cadastro.paciente p where p.id=tarefa_cuidado.paciente_id));
grant select(id,paciente_id,tipo,autor_usuario_id) on cadastro.diario_registro to ffcmapp_conversao_diario_tarefa_owner;
grant select(diario_registro_id,versao,estado,audiencia) on cadastro.diario_registro_versao to ffcmapp_conversao_diario_tarefa_owner;
create policy conversao_origem on cadastro.diario_registro for select to ffcmapp_conversao_diario_tarefa_owner using(exists(select 1 from cadastro.paciente p where p.id=paciente_id));
-- Não filtrar rascunhos aqui: é preciso ver a versão mais nova e NEGÁ-LA, sem
-- retroceder silenciosamente para uma versão publicada antiga.
create policy conversao_origem_versao on cadastro.diario_registro_versao for select to ffcmapp_conversao_diario_tarefa_owner using(exists(select 1 from cadastro.diario_registro r where r.id=diario_registro_id));
grant select(chave,valor,tipo),update(valor) on identidade.configuracao_sistema to ffcmapp_conversao_diario_tarefa_owner;
create policy conversao_config on identidade.configuracao_sistema for select to ffcmapp_conversao_diario_tarefa_owner using(chave in ('ffcm.diario.conversao_tarefa_ativa','ffcm.diario.ativo','ffcm.diario.areas_sintese','ffcm.tarefas.ativas','ffcm.tarefas.escrita_ativa','ffcm.tarefas.barreira_ativa'));
create policy conversao_config_lock on identidade.configuracao_sistema for update to ffcmapp_conversao_diario_tarefa_owner using(chave in ('ffcm.diario.conversao_tarefa_ativa','ffcm.diario.ativo','ffcm.diario.areas_sintese','ffcm.tarefas.ativas','ffcm.tarefas.escrita_ativa','ffcm.tarefas.barreira_ativa')) with check(false);
grant select,insert on operacao.conversao_diario_tarefa to ffcmapp_conversao_diario_tarefa_owner;
create policy conversao_ledger_select on operacao.conversao_diario_tarefa for select to ffcmapp_conversao_diario_tarefa_owner using(exists(select 1 from cadastro.paciente p where p.id=paciente_id));
create policy conversao_ledger_insert on operacao.conversao_diario_tarefa for insert to ffcmapp_conversao_diario_tarefa_owner with check(ator_usuario_id=(select auth_privado.uid()) and exists(select 1 from cadastro.diario_registro r where r.id=origem_id and r.paciente_id=operacao.conversao_diario_tarefa.paciente_id));
grant insert(id,ator_usuario_id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcmapp_conversao_diario_tarefa_owner;
create policy conversao_auditoria on auditoria.evento for insert to ffcmapp_conversao_diario_tarefa_owner with check((ator_usuario_id=(select auth_privado.uid()) and ator_auth_id is null) or (ator_usuario_id is null and ator_auth_id=(select auth_privado.uid()) and resultado='negado'));

create function operacao.conversao_diario_tarefa_operacao_privada(p_transporte jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare e jsonb:=p_transporte->'entrada'; a jsonb:=e->'atestado'; ator uuid:=auth_privado.uid(); sessao uuid;
 req uuid; paciente uuid; origem uuid; versao integer; inicio timestamptz; fim timestamptz; acao text; filho record; filho_entrada jsonb; filho_atestado jsonb;
 autorizacao jsonb; tarefa jsonb; diario jsonb; resposta jsonb; recibo operacao.conversao_diario_tarefa;
 origem_atual integer; origem_estado text; tarefa_id uuid; evolucao_id uuid; quantidade integer; codigo text; area text;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object' or p_transporte-array['entrada','entrada_canonica','dados_canonicos']<>'{}'::jsonb
  or jsonb_typeof(e) is distinct from 'object' or e-array['request_id','paciente_id','origem_id','origem_versao','chave_idempotencia','digest_idempotencia','autorizacao_tarefa','tarefa','diario','atestado']<>'{}'::jsonb or jsonb_typeof(a) is distinct from 'object' then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 begin
  sessao:=(auth_privado.jwt()->>'session_id')::uuid; req:=(e->>'request_id')::uuid; paciente:=(e->>'paciente_id')::uuid; origem:=(e->>'origem_id')::uuid;
  inicio:=(a->>'emitido_em')::timestamptz; fim:=(a->>'expira_em')::timestamptz; acao:=a->>'operacao';
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then raise exception using errcode='42501',message='SEM_PERMISSAO'; end;
 if ator is null or sessao is null or req is null or paciente is null or origem is null or inicio is null or fim is null
  or acao is null or acao not in ('api.consultar_conversao_diario_tarefa','api.converter_diario_tarefa')
  or a->>'usuario_id' is distinct from ator::text or a->>'session_id' is distinct from sessao::text or a->>'request_id' is distinct from req::text
  or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
  or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 autorizacao:=e->'autorizacao_tarefa'; tarefa:=e->'tarefa'; diario:=e->'diario';
 if acao='api.consultar_conversao_diario_tarefa' and e-array['request_id','paciente_id','origem_id','autorizacao_tarefa','atestado']<>'{}'::jsonb then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 -- Toda filha tem o mesmo Auth/request/caso, com ação exata; assinatura agregada
 -- prende também os snapshots das filhas à origem/versão desta conversão.
 for filho in select * from (values(autorizacao,'api.ler_tarefas_cuidado'),(tarefa,'api.gravar_tarefa_cuidado'),(diario,'api.gravar_diario')) as filhas(transporte,operacao) loop
  if filho.operacao<>'api.ler_tarefas_cuidado' and acao='api.consultar_conversao_diario_tarefa' then continue; end if;
  filho_entrada:=filho.transporte->'entrada'; filho_atestado:=filho_entrada->'atestado';
  if jsonb_typeof(filho.transporte) is distinct from 'object' or filho.transporte-array['entrada','entrada_canonica','dados_canonicos']<>'{}'::jsonb
   or jsonb_typeof(filho_entrada) is distinct from 'object' or jsonb_typeof(filho_atestado) is distinct from 'object'
   or filho_entrada->>'request_id' is distinct from req::text or filho_entrada->>'paciente_id' is distinct from paciente::text
   or filho_atestado->>'usuario_id' is distinct from ator::text or filho_atestado->>'session_id' is distinct from sessao::text
   or filho_atestado->>'request_id' is distinct from req::text or filho_atestado->>'operacao' is distinct from filho.operacao then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 end loop;
 if (autorizacao->'entrada')-array['request_id','paciente_id','autorizacao_somente','atestado']<>'{}'::jsonb or autorizacao#>'{entrada,autorizacao_somente}' is distinct from 'true'::jsonb then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 resposta:=api.ler_tarefas_cuidado_privado(autorizacao);
 if resposta->>'ok' is distinct from 'true' or resposta->'dados' is distinct from '[]'::jsonb then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='sem_permissao'; end if;
 -- Auth/concessão/vínculo foram travados pela filha de autorização. Trava exclusiva
 -- do paciente ANTES da versão de origem, igual à publicação/retificação do Diário.
 perform 1 from cadastro.paciente where id=paciente for update;
 if not found then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='sem_permissao'; end if;
 perform 1 from identidade.configuracao_sistema where chave in ('ffcm.diario.conversao_tarefa_ativa','ffcm.diario.ativo','ffcm.diario.areas_sintese','ffcm.tarefas.ativas','ffcm.tarefas.escrita_ativa','ffcm.tarefas.barreira_ativa') order by chave for share;
 select count(*) into quantidade from identidade.configuracao_sistema where chave in ('ffcm.diario.conversao_tarefa_ativa','ffcm.diario.ativo','ffcm.tarefas.ativas','ffcm.tarefas.escrita_ativa','ffcm.tarefas.barreira_ativa') and tipo='booleano' and valor='true'::jsonb;
 if quantidade<>5 then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='sem_permissao'; end if;
 select v.versao,v.estado into origem_atual,origem_estado from cadastro.diario_registro r join lateral(select x.versao,x.estado from cadastro.diario_registro_versao x where x.diario_registro_id=r.id order by x.versao desc limit 1) v on true where r.id=origem and r.paciente_id=paciente;
 if not found or origem_estado not in ('publicado','retificado') then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='sem_permissao'; end if;
 if acao='api.converter_diario_tarefa' then
  begin versao:=(e->>'origem_versao')::integer; exception when invalid_text_representation or numeric_value_out_of_range then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end;
  if versao is null or versao<1 or jsonb_typeof(e->'origem_versao') is distinct from 'number' or coalesce(e->>'origem_versao','')!~'^[1-9][0-9]*$'
   or jsonb_typeof(e->'chave_idempotencia') is distinct from 'string' or length(btrim(e->>'chave_idempotencia')) not between 1 and 256
   or jsonb_typeof(e->'digest_idempotencia') is distinct from 'string' or coalesce(e->>'digest_idempotencia','')!~'^[A-Za-z0-9_-]{43}$' then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 end if;
 -- Autorização e visibilidade vêm ANTES de qualquer recibo. Replay não executa
 -- escritas filhas nem altera autoria; digest lógico independe de IDs/IVs novos.
 select * into recibo from operacao.conversao_diario_tarefa where origem_id=origem and paciente_id=paciente;
 if found then
  if acao='api.converter_diario_tarefa' and recibo.origem_versao is distinct from versao then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='conflito'; end if;
  if acao='api.converter_diario_tarefa' and recibo.digest_idempotencia is distinct from e->>'digest_idempotencia' then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='conflito_idempotencia'; end if;
 else
  if acao='api.converter_diario_tarefa' then
   if versao<>origem_atual then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='conflito'; end if;
   if exists(select 1 from operacao.conversao_diario_tarefa where ator_usuario_id=ator and chave_idempotencia=e->>'chave_idempotencia') then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='conflito_idempotencia'; end if;
   begin tarefa_id:=(tarefa#>>'{entrada,tarefa_id}')::uuid; evolucao_id:=(diario#>>'{entrada,diario_registro_id}')::uuid; exception when invalid_text_representation then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end;
   area:=diario#>>'{entrada,area}';
   if tarefa_id is null or evolucao_id is null or evolucao_id=origem
    or tarefa#>'{entrada,versao_esperada}' is distinct from '0'::jsonb or diario#>'{entrada,versao_esperada}' is distinct from '0'::jsonb
    or tarefa#>>'{entrada,chave_idempotencia}' is distinct from e->>'chave_idempotencia' or diario#>>'{entrada,chave_idempotencia}' is distinct from e->>'chave_idempotencia'
    or diario#>>'{entrada,tipo}' is distinct from 'evolucao_profissional' or diario#>>'{entrada,estado}' is distinct from 'publicado' or diario#>>'{entrada,audiencia}' is distinct from 'equipe'
    or diario#>'{entrada,atencao}' is distinct from 'true'::jsonb or diario#>'{entrada,retorno_solicitado}' is distinct from 'false'::jsonb or diario#>>'{entrada,origem_conteudo}' is distinct from 'texto'
    or diario#>>'{entrada,tarefa_id}' is distinct from tarefa_id::text or (diario->'entrada') ?| array['responde_registro_id','justificativa','aad_justificativa']
    or area is null or not exists(select 1 from identidade.configuracao_sistema c where c.chave='ffcm.diario.areas_sintese' and c.tipo='lista' and c.valor @> jsonb_build_array(area)) then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
   -- Paciente já está travado: criação normal e conversão serializam no mesmo lock.
   -- Ledger ausente exige tarefa nova, inclusive transporte com registro antigo exato.
   if exists(select 1 from cadastro.tarefa_cuidado t where t.id=tarefa_id) then
    raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='conflito_idempotencia';
   end if;
   resposta:=api.tarefa_cuidado_privado(tarefa);
   if resposta->>'ok' is distinct from 'true' then
    codigo:=resposta#>>'{erro,codigo}'; if codigo not in ('sem_permissao','conflito','conflito_idempotencia') or codigo is null then codigo:='servico_indisponivel'; end if;
    raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail=codigo;
   end if;
   -- A wrapper de tarefa NÃO expõe repeticao: conferir registro exato atestado,
   -- além da ausência comprovada antes da filha. Não inventar contrato de resposta.
   if resposta#>>'{dados,registro_id}' is distinct from tarefa#>>'{entrada,registro_id}' then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='conflito_idempotencia';end if;
   if resposta#>>'{dados,paciente_id}' is distinct from paciente::text or resposta#>>'{dados,tarefa_id}' is distinct from tarefa_id::text or resposta#>'{dados,versao}' is distinct from '1'::jsonb then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='servico_indisponivel'; end if;
   resposta:=api.diario_privado(diario);
   if resposta->>'ok' is distinct from 'true' then
    codigo:=resposta#>>'{erro,codigo}'; if codigo not in ('sem_permissao','conflito','conflito_idempotencia') or codigo is null then codigo:='servico_indisponivel'; end if;
    raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail=codigo;
   end if;
   -- Diário expõe repeticao; primeiro ledger não pode adotar publicação anterior.
   if resposta->'repeticao' is distinct from 'false'::jsonb or resposta#>>'{dados,registro_id}' is distinct from diario#>>'{entrada,registro_id}' then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='conflito_idempotencia';end if;
   if resposta#>>'{dados,paciente_id}' is distinct from paciente::text or resposta#>>'{dados,diario_registro_id}' is distinct from evolucao_id::text or resposta#>'{dados,versao}' is distinct from '1'::jsonb then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='servico_indisponivel'; end if;
   insert into operacao.conversao_diario_tarefa(id,paciente_id,origem_id,origem_versao,tarefa_id,evolucao_id,ator_usuario_id,chave_idempotencia,digest_idempotencia)
    values(gen_random_uuid(),paciente,origem,versao,tarefa_id,evolucao_id,ator,e->>'chave_idempotencia',e->>'digest_idempotencia') returning * into recibo;
  end if;
 end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='sem_permissao'; end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='PZ014',message='CONVERSAO_RECUSADA',detail='sem_permissao'; end if;
 return jsonb_build_object('ok',true,'repeticao',recibo.id is not null and (acao='api.consultar_conversao_diario_tarefa' or tarefa_id is null),'dados',case when recibo.id is null then null else jsonb_build_object('conversao_id',recibo.id,'paciente_id',recibo.paciente_id,'origem_id',recibo.origem_id,'origem_versao',recibo.origem_versao,'tarefa_id',recibo.tarefa_id,'evolucao_id',recibo.evolucao_id,'ator_usuario_id',recibo.ator_usuario_id,'registrado_em',recibo.registrado_em) end,'request_id',req);
end $$;
revoke all on function operacao.conversao_diario_tarefa_operacao_privada(jsonb) from public,anon,authenticated,service_role;
grant execute on function operacao.conversao_diario_tarefa_operacao_privada(jsonb) to ffcmapp_conversao_diario_tarefa_owner;
-- Catalog guard runs as migrator; private owner does not need exposure-column access.
do $$ begin
 if not exists(select 1 from identidade.configuracao_sistema where chave='ffcm.diario.conversao_tarefa_ativa' and tipo='booleano' and valor='false'::jsonb and exposicao='servidor') then raise exception 'CONFIGURACAO_CONVERSAO_INESPERADA'; end if;
end $$;
set role ffcmapp_conversao_diario_tarefa_owner;
create function api.conversao_diario_tarefa_privada(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path='' set row_security=on as $$
declare ator uuid:=auth_privado.uid(); req uuid; paciente uuid; sessao uuid; acao text; codigo text; detalhe text;
begin
 -- O subbloco do chamador é a transação de composição: qualquer exceção reverte
 -- ambas filhas, auditorias filhas, reserva confirmada e ledger. Negativa fora dele.
 begin return operacao.conversao_diario_tarefa_operacao_privada(p_transporte);
 exception when others then
  get stacked diagnostics detalhe=pg_exception_detail;
  codigo:=case when sqlstate='PZ014' and detalhe in ('sem_permissao','conflito','conflito_idempotencia','servico_indisponivel') then detalhe when sqlstate in ('42501','22023') then 'sem_permissao' when sqlstate in ('23505','23503','23514') then 'conflito' else 'servico_indisponivel' end;
 end;
 begin req:=(p_transporte#>>'{entrada,request_id}')::uuid; paciente:=(p_transporte#>>'{entrada,paciente_id}')::uuid; sessao:=(auth_privado.jwt()->>'session_id')::uuid;
 exception when invalid_text_representation then raise exception using errcode='42501',message='SEM_PERMISSAO'; end;
 if ator is null or req is null or sessao is null or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 acao:=p_transporte#>>'{entrada,atestado,operacao}'; if acao not in ('api.consultar_conversao_diario_tarefa','api.converter_diario_tarefa') or acao is null then acao:='api.converter_diario_tarefa'; end if;
 if exists(select 1 from public.usuario where id=ator) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
 else
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
 end if;
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo',codigo),'request_id',req);
end $$;
revoke all on function api.conversao_diario_tarefa_privada(jsonb) from public,anon,authenticated,service_role;

-- Auditoria anterior ao cofre: deliberadamente sem HMAC/Vault. Esta primitiva
-- só registra tentativa NEGADA do próprio Auth/sessão; nunca autoriza conversão,
-- consulta recibo/origem ou aceita ator/resultado fornecidos pelo navegador.
create function api.registrar_negacao_conversao_diario_tarefa(p_request_id uuid,p_acao text,p_paciente_id uuid,p_origem_id uuid)
returns boolean language plpgsql security definer set search_path='' set row_security=on as $$
declare ator uuid:=auth_privado.uid(); sessao uuid; tipo text; alvo uuid;
begin
 begin sessao:=(auth_privado.jwt()->>'session_id')::uuid; exception when invalid_text_representation then raise exception using errcode='42501',message='SEM_PERMISSAO'; end;
 if ator is null or sessao is null or p_request_id is null or p_acao is null or p_acao not in ('api.consultar_conversao_diario_tarefa','api.converter_diario_tarefa')
  or bloqueios_auth.travar(ator,sessao) is distinct from true or not exists(select 1 from auth_privado.sessoes() a where a.id=sessao and a.user_id=ator and (a.not_after is null or a.not_after>clock_timestamp())) then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 tipo:=case when p_paciente_id is not null then 'paciente' when p_origem_id is not null then 'diario_registro' else 'requisicao' end; alvo:=coalesce(p_paciente_id,p_origem_id);
 if exists(select 1 from public.usuario where id=ator) then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,p_acao,tipo,alvo,'negado',p_request_id);
 else
  insert into auditoria.evento(id,ator_auth_id,acao,tipo_objeto,objeto_id,resultado,request_id) values(gen_random_uuid(),ator,p_acao,tipo,alvo,'negado',p_request_id);
 end if;
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if not exists(select 1 from auth_privado.sessoes() a where a.id=sessao and a.user_id=ator and (a.not_after is null or a.not_after>clock_timestamp())) then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 return true;
end $$;
revoke all on function api.registrar_negacao_conversao_diario_tarefa(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
-- Caminho concreto para futura validação: novas wrappers somente, flag permanece
-- false. ACL desconhecida provoca falha; nenhum grant de tabela/interna/Vault/role.
do $$ declare alvo record; begin
 for alvo in select * from (values('api.conversao_diario_tarefa_privada(jsonb)',false),('api.registrar_negacao_conversao_diario_tarefa(uuid,text,uuid,uuid)',true)) as alvos(assinatura,auditador) loop
  if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure(alvo.assinatura) and r.rolname='ffcmapp_conversao_diario_tarefa_owner'
   and not r.rolcanlogin and not r.rolsuper and not r.rolcreatedb and not r.rolcreaterole and not r.rolinherit and not r.rolbypassrls
   and not exists(select 1 from pg_auth_members m where m.member=r.oid) and p.prosecdef and p.prokind='f' and cardinality(p.proconfig)=2 and 'search_path=""'=any(p.proconfig) and 'row_security=on'=any(p.proconfig)
   and ((not alvo.auditador and p.pronargs=1 and p.proargtypes[0]='jsonb'::regtype and p.prorettype='jsonb'::regtype)
    or (alvo.auditador and p.pronargs=4 and p.proargtypes[0]='uuid'::regtype and p.proargtypes[1]='text'::regtype and p.proargtypes[2]='uuid'::regtype and p.proargtypes[3]='uuid'::regtype and p.prorettype='boolean'::regtype and p.pronargdefaults=0))) then raise exception 'WRAPPER_INESPERADO: %',alvo.assinatura; end if;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=to_regprocedure(alvo.assinatura) and (a.grantee<>p.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable))
   or has_function_privilege('authenticated',to_regprocedure(alvo.assinatura),'EXECUTE') or has_function_privilege('anon',to_regprocedure(alvo.assinatura),'EXECUTE') or has_function_privilege('service_role',to_regprocedure(alvo.assinatura),'EXECUTE') then raise exception 'ACL_INICIAL_INESPERADA: %',alvo.assinatura; end if;
  execute format('grant execute on function %s to authenticated',alvo.assinatura);
 end loop;
end $$;

reset role;
select set_config('role',current_setting('ffcmapp.conversao_migrador'),false);
revoke create on schema api from ffcmapp_conversao_diario_tarefa_owner;
revoke ffcmapp_conversao_diario_tarefa_owner from current_user;
-- Aplicação/ativação remotas permanecem pendentes; flag false não foi alterada.
