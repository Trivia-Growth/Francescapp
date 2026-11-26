\set ON_ERROR_STOP on
-- Dados fictícios e assinador sintético: não comprovam integração Auth/Vault real.
\ir diario_operacoes_local.sql
\ir ../migrations/20261111140000_tarefa_cuidado_versoes_privadas.sql
\ir ../migrations/20261111150000_tarefa_cuidado_operacoes_privadas.sql
\ir ../migrations/20261111190000_tarefa_cuidado_idempotencia_privada.sql
\ir ../migrations/20261112270000_auditoria_tarefas_auth_nao_admitido.sql
\ir ../migrations/20261112280000_leitura_tarefas_cuidado_privada.sql
\ir ../migrations/20261112300000_barreira_tarefa_cuidado_privada.sql
\ir ../migrations/20261125110000_tarefa_autorizacao_somente.sql
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261118230000_configuracao_diario.sql
insert into identidade.configuracao_sistema(id,chave,valor,tipo,rotulo,exposicao) values
(gen_random_uuid(),'ffcm.tarefas.ativas','true','booleano','Fixture tarefas','servidor'),
(gen_random_uuid(),'ffcm.tarefas.escrita_ativa','true','booleano','Fixture escrita tarefas','servidor'),
(gen_random_uuid(),'ffcm.tarefas.barreira_ativa','true','booleano','Fixture barreira tarefas','servidor');
update identidade.configuracao_sistema set valor='true' where chave='ffcm.diario.ativo';
update public.usuario set ativo=true,perfil='profissional' where id in ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003');
update identidade.concessao_equipe set estado='vinculada',perfil='profissional',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id in ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003');
update identidade.sessao set revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null,encerrada_em=null where usuario_id in ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003');
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
 select gen_random_uuid(),'40000000-0000-4000-8000-000000000001',u.id,'10000000-0000-4000-8000-000000000001',public.envelope_diario_fixture('a') from public.usuario u
 where u.id in ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003') and not exists(select 1 from cadastro.acesso_paciente ap where ap.paciente_id='40000000-0000-4000-8000-000000000001' and ap.usuario_id=u.id and ap.revogada_em is null);
-- Caso existente sem vínculo do profissional 2: negativa não depende de inexistência.
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id)
 select '40000000-0000-4000-8000-000000000002',public.envelope_diario_fixture('a'),'10000000-0000-4000-8000-000000000001' where not exists(select 1 from cadastro.paciente where id='40000000-0000-4000-8000-000000000002');
-- Administrador possui vínculo para isolar o perfil como causa da negativa.
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
 select gen_random_uuid(),'40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',public.envelope_diario_fixture('a') where not exists(select 1 from cadastro.acesso_paciente where paciente_id='40000000-0000-4000-8000-000000000001' and usuario_id='10000000-0000-4000-8000-000000000001' and revogada_em is null);
create function public.origem_conversao_fixture(p_paciente uuid,p_estado text default 'publicado',p_tipo text default 'evolucao_profissional',p_autor uuid default '10000000-0000-4000-8000-000000000002') returns uuid language plpgsql as $$
declare origem uuid:=gen_random_uuid(); begin
 insert into cadastro.diario_registro(id,paciente_id,tipo,autor_usuario_id) values(origem,p_paciente,p_tipo,p_autor);
 insert into cadastro.diario_registro_versao(id,diario_registro_id,versao,estado,audiencia,conteudo_cifrado,criado_por_usuario_id,aconteceu_em,area)
 values(gen_random_uuid(),origem,1,p_estado,'equipe',public.envelope_diario_fixture('a'),p_autor,'2026-11-18','Psicologia'); return origem;
