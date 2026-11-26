\set ON_ERROR_STOP on
-- PREPARADO, NÃO EXECUTADO. Mesma cadeia pós-DF-023, somente Auth/Vault fictícios.
\ir acessos_gerenciados_local.sql
\ir ../migrations/20261125180000_documentos_preautorizacao.sql
\ir ../migrations/20261125185000_documentos_pastas.sql

create function public.documento_entrada_previa_fixture(paciente uuid, documento uuid, esperada integer, chave text) returns jsonb language sql as $$
 select jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'documento_id',documento,'registro_id',gen_random_uuid(),
 'versao_esperada',esperada,'chave_idempotencia',chave,'digest_idempotencia',repeat('d',43),'categoria','Documento fictício',
 'origem',null,'data_documento',null,'audiencia','equipe','estado','disponivel','conteudo',public.acessos_envelope_fixture(),
 'aad',jsonb_build_object('tabela','cadastro.documento_caso_versao','paciente_id',paciente::text,'registro_id','substituir','versao',esperada+1,'campo','conteudo','formato',1));
$$;
create function public.documento_pedir_previa_fixture(e jsonb, previa boolean, acao text default 'api.gravar_documento') returns jsonb language plpgsql as $$
declare t jsonb;r jsonb;begin
 if e ? 'aad' then e:=jsonb_set(e,'{aad,registro_id}',e->'registro_id');end if;
 t:=public.acessos_assinar_fixture(e,acao);
 set local role authenticated;
 if previa then r:=api.documento_preautorizar_privada(jsonb_build_object('p_transporte',t)->'p_transporte');
 else r:=api.documento_operacao_privada(jsonb_build_object('p_transporte',t)->'p_transporte');end if;
 reset role;return r;
end $$;
revoke all on function public.documento_entrada_previa_fixture(uuid,uuid,integer,text),public.documento_pedir_previa_fixture(jsonb,boolean,text) from public,anon,authenticated,service_role;

-- A matriz anterior encerra as sessões como prova negativa; reabrir só as fixtures locais.
update identidade.sessao set encerrada_em=null where session_id in (select sid from acessos_contas_fixture);
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('44000000-0000-4000-8000-00000000d001',public.acessos_envelope_fixture(),'11000000-0000-4000-8000-000000000001'),
 ('44000000-0000-4000-8000-00000000d002',public.acessos_envelope_fixture(),'11000000-0000-4000-8000-000000000001');
-- Vínculo somente A; B existe, mas não pertence à carteira profissional.
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
 select gen_random_uuid(),'44000000-0000-4000-8000-00000000d001',usuario_id,'11000000-0000-4000-8000-000000000001',public.acessos_envelope_fixture()
 from acessos_contas_fixture where funcao in ('profissional','familia');

