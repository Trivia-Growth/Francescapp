\set ON_ERROR_STOP on
-- Prova local da situação do caso e do responsável (tarefa 2.5). PostgreSQL descartável; Auth, Vault e
-- assinatura são fixtures fictícias e não comprovam serviço real. Toda chamada passa pelos wrappers api.*,
-- que executam como o papel dono da edição, então grants e políticas do papel são exercitados.
\ir contato_autorizacao_local.sql
\ir ../migrations/20261109110000_barreira_edicao_paciente_privada.sql
\ir ../migrations/20261109130000_edicao_paciente_composicao.sql
\ir ../migrations/20261110200000_edicao_paciente_wrappers_privados.sql
\ir ../migrations/20261110210000_consultar_paciente_edicao_privado.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261112120000_corrigir_reserva_barreira_contato.sql
\ir ../migrations/20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql
\ir ../migrations/20261113100000_acompanhamento_caso.sql

insert into auth.users values ('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004'),('10000000-0000-4000-8000-000000000005');
insert into public.usuario(id,perfil,ativo) values
 ('10000000-0000-4000-8000-000000000003','profissional',true),
 ('10000000-0000-4000-8000-000000000004','profissional',false),
 ('10000000-0000-4000-8000-000000000005','familia',true);

-- Ciclo completo de uma edição: reserva, gravação assinada, encerramento e reconhecimento. Nunca deixa a barreira presa.
create function public.editar_fixture(p_ator uuid,p_sessao uuid,p_paciente uuid,p_chave text,p_campos jsonb,
 p_motivo boolean default true,p_versao bigint default null) returns jsonb language plpgsql as $$
#variable_conflict use_variable
declare reserva uuid:=gen_random_uuid(); aud uuid:=gen_random_uuid(); comando uuid:=gen_random_uuid(); geracao bigint; versao bigint; e jsonb; r jsonb;
 env jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_ator,'session_id',p_sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select epoca into geracao from operacao.barreira_edicao_paciente where ator_usuario_id=p_ator;
 geracao:=coalesce(geracao,1);
 if operacao.reservar_edicao_paciente_privado(p_ator,geracao,reserva,p_paciente)<>'aberta' then raise exception 'RESERVA_FIXTURE'; end if;
 versao:=coalesce(p_versao,(select pa.versao from cadastro.paciente pa where pa.id=p_paciente));
 e:=jsonb_build_object('reserva_id',reserva,'geracao_reserva',geracao,'request_id',gen_random_uuid(),'paciente_id',p_paciente,
  'versao_esperada',versao,'auditoria_id',aud,'chave_idempotencia',p_chave,'digest_idempotencia',repeat('a',43))||p_campos;
 if p_motivo then
  e:=e||jsonb_build_object('motivo',env,'aad',coalesce(e->'aad','{}'::jsonb)||jsonb_build_object('motivo',
   jsonb_build_object('tabela','auditoria.evento','registro_id',aud::text,'campo','motivo','formato',1)));
 end if;
 begin
  r:=api.editar_paciente_privado(public.assinar_anamnese_fixture(e,'api.editar_paciente',p_ator,p_sessao));
 exception when others then
  r:=jsonb_build_object('ok',false,'excecao',sqlerrm);
 end;
 perform operacao.encerrar_edicao_paciente_privado(p_ator,geracao,reserva,comando);
 perform operacao.reconhecer_barreira_edicao_paciente_privado(comando,gen_random_uuid());
 return r;
end $$;