end $$;
create function public.reserva_conversao_fixture(p_ator uuid,p_paciente uuid,p_tarefa uuid,p_reserva uuid) returns bigint language plpgsql as $$
declare sessao uuid:=replace(p_ator::text,'10000000-','20000000-')::uuid; resposta jsonb; e jsonb; epoca bigint; comando uuid;
begin
 perform public.claims_diario_fixture(p_ator,sessao,'oauth');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_tarefa_cuidado');
 resposta:=api.tarefa_barreira_composicao(public.assinar_diario_fixture(e,'api.consultar_barreira_tarefa_cuidado',p_ator,sessao));
 if resposta->>'ok' is distinct from 'true' then raise exception 'CONSULTA_BARREIRA_FIXTURE_FALHOU'; end if;
 if resposta#>'{dados,resultado_pendente}'<>'null'::jsonb then
  e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reconhecer_barreira_tarefa_cuidado','comando_id',resposta#>>'{dados,resultado_pendente,recibo_id}');
  resposta:=api.tarefa_barreira_composicao(public.assinar_diario_fixture(e,'api.reconhecer_barreira_tarefa_cuidado',p_ator,sessao));
 elsif resposta#>'{dados,reserva}'<>'null'::jsonb then
  comando:=gen_random_uuid(); e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.encerrar_tarefa_cuidado','epoca',resposta#>'{dados,epoca}','reserva_id',resposta#>>'{dados,reserva,id}','comando_id',comando);
  resposta:=api.tarefa_barreira_composicao(public.assinar_diario_fixture(e,'api.encerrar_tarefa_cuidado',p_ator,sessao));
  e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reconhecer_barreira_tarefa_cuidado','comando_id',comando);
  resposta:=api.tarefa_barreira_composicao(public.assinar_diario_fixture(e,'api.reconhecer_barreira_tarefa_cuidado',p_ator,sessao));
 end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_tarefa_cuidado');
 resposta:=api.tarefa_barreira_composicao(public.assinar_diario_fixture(e,'api.consultar_barreira_tarefa_cuidado',p_ator,sessao)); epoca:=(resposta#>>'{dados,epoca}')::bigint;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_tarefa_cuidado','epoca',epoca,'reserva_id',p_reserva,'paciente_id',p_paciente,'tarefa_id',p_tarefa,'versao_esperada',0);
 resposta:=api.tarefa_barreira_composicao(public.assinar_diario_fixture(e,'api.reservar_tarefa_cuidado',p_ator,sessao));
 if resposta#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA_FIXTURE_FALHOU'; end if; return epoca;
end $$;
create function public.transporte_conversao_fixture(p_ator uuid,p_paciente uuid,p_origem uuid,p_versao integer,p_tarefa uuid,p_evolucao uuid,p_reserva uuid,p_geracao bigint,p_chave text,p_digest text,p_consulta boolean default false) returns jsonb language plpgsql as $$
declare sessao uuid:=replace(p_ator::text,'10000000-','20000000-')::uuid; req uuid:=gen_random_uuid(); registro_tarefa uuid:=gen_random_uuid(); registro_diario uuid:=gen_random_uuid(); e jsonb; t jsonb; d jsonb; auth_t jsonb;
begin
 auth_t:=public.assinar_diario_fixture(jsonb_build_object('request_id',req,'paciente_id',p_paciente,'autorizacao_somente',true),'api.ler_tarefas_cuidado',p_ator,sessao);
 e:=jsonb_build_object('request_id',req,'paciente_id',p_paciente,'origem_id',p_origem,'autorizacao_tarefa',auth_t);
 if not p_consulta then
  t:=jsonb_build_object('request_id',req,'paciente_id',p_paciente,'tarefa_id',p_tarefa,'registro_id',registro_tarefa,'versao_esperada',0,'reserva_id',p_reserva,'geracao_reserva',p_geracao,'chave_idempotencia',p_chave,'digest_idempotencia',repeat('a',43),'conteudo',public.envelope_diario_fixture('a'),'aad',jsonb_build_object('tabela','cadastro.tarefa_cuidado_versao','paciente_id',p_paciente,'tarefa_id',p_tarefa,'registro_id',registro_tarefa,'versao',1,'campo','conteudo','formato',1));
  d:=jsonb_build_object('request_id',req,'paciente_id',p_paciente,'diario_registro_id',p_evolucao,'registro_id',registro_diario,'versao_esperada',0,'tipo','evolucao_profissional','estado','publicado','audiencia','equipe','atencao',true,'retorno_solicitado',false,'origem_conteudo','texto','tarefa_id',p_tarefa,'chave_idempotencia',p_chave,'digest_idempotencia',repeat('b',43),'conteudo',public.envelope_diario_fixture('b'),'aad',public.aad_diario_fixture(p_paciente,p_evolucao,registro_diario,1,'conteudo'),'aconteceu_em','2026-11-18','area','Psicologia');
  e:=e||jsonb_build_object('origem_versao',p_versao,'chave_idempotencia',p_chave,'digest_idempotencia',p_digest,'tarefa',public.assinar_diario_fixture(t,'api.gravar_tarefa_cuidado',p_ator,sessao),'diario',public.assinar_diario_fixture(d,'api.gravar_diario',p_ator,sessao));
 end if;
 return public.assinar_diario_fixture(e,case when p_consulta then 'api.consultar_conversao_diario_tarefa' else 'api.converter_diario_tarefa' end,p_ator,sessao);
end $$;