do $$
#variable_conflict use_variable
declare c record; paciente uuid; alvo uuid; e jsonb;r jsonb;req uuid;antes bigint;
begin
 for c in select * from acessos_contas_fixture where funcao in ('profissional','familia') loop
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
  foreach paciente in array array['44000000-0000-4000-8000-00000000d001'::uuid,'44000000-0000-4000-8000-00000000d002'::uuid] loop
   alvo:=gen_random_uuid(); e:=public.documento_entrada_previa_fixture(paciente,alvo,0,alvo::text);
   select count(*) into antes from cadastro.documento_caso_versao;
   r:=public.documento_pedir_previa_fixture(e,true);
   if (r->>'ok'='true') is distinct from (c.funcao='profissional' and paciente='44000000-0000-4000-8000-00000000d001') then raise exception 'PREVIA_CASO_PERFIL: % % %',c.funcao,paciente,r;end if;
   if (select count(*) from cadastro.documento_caso_versao)<>antes or exists(select 1 from operacao.requisicao where chave_idempotencia=alvo::text) then raise exception 'PREVIA_PERSISTIU_CONTEUDO';end if;
   r:=public.documento_pedir_previa_fixture(e,false);
   if (r->>'ok'='true') is distinct from (c.funcao='profissional' and paciente='44000000-0000-4000-8000-00000000d001') then raise exception 'FINAL_CASO_PERFIL: %',r;end if;
   r:=public.documento_pedir_previa_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),false,'api.ler_documentos');
   if paciente='44000000-0000-4000-8000-00000000d002' and (r->>'ok' is distinct from 'false' or r?'dados') then raise exception 'LEITURA_OUTRO_CASO';end if;
  end loop;
  -- Prévia antes da revogação não autoriza final nem replay posteriores.
  paciente:='44000000-0000-4000-8000-00000000d001';alvo:=gen_random_uuid();e:=public.documento_entrada_previa_fixture(paciente,alvo,0,alvo::text);
  r:=public.documento_pedir_previa_fixture(e,true);
  update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='11000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=public.acessos_envelope_fixture() where usuario_id=c.usuario_id and paciente_id=paciente;
  r:=public.documento_pedir_previa_fixture(e,true);if r->>'ok' is distinct from 'false' then raise exception 'PREVIA_REVOGACAO';end if;
  r:=public.documento_pedir_previa_fixture(e,false);if r->>'ok' is distinct from 'false' then raise exception 'FINAL_REVOGACAO';end if;
  r:=public.documento_pedir_previa_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente),false,'api.ler_documentos');if r->>'ok' is distinct from 'false' or r?'dados' then raise exception 'LEITURA_REVOGACAO';end if;
 end loop;
 -- Administração preserva alçada existente, sem fabricar vínculo.
 perform public.acessos_claims_fixture('11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','oauth');
 alvo:=gen_random_uuid();e:=public.documento_entrada_previa_fixture('44000000-0000-4000-8000-00000000d002',alvo,0,alvo::text);
 r:=public.documento_pedir_previa_fixture(e,true);if r->>'ok' is distinct from 'true' then raise exception 'ADMIN_PREVIA';end if;
 r:=public.documento_pedir_previa_fixture(e,false);if r->>'ok' is distinct from 'true' then raise exception 'ADMIN_FINAL';end if;
 r:=public.documento_pedir_previa_fixture(e,true);if r->>'repeticao' is distinct from 'true' then raise exception 'REPLAY_PREVIA';end if;
 -- Falha auditoria em prévia e final nunca retorna autorização/sucesso.
 perform set_config('fixture.acessos_suprimir','sim',true);
 alvo:=gen_random_uuid();e:=public.documento_entrada_previa_fixture('44000000-0000-4000-8000-00000000d002',alvo,0,alvo::text);
 begin r:=public.documento_pedir_previa_fixture(e,true);raise exception 'PREVIA_SEM_AUDITORIA';exception when no_data_found then null;end;
 begin r:=public.documento_pedir_previa_fixture(e,false);raise exception 'FINAL_SEM_AUDITORIA';exception when no_data_found then null;end;
 if exists(select 1 from cadastro.documento_caso where id=alvo) then raise exception 'FINAL_PERSISTIU_SEM_AUDITORIA';end if;
end $$;
do $$ begin
 if has_function_privilege('anon','api.documento_preautorizar_privada(jsonb)','execute') or has_function_privilege('service_role','api.documento_preautorizar_privada(jsonb)','execute')
  or has_table_privilege('authenticated','cadastro.documento_caso_versao','select') then raise exception 'ACESSO_DIRETO_AMPLIADO';end if;
end $$;