create function public.consultar_edicao_fixture(p_ator uuid,p_sessao uuid,p_paciente uuid) returns jsonb language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_ator,'session_id',p_sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 return api.consultar_paciente_edicao_privado(public.assinar_anamnese_fixture(
  jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',p_paciente),'api.consultar_paciente_edicao',p_ator,p_sessao));
end $$;

do $$
#variable_conflict use_variable
declare
 admin uuid:='10000000-0000-4000-8000-000000000001'; s_admin uuid:='20000000-0000-4000-8000-000000000001';
 prof uuid:='10000000-0000-4000-8000-000000000002'; s_prof uuid:='20000000-0000-4000-8000-000000000002';
 prof_ativo uuid:='10000000-0000-4000-8000-000000000003'; prof_inativo uuid:='10000000-0000-4000-8000-000000000004'; familia uuid:='10000000-0000-4000-8000-000000000005';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; r jsonb; n integer; v integer; acessos integer;
begin
 select count(*) into acessos from cadastro.acesso_paciente;

 -- Positivo: situação e responsável juntos, com motivo; a versão do caso é a do paciente.
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-1',jsonb_build_object('situacao','ativo','responsavel_id',prof_ativo));
 if r->>'ok' is distinct from 'true' then raise exception 'GRAVACAO_NEGADA: %',r; end if;
 if (select count(*) from cadastro.acompanhamento_caso where paciente_id=paciente)<>1
  or not exists(select 1 from cadastro.acompanhamento_caso a join auditoria.evento ev on ev.id=a.auditoria_id
   where a.paciente_id=paciente and a.versao=2 and a.situacao='ativo' and a.responsavel_usuario_id=prof_ativo
    and a.ator_usuario_id=admin and ev.resultado='permitido' and ev.motivo_cifrado is not null)
  or (select versao from cadastro.paciente where id=paciente)<>2 then
  raise exception 'LINHA_INICIAL_INCORRETA';
 end if;

 -- Mudança só de situação herda o responsável e preserva a linha anterior.
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-2',jsonb_build_object('situacao','pausado'));
 if r->>'ok' is distinct from 'true' then raise exception 'MUDANCA_NEGADA: %',r; end if;
 if not exists(select 1 from cadastro.acompanhamento_caso where paciente_id=paciente and versao=3 and situacao='pausado' and responsavel_usuario_id=prof_ativo)
  or not exists(select 1 from cadastro.acompanhamento_caso where paciente_id=paciente and versao=2 and situacao='ativo') then
  raise exception 'HISTORICO_INCORRETO';
 end if;

 -- Retomada: volta a ativo sem apagar nada nem criar acesso.
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-3',jsonb_build_object('situacao','ativo'));
 if r->>'ok' is distinct from 'true' or (select count(*) from cadastro.acompanhamento_caso where paciente_id=paciente)<>3 then raise exception 'RETOMADA_INCORRETA: %',r; end if;
 if (select count(*) from cadastro.acesso_paciente)<>acessos then raise exception 'RESPONSAVEL_CONCEDEU_ACESSO'; end if;

 -- Leitura do Administrador: histórico em ordem decrescente, motivo cifrado e responsável ativo.
 r:=public.consultar_edicao_fixture(admin,s_admin,paciente);
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,acompanhamento}')<>3
  or r#>>'{dados,acompanhamento,0,versao}'<>'4' or r#>>'{dados,acompanhamento,2,versao}'<>'2'
  or r#>>'{dados,acompanhamento,0,responsavel_ativo}'<>'true' or r#>'{dados,acompanhamento,0,motivo}' is null
  or r#>>'{dados,acompanhamento,0,situacao}'<>'ativo' then
  raise exception 'LEITURA_INCORRETA: %',r;
 end if;
 -- Leitura de Profissional: negada, sem situação, responsável nem motivo.
 r:=public.consultar_edicao_fixture(prof,s_prof,paciente);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'LEITURA_PROFISSIONAL_ACEITA: %',r; end if;

 -- Negativos de autorização: nada muda.
 select count(*), max(versao) into n, v from cadastro.acompanhamento_caso where paciente_id=paciente;
 r:=public.editar_fixture(prof,s_prof,paciente,'ac-n1',jsonb_build_object('situacao','encerrado'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROFISSIONAL_ACEITO: %',r; end if;
 update public.usuario set perfil='familia' where id=prof;
 r:=public.editar_fixture(prof,s_prof,paciente,'ac-n2',jsonb_build_object('situacao','encerrado'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA_ACEITA: %',r; end if;
 update public.usuario set perfil='profissional' where id=prof;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=s_admin;
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-n3',jsonb_build_object('situacao','encerrado'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ENCERRADA_ACEITA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=s_admin;
 update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=admin,
  motivo_revogacao_cifrado='{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}' where usuario_id=admin;
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-n4',jsonb_build_object('situacao','encerrado'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'CONCESSAO_REVOGADA_ACEITA: %',r; end if;
 update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=admin;

 -- Responsável não elegível: inexistente, Família, inativo.
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-n5',jsonb_build_object('responsavel_id',gen_random_uuid()));
 if r#>>'{erro,codigo}' is distinct from 'responsavel_invalido' then raise exception 'INEXISTENTE_ACEITO: %',r; end if;
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-n6',jsonb_build_object('responsavel_id',familia));
 if r#>>'{erro,codigo}' is distinct from 'responsavel_invalido' then raise exception 'FAMILIA_RESPONSAVEL_ACEITA: %',r; end if;
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-n7',jsonb_build_object('responsavel_id',prof_inativo));
 if r#>>'{erro,codigo}' is distinct from 'responsavel_invalido' then raise exception 'INATIVO_RESPONSAVEL_ACEITO: %',r; end if;

 -- Entrada inválida: situação fora do conjunto, responsável não-uuid, sem motivo, sem campo algum, versão antiga.
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-n8',jsonb_build_object('situacao','qualquer'));
 if r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'SITUACAO_INVALIDA_ACEITA: %',r; end if;
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-n9',jsonb_build_object('responsavel_id','nao-e-uuid'));
 if r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'RESPONSAVEL_NAO_UUID_ACEITO: %',r; end if;
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-n10',jsonb_build_object('situacao','encerrado'),false);
 if r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'SEM_MOTIVO_ACEITO: %',r; end if;
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-n11',jsonb_build_object());
 if r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'SEM_CAMPO_ACEITO: %',r; end if;
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-n12',jsonb_build_object('situacao','encerrado'),true,1);
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'VERSAO_ANTIGA_ACEITA: %',r; end if;
 if (select count(*)||'/'||max(versao) from cadastro.acompanhamento_caso where paciente_id=paciente) is distinct from n||'/'||v
  or (select versao from cadastro.paciente where id=paciente)<>4 then
  raise exception 'NEGATIVAS_ALTERARAM_O_CASO';
 end if;
 if not exists(select 1 from auditoria.evento where acao='api.editar_paciente' and resultado='negado' and ator_usuario_id=admin) then
  raise exception 'AUDITORIA_NEGADA_AUSENTE';
 end if;

 -- Responsável desativado depois da indicação: a leitura sinaliza inativo e o histórico continua.
 update public.usuario set ativo=false where id=prof_ativo;
 r:=public.consultar_edicao_fixture(admin,s_admin,paciente);
 if r#>>'{dados,acompanhamento,0,responsavel_ativo}'<>'false' or jsonb_array_length(r#>'{dados,acompanhamento}')<>3 then raise exception 'INATIVO_NAO_SINALIZADO: %',r; end if;
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-n13',jsonb_build_object('responsavel_id',prof_ativo));
 if r#>>'{erro,codigo}' is distinct from 'responsavel_invalido' then raise exception 'REINDICACAO_INATIVO_ACEITA: %',r; end if;
 update public.usuario set ativo=true where id=prof_ativo;

 -- Nova indicação do mesmo ou de outro responsável elegível, inclusive o próprio Administrador.
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-4',jsonb_build_object('responsavel_id',admin));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from cadastro.acompanhamento_caso where paciente_id=paciente and versao=5 and situacao='ativo' and responsavel_usuario_id=admin) then
  raise exception 'NOVA_INDICACAO_INCORRETA: %',r;
 end if;
end $$;

-- Edição sem situação nem responsável segue como antes e não cria linha de acompanhamento.
do $$
#variable_conflict use_variable
declare admin uuid:='10000000-0000-4000-8000-000000000001'; s_admin uuid:='20000000-0000-4000-8000-000000000001';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; r jsonb; antes integer; env jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('b',16),'ciphertext','YQ','tag',repeat('b',22));
begin
 select count(*) into antes from cadastro.acompanhamento_caso;
 r:=public.editar_fixture(admin,s_admin,paciente,'ac-nome',jsonb_build_object('nome',env,'aad',jsonb_build_object('nome',
  jsonb_build_object('tabela','cadastro.paciente','registro_id',paciente::text,'campo','nome','formato',1))));
 if r->>'ok' is distinct from 'true' or (select count(*) from cadastro.acompanhamento_caso)<>antes or (select versao from cadastro.paciente where id=paciente)<>6 then
  raise exception 'EDICAO_DE_NOME_REGREDIU: %',r;
 end if;
end $$;

-- Repetição com a mesma chave na mesma reserva não duplica a linha.
do $$
#variable_conflict use_variable
declare admin uuid:='10000000-0000-4000-8000-000000000001'; s_admin uuid:='20000000-0000-4000-8000-000000000001';
 paciente uuid:='40000000-0000-4000-8000-000000000001'; prof_ativo uuid:='10000000-0000-4000-8000-000000000003';
 reserva uuid:=gen_random_uuid(); aud uuid:=gen_random_uuid(); geracao bigint; e jsonb; t jsonb; r1 jsonb; r2 jsonb; antes integer;
 env jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'session_id',s_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select epoca into geracao from operacao.barreira_edicao_paciente where ator_usuario_id=admin;
 if operacao.reservar_edicao_paciente_privado(admin,geracao,reserva,paciente)<>'aberta' then raise exception 'RESERVA_REPETICAO'; end if;
 e:=jsonb_build_object('reserva_id',reserva,'geracao_reserva',geracao,'request_id',gen_random_uuid(),'paciente_id',paciente,
  'versao_esperada',(select versao from cadastro.paciente where id=paciente),'auditoria_id',aud,'chave_idempotencia','ac-repeticao',
  'digest_idempotencia',repeat('a',43),'situacao','transferido','responsavel_id',prof_ativo,'motivo',env,
  'aad',jsonb_build_object('motivo',jsonb_build_object('tabela','auditoria.evento','registro_id',aud::text,'campo','motivo','formato',1)));
 t:=public.assinar_anamnese_fixture(e,'api.editar_paciente',admin,s_admin);
 select count(*) into antes from cadastro.acompanhamento_caso;
 r1:=api.editar_paciente_privado(t);
 e:=jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid()::text));
 r2:=api.editar_paciente_privado(public.assinar_anamnese_fixture(e,'api.editar_paciente',admin,s_admin));
 if r1->>'ok' is distinct from 'true' or r2->>'ok' is distinct from 'true' or r2->>'repeticao' is distinct from 'true'
  or (select count(*) from cadastro.acompanhamento_caso)<>antes+1 then
  raise exception 'REPETICAO_DUPLICOU: % %',r1,r2;
 end if;
 perform operacao.encerrar_edicao_paciente_privado(admin,geracao,reserva,'a0000000-0000-4000-8000-000000000001');
 perform operacao.reconhecer_barreira_edicao_paciente_privado('a0000000-0000-4000-8000-000000000001',gen_random_uuid());
end $$;

-- Imutabilidade e privilégios: nenhum papel altera ou apaga o histórico, nem a aplicação lê a tabela.
do $$
declare alvo text;
begin
 foreach alvo in array array['update cadastro.acompanhamento_caso set situacao=''ativo''','delete from cadastro.acompanhamento_caso','truncate cadastro.acompanhamento_caso'] loop
  begin
   execute alvo;
   raise exception 'HISTORICO_ALTERAVEL: %',alvo;
  exception when insufficient_privilege then
   if sqlerrm <> 'REGISTRO_IMUTAVEL' then raise; end if;
  end;
  begin
   execute 'set local role ffcmapp_edicao_paciente_owner';
   execute alvo;
   raise exception 'DONO_ALTERA_HISTORICO: %',alvo;
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
 end loop;
 if has_table_privilege('authenticated','cadastro.acompanhamento_caso','select')
  or has_table_privilege('anon','cadastro.acompanhamento_caso','select')
  or has_table_privilege('service_role','cadastro.acompanhamento_caso','select')
  or has_table_privilege('authenticated','cadastro.acompanhamento_caso','insert')
  or has_table_privilege('ffcmapp_edicao_paciente_owner','cadastro.acompanhamento_caso','update')
  or has_table_privilege('ffcmapp_edicao_paciente_owner','cadastro.acompanhamento_caso','delete')
  or has_table_privilege('ffcmapp_edicao_paciente_owner','cadastro.acompanhamento_caso','truncate') then
  raise exception 'PRIVILEGIO_INDEVIDO';
 end if;
 if not (select relrowsecurity from pg_class where oid='cadastro.acompanhamento_caso'::regclass) then raise exception 'RLS_DESLIGADA'; end if;
end $$;

-- Privilégios acrescentados ao dono da edição (revisão independente): ele enxerga só usuário elegível e só o
-- motivo cifrado dos eventos referenciados, e a trava de elegibilidade não altera o usuário. Também prova que
-- nenhuma regra de acesso lê o responsável (designar não concede leitura) e que a consulta de edição nega Família.
do $$
#variable_conflict use_variable
declare
 admin uuid:='10000000-0000-4000-8000-000000000001'; prof uuid:='10000000-0000-4000-8000-000000000002';
 s_prof uuid:='20000000-0000-4000-8000-000000000002';
 prof_ativo uuid:='10000000-0000-4000-8000-000000000003'; prof_inativo uuid:='10000000-0000-4000-8000-000000000004';
 familia uuid:='10000000-0000-4000-8000-000000000005'; paciente uuid:='40000000-0000-4000-8000-000000000001';
 n integer; r jsonb;
begin
 execute 'set local role ffcmapp_edicao_paciente_owner';
 select count(*) into n from public.usuario where id in (prof_inativo, familia);
 if n<>0 then raise exception 'DONO_VE_USUARIO_INELEGIVEL: %',n; end if;
 select count(*) into n from public.usuario where id in (admin, prof_ativo);
 if n<>2 then raise exception 'DONO_NAO_VE_USUARIO_ELEGIVEL: %',n; end if;
 select count(*) into n from auditoria.evento ev
  where not exists (select 1 from cadastro.acompanhamento_caso a where a.auditoria_id=ev.id);
 if n<>0 then raise exception 'DONO_LE_EVENTO_NAO_REFERENCIADO: %',n; end if;
 begin
  update public.usuario set ativo=false where id=admin;
  raise exception 'DONO_ALTEROU_USUARIO';
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
 if not (select ativo from public.usuario where id=admin) then raise exception 'USUARIO_ALTERADO_PELA_TRAVA'; end if;

 -- Designar responsável não concede leitura: só as duas funções de edição citam a coluna, e nenhuma política a usa.
 if exists(select 1 from pg_proc p join pg_namespace s on s.oid=p.pronamespace
   where p.prosrc like '%responsavel_usuario_id%' and p.proname not in ('editar_paciente_privado','consultar_paciente_edicao_privado')) then
  raise exception 'REGRA_LE_RESPONSAVEL';
 end if;
 if exists(select 1 from pg_policies where qual like '%responsavel_usuario_id%' or with_check like '%responsavel_usuario_id%') then
  raise exception 'POLITICA_LE_RESPONSAVEL';
 end if;

 -- Anônimo não executa as RPCs de edição; Família é negada na consulta, sem dados.
 if to_regprocedure('api.editar_paciente_privado(jsonb)') is null or to_regprocedure('api.consultar_paciente_edicao_privado(jsonb)') is null then
  raise exception 'RPC_DE_EDICAO_AUSENTE';
 end if;
 if has_function_privilege('anon','api.editar_paciente_privado(jsonb)','execute')
  or has_function_privilege('anon','api.consultar_paciente_edicao_privado(jsonb)','execute') then
  raise exception 'ANON_EXECUTA_RPC_DE_EDICAO';
 end if;
 update public.usuario set perfil='familia' where id=prof;
 r:=public.consultar_edicao_fixture(prof,s_prof,paciente);
 update public.usuario set perfil='profissional' where id=prof;
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FAMILIA_CONSULTA_EDICAO_ACEITA: %',r; end if;
end $$;