-- Reserva imutável por paciente+raiz: candidatas posteriores retornam mesmo ID/marcador.
do $$
#variable_conflict use_variable
declare e jsonb;t jsonb;previa jsonb;r jsonb;outro jsonb;alvo uuid:=gen_random_uuid();req uuid;linha record;antes bigint;
begin
 perform public.acessos_claims_fixture('11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','oauth');
 e:=public.documento_entrada_previa_fixture('44000000-0000-4000-8000-00000000d002',alvo,0,alvo::text);
 e:=jsonb_set(e,'{aad,registro_id}',e->'registro_id');previa:=public.acessos_assinar_fixture(e,'api.gravar_documento');req:=(e->>'request_id')::uuid;
 t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',req,'paciente_id',e->'paciente_id','raiz','raiz-ficticia','candidata','pasta-candidata-1','marcador',repeat('m',43)),'api.gravar_documento');
 set local role authenticated;r:=api.documento_pasta_reservar_privada(t,previa);reset role;
 if r#>>'{dados,pasta_id}' is distinct from 'pasta-candidata-1' then raise exception 'PRIMEIRA_PASTA';end if;
 t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',req,'paciente_id',e->'paciente_id','raiz','raiz-ficticia','candidata','pasta-candidata-2','marcador',repeat('n',43)),'api.gravar_documento');
 set local role authenticated;outro:=api.documento_pasta_reservar_privada(t,previa);reset role;
 if outro#>'{dados}' is distinct from r#>'{dados}' or (select count(*) from cadastro.documento_pasta where raiz='raiz-ficticia')<>1 then raise exception 'PASTA_DUPLICADA';end if;
 -- Raiz é namespace distinto e autorizado pela prova assinada do servidor.
 t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',req,'paciente_id',e->'paciente_id','raiz','outra-raiz-ficticia','candidata','pasta-outra-raiz','marcador',repeat('m',43)),'api.gravar_documento');
 set local role authenticated;outro:=api.documento_pasta_reservar_privada(t,previa);reset role;
 if outro#>>'{dados,pasta_id}' is distinct from 'pasta-outra-raiz' then raise exception 'RAIZ_NAO_ISOLADA';end if;
 -- Prova de pasta trocada/adulterada não reaproveita a autorização do caso original.
 t:=jsonb_set(t,'{entrada,paciente_id}','"44000000-0000-4000-8000-00000000d001"'::jsonb);
 begin set local role authenticated;r:=api.documento_pasta_reservar_privada(t,previa);reset role;raise exception 'PASTA_PROVA_ADULTERADA';exception when insufficient_privilege then reset role;end;
 -- Auditoria faltante desfaz reserva na mesma transação.
 perform set_config('fixture.acessos_suprimir','sim',true);
 t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',req,'paciente_id',e->'paciente_id','raiz','raiz-auditoria-ficticia','candidata','pasta-auditoria','marcador',repeat('m',43)),'api.gravar_documento');
 begin set local role authenticated;r:=api.documento_pasta_reservar_privada(t,previa);reset role;raise exception 'PASTA_SEM_AUDITORIA';exception when no_data_found then reset role;end;
 if exists(select 1 from cadastro.documento_pasta where raiz='raiz-auditoria-ficticia') then raise exception 'PASTA_RESERVADA_SEM_AUDITORIA';end if;
end $$;
do $$ begin
 if has_table_privilege('authenticated','cadastro.documento_pasta','select') or has_table_privilege('service_role','cadastro.documento_pasta','select') or has_function_privilege('anon','api.documento_pasta_reservar_privada(jsonb,jsonb)','execute') then raise exception 'REGISTRO_PASTA_PUBLICO';end if;
end $$;

-- Papel familiar e vínculo profissional revogado não consultam nem reservam ID de pasta.
do $$
#variable_conflict use_variable
declare c record;e jsonb;t jsonb;previa jsonb;r jsonb;alvo uuid;antes bigint;
begin
 for c in select * from acessos_contas_fixture where funcao in ('profissional','familia') loop
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
  alvo:=gen_random_uuid();e:=public.documento_entrada_previa_fixture('44000000-0000-4000-8000-00000000d001',alvo,0,alvo::text);
  e:=jsonb_set(e,'{aad,registro_id}',e->'registro_id');previa:=public.acessos_assinar_fixture(e,'api.gravar_documento');
  t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',e->'request_id','paciente_id',e->'paciente_id','raiz','raiz-negada','candidata',alvo::text,'marcador',repeat('m',43)),'api.gravar_documento');
  select count(*) into antes from cadastro.documento_pasta;
  begin set local role authenticated;r:=api.documento_pasta_reservar_privada(t,previa);reset role;raise exception 'PASTA_NEGATIVA_ACEITA';exception when insufficient_privilege then reset role;end;
  if (select count(*) from cadastro.documento_pasta)<>antes then raise exception 'PASTA_NEGATIVA_PERSISTIU';end if;
 end loop;
end $$;
