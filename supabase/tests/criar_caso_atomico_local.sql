\set ON_ERROR_STOP on
-- Prova local do cadastro de caso novo atômico (tarefa 2.17). PostgreSQL descartável; Auth, Vault e assinatura
-- são fixtures fictícias e não comprovam serviço real. Toda chamada passa por api.criar_paciente, que executa
-- como o papel dono da criação, então grants e políticas do papel são exercitados.
\ir contato_autorizacao_local.sql
\ir ../migrations/20261109110000_barreira_edicao_paciente_privada.sql
\ir ../migrations/20261109130000_edicao_paciente_composicao.sql
\ir ../migrations/20261110200000_edicao_paciente_wrappers_privados.sql
\ir ../migrations/20261110210000_consultar_paciente_edicao_privado.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261112120000_corrigir_reserva_barreira_contato.sql
\ir ../migrations/20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql
\ir ../migrations/20261113100000_acompanhamento_caso.sql
\ir ../migrations/20261113110000_situacao_na_lista.sql
\ir ../migrations/20261113120000_criar_caso_atomico.sql

insert into auth.users values ('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004'),('10000000-0000-4000-8000-000000000005');
insert into public.usuario(id,perfil,ativo) values
 ('10000000-0000-4000-8000-000000000003','profissional',true),
 ('10000000-0000-4000-8000-000000000004','profissional',false),
 ('10000000-0000-4000-8000-000000000005','familia',true);

create table public.reserva_aberta_fixture(ator uuid,geracao bigint,reserva uuid);
-- Fecha a reserva em aberto; falhar aqui é falha da prova, nunca é engolido.
create function public.fechar_reserva_fixture() returns void language plpgsql as $$
declare v_x public.reserva_aberta_fixture; v_comando uuid:=gen_random_uuid();
begin
 select * into v_x from public.reserva_aberta_fixture;
 perform operacao.encerrar_cadastro_privado(v_x.ator,v_x.geracao,v_x.reserva,v_comando);
 perform operacao.reconhecer_barreira_cadastro_privado(v_comando,gen_random_uuid());
 delete from public.reserva_aberta_fixture;
end $$;

-- Ciclo de uma criação: reserva, gravação assinada, encerramento e reconhecimento. Nunca deixa a barreira presa.
-- p_extra sobrescreve campos da entrada; p_remover tira campos (e o AAD correspondente) para os negativos.
create function public.criar_fixture(p_ator uuid,p_sessao uuid,p_chave text,p_paciente uuid default gen_random_uuid(),
 p_extra jsonb default '{}',p_remover text[] default '{}',p_contatos integer default 2,p_situacao text default 'entrada',
 p_responsavel uuid default '10000000-0000-4000-8000-000000000003',p_fechar boolean default true) returns jsonb language plpgsql as $$
declare
 v_reserva uuid:=gen_random_uuid(); v_aud uuid:=gen_random_uuid(); v_comando uuid:=gen_random_uuid(); v_geracao bigint;
 v_env jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
 v_e jsonb; v_r jsonb; v_contatos jsonb:='[]'::jsonb; v_c uuid; v_i integer;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_ator,'session_id',p_sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select epoca into v_geracao from operacao.barreira_cadastro where ator_usuario_id=p_ator;
 v_geracao:=coalesce(v_geracao,1);
 if operacao.reservar_cadastro_privado(p_ator,v_geracao,v_reserva)<>'aberta' then raise exception 'RESERVA_FIXTURE'; end if;
 delete from public.reserva_aberta_fixture;
 insert into public.reserva_aberta_fixture values (p_ator,v_geracao,v_reserva);
 for v_i in 1..p_contatos loop
  v_c:=gen_random_uuid();
  v_contatos:=v_contatos||jsonb_build_array(jsonb_build_object('contato_id',v_c,'tipo',case when v_i%2=1 then 'email' else 'telefone' end,'valor',v_env,
   'aad',jsonb_build_object('tabela','cadastro.contato_paciente','registro_id',v_c::text,'campo','valor','formato',1)));
 end loop;
 v_e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',p_paciente,'reserva_id',v_reserva,'geracao_reserva',v_geracao,
  'auditoria_id',v_aud,'chave_idempotencia',p_chave,'digest_idempotencia',repeat('a',43),
  'nome',v_env,'nome_preferencia',v_env,'data_nascimento',v_env,'contatos',v_contatos,'situacao',p_situacao,'responsavel_id',p_responsavel,
  'aad',jsonb_build_object(
   'nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',p_paciente::text,'campo','nome','formato',1),
   'nome_preferencia',jsonb_build_object('tabela','cadastro.paciente','registro_id',p_paciente::text,'campo','nome_preferencia','formato',1),
   'data_nascimento',jsonb_build_object('tabela','cadastro.paciente','registro_id',p_paciente::text,'campo','data_nascimento','formato',1)))||p_extra;
 v_e:=jsonb_set(v_e-p_remover,'{aad}',(v_e->'aad')-p_remover);
 begin
  v_r:=api.criar_paciente(public.assinar_anamnese_fixture(v_e,'api.criar_paciente',p_ator,p_sessao));
 exception when others then
  v_r:=jsonb_build_object('ok',false,'excecao',sqlerrm);
 end;
 if p_fechar then perform public.fechar_reserva_fixture(); end if;
 return v_r;
end $$;

create function public.consultar_edicao_fixture(p_ator uuid,p_sessao uuid,p_paciente uuid) returns jsonb language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_ator,'session_id',p_sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 return api.consultar_paciente_edicao_privado(public.assinar_anamnese_fixture(
  jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',p_paciente),'api.consultar_paciente_edicao',p_ator,p_sessao));
end $$;

create function public.listar_fixture(p_ator uuid,p_sessao uuid) returns jsonb language plpgsql as $$
declare v_e jsonb:=jsonb_build_object('request_id',gen_random_uuid(),'limite',100);
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_ator,'session_id',p_sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 return api.listar_pacientes(public.assinar_anamnese_fixture(v_e,'api.listar_pacientes',p_ator,p_sessao));
end $$;

-- Contagem das linhas que a criação toca, para provar que um negativo não deixa resíduo.
create function public.resumo_criacao() returns text language sql as $$
 select (select count(*) from cadastro.paciente)||'/'||(select count(*) from cadastro.contato_paciente)||'/'
  ||(select count(*) from cadastro.acompanhamento_caso)||'/'||(select count(*) from operacao.requisicao where operacao='api.criar_paciente')
$$;

-- Positivos: criação completa grava tudo numa gravação, com o primeiro retrato sem motivo.
do $$
declare
 v_admin uuid:='10000000-0000-4000-8000-000000000001'; v_s_admin uuid:='20000000-0000-4000-8000-000000000001';
 v_prof_ativo uuid:='10000000-0000-4000-8000-000000000003'; v_paciente uuid:=gen_random_uuid();
 v_r jsonb; v_antes text; v_sit text;
begin
 v_antes:=public.resumo_criacao();
 v_r:=public.criar_fixture(v_admin,v_s_admin,'cc-1',v_paciente);
 if v_r->>'ok' is distinct from 'true' then raise exception 'CRIACAO_NEGADA: %',v_r; end if;
 if (select count(*) from cadastro.paciente where id=v_paciente)<>1
  or (select count(*) from cadastro.contato_paciente where paciente_id=v_paciente)<>2
  or jsonb_array_length(v_r#>'{dados,contatos}')<>2 then
  raise exception 'LINHAS_INCORRETAS: %',v_r;
 end if;
 if not exists(select 1 from cadastro.acompanhamento_caso a join auditoria.evento ev on ev.id=a.auditoria_id
   where a.paciente_id=v_paciente and a.versao=1 and a.situacao='entrada' and a.responsavel_usuario_id=v_prof_ativo
    and a.ator_usuario_id=v_admin and ev.acao='api.criar_paciente' and ev.resultado='permitido' and ev.motivo_cifrado is null) then
  raise exception 'PRIMEIRO_RETRATO_INCORRETO';
 end if;
 if (select count(*) from cadastro.acompanhamento_caso where paciente_id=v_paciente)<>1
  or not exists(select 1 from operacao.requisicao where operacao='api.criar_paciente' and resultado_id=v_paciente and estado='concluida') then
  raise exception 'LEDGER_OU_RETRATO_DUPLICADO';
 end if;
 -- O caso novo é legível pela consulta de edição (primeiro retrato com motivo nulo) e pela lista (situação).
 v_r:=public.consultar_edicao_fixture(v_admin,v_s_admin,v_paciente);
 if v_r->>'ok' is distinct from 'true' or jsonb_array_length(v_r#>'{dados,acompanhamento}')<>1
  or v_r#>>'{dados,acompanhamento,0,situacao}' is distinct from 'entrada' or v_r#>'{dados,acompanhamento,0,motivo}' is distinct from 'null'::jsonb then
  raise exception 'LEITURA_DE_EDICAO_INCORRETA: %',v_r;
 end if;
 v_r:=public.listar_fixture(v_admin,v_s_admin);
 if not exists(select 1 from jsonb_array_elements(v_r#>'{dados,itens}') i where i->>'paciente_id'=v_paciente::text and i->>'situacao'='entrada') then
  raise exception 'LISTA_SEM_SITUACAO: %',v_r;
 end if;
 -- As cinco situações valem na criação; o próprio Administrador pode ser o responsável; dez contatos cabem.
 foreach v_sit in array array['entrada','ativo','pausado','encerrado','transferido'] loop
  v_r:=public.criar_fixture(v_admin,v_s_admin,'cc-sit-'||v_sit,gen_random_uuid(),'{}','{}',2,v_sit);
  if v_r->>'ok' is distinct from 'true' then raise exception 'SITUACAO_RECUSADA %: %',v_sit,v_r; end if;
 end loop;
 v_r:=public.criar_fixture(v_admin,v_s_admin,'cc-auto',gen_random_uuid(),'{}','{}',10,'ativo',v_admin);
 if v_r->>'ok' is distinct from 'true' or jsonb_array_length(v_r#>'{dados,contatos}')<>10 then raise exception 'DEZ_CONTATOS_OU_AUTORESPONSAVEL: %',v_r; end if;
end $$;

-- Negativos de entrada: nada é criado, nem paciente parcial.
do $$
declare
 v_admin uuid:='10000000-0000-4000-8000-000000000001'; v_s_admin uuid:='20000000-0000-4000-8000-000000000001';
 v_antes text; v_r jsonb; v_campo text; v_p uuid; v_c uuid:=gen_random_uuid();
 v_env jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
 v_casos jsonb;
 v_caso jsonb; v_n integer:=0;
begin
 v_antes:=public.resumo_criacao();
 -- Cada campo exigido ausente.
 foreach v_campo in array array['nome','nome_preferencia','data_nascimento','contatos','situacao','responsavel_id'] loop
  v_r:=public.criar_fixture(v_admin,v_s_admin,'cc-sem-'||v_campo,gen_random_uuid(),'{}',array[v_campo]);
  if v_r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'CAMPO_AUSENTE_ACEITO %: %',v_campo,v_r; end if;
 end loop;
 -- Formato antigo: só o nome.
 v_r:=public.criar_fixture(v_admin,v_s_admin,'cc-antigo',gen_random_uuid(),'{}',array['nome_preferencia','data_nascimento','contatos','situacao','responsavel_id']);
 if v_r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'FORMATO_ANTIGO_ACEITO: %',v_r; end if;
 -- Contatos e demais valores malformados.
 v_p:=gen_random_uuid();
 v_casos:=jsonb_build_array(
  jsonb_build_object('contatos','[]'::jsonb),
  jsonb_build_object('contatos','"texto"'::jsonb),
  jsonb_build_object('contatos',jsonb_build_array(jsonb_build_object('contato_id',v_c,'tipo','sms','valor',v_env,'aad',jsonb_build_object('tabela','cadastro.contato_paciente','registro_id',v_c::text,'campo','valor','formato',1)))),
  jsonb_build_object('contatos',jsonb_build_array(jsonb_build_object('contato_id',v_c,'tipo','email','valor',v_env,'aad',jsonb_build_object('tabela','cadastro.contato_paciente','registro_id',gen_random_uuid()::text,'campo','valor','formato',1)))),
  jsonb_build_object('contatos',jsonb_build_array(jsonb_build_object('contato_id',v_c,'tipo','email','valor',jsonb_build_object('formato',1,'key_id','teste','nonce','curto','ciphertext','YQ','tag',repeat('a',22)),'aad',jsonb_build_object('tabela','cadastro.contato_paciente','registro_id',v_c::text,'campo','valor','formato',1)))),
  jsonb_build_object('contatos',jsonb_build_array(jsonb_build_object('contato_id',v_c,'tipo','email','valor',v_env,'extra',1,'aad',jsonb_build_object('tabela','cadastro.contato_paciente','registro_id',v_c::text,'campo','valor','formato',1)))),
  jsonb_build_object('contatos',jsonb_build_array(
   jsonb_build_object('contato_id',v_c,'tipo','email','valor',v_env,'aad',jsonb_build_object('tabela','cadastro.contato_paciente','registro_id',v_c::text,'campo','valor','formato',1)),
   jsonb_build_object('contato_id',v_c,'tipo','telefone','valor',v_env,'aad',jsonb_build_object('tabela','cadastro.contato_paciente','registro_id',v_c::text,'campo','valor','formato',1)))),
  jsonb_build_object('situacao','qualquer'),
  jsonb_build_object('responsavel_id','nao-e-uuid'),
  jsonb_build_object('aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',gen_random_uuid()::text,'campo','nome','formato',1),
   'nome_preferencia',jsonb_build_object('tabela','cadastro.paciente','registro_id',v_p::text,'campo','nome_preferencia','formato',1),
   'data_nascimento',jsonb_build_object('tabela','cadastro.paciente','registro_id',v_p::text,'campo','data_nascimento','formato',1))));
 for v_caso in select value from jsonb_array_elements(v_casos) loop
  v_n:=v_n+1;
  v_r:=public.criar_fixture(v_admin,v_s_admin,'cc-mal-'||v_n,v_p,v_caso);
  if v_r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'ENTRADA_MALFORMADA_ACEITA %: %',v_n,v_r; end if;
 end loop;
 -- Onze contatos passam do limite do banco.
 v_r:=public.criar_fixture(v_admin,v_s_admin,'cc-onze',gen_random_uuid(),'{}','{}',11);
 if v_r->>'excecao' is distinct from 'ENTRADA_INVALIDA' then raise exception 'ONZE_CONTATOS_ACEITOS: %',v_r; end if;
 if public.resumo_criacao() is distinct from v_antes then raise exception 'NEGATIVAS_DE_ENTRADA_DEIXARAM_RESIDUO'; end if;
end $$;

-- Responsável não elegível, perfis sem permissão e sessão encerrada: nada é criado e a negativa é auditada.
do $$
declare
 v_admin uuid:='10000000-0000-4000-8000-000000000001'; v_s_admin uuid:='20000000-0000-4000-8000-000000000001';
 v_prof uuid:='10000000-0000-4000-8000-000000000002'; v_s_prof uuid:='20000000-0000-4000-8000-000000000002';
 v_prof_inativo uuid:='10000000-0000-4000-8000-000000000004'; v_familia uuid:='10000000-0000-4000-8000-000000000005';
 v_antes text; v_r jsonb; v_alvo uuid; v_p uuid;
begin
 v_antes:=public.resumo_criacao();
 foreach v_alvo in array array[gen_random_uuid(),v_familia,v_prof_inativo] loop
  v_p:=gen_random_uuid();
  v_r:=public.criar_fixture(v_admin,v_s_admin,'cc-resp-'||v_alvo,v_p,'{}','{}',2,'ativo',v_alvo);
  if v_r#>>'{erro,codigo}' is distinct from 'responsavel_invalido' then raise exception 'RESPONSAVEL_INVALIDO_ACEITO %: %',v_alvo,v_r; end if;
  if not exists(select 1 from auditoria.evento where acao='api.criar_paciente' and objeto_id=v_p and resultado='negado') then
   raise exception 'RESPONSAVEL_INVALIDO_SEM_AUDITORIA';
  end if;
 end loop;
 if public.resumo_criacao() is distinct from v_antes then raise exception 'RESPONSAVEL_INVALIDO_DEIXOU_RESIDUO'; end if;
 -- Profissional e Família não criam caso; sessão encerrada não cria.
 v_r:=public.criar_fixture(v_prof,v_s_prof,'cc-prof');
 if v_r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROFISSIONAL_CRIOU: %',v_r; end if;
 update public.usuario set perfil='familia' where id=v_prof;
 v_r:=public.criar_fixture(v_prof,v_s_prof,'cc-familia');
 update public.usuario set perfil='profissional' where id=v_prof;
 if v_r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA_CRIOU: %',v_r; end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=v_s_admin;
 v_r:=public.criar_fixture(v_admin,v_s_admin,'cc-encerrada');
 update identidade.sessao set encerrada_em=null where session_id=v_s_admin;
 if v_r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ENCERRADA_CRIOU: %',v_r; end if;
 if public.resumo_criacao() is distinct from v_antes then raise exception 'NEGATIVAS_DEIXARAM_RESIDUO'; end if;
end $$;

-- Atomicidade: falha em qualquer etapa não deixa paciente, contato, retrato nem ledger.
create function auditoria.falhar_fixture() returns trigger language plpgsql as $$ begin raise exception 'ETAPA_FIXTURE'; end $$;
do $$
declare
 v_admin uuid:='10000000-0000-4000-8000-000000000001'; v_s_admin uuid:='20000000-0000-4000-8000-000000000001';
 v_antes text; v_r jsonb; v_alvo text;
begin
 v_antes:=public.resumo_criacao();
 foreach v_alvo in array array['cadastro.paciente','cadastro.contato_paciente','operacao.requisicao','cadastro.acompanhamento_caso','auditoria.evento'] loop
  execute format('create trigger falha before insert on %s for each row execute function auditoria.falhar_fixture()',v_alvo);
  v_r:=public.criar_fixture(v_admin,v_s_admin,'cc-falha-'||v_alvo,gen_random_uuid(),'{}','{}',2,'entrada','10000000-0000-4000-8000-000000000003',false);
  execute format('drop trigger falha on %s',v_alvo);
  perform public.fechar_reserva_fixture();
  if v_r->>'excecao' is distinct from 'ETAPA_FIXTURE' then raise exception 'FALHA_IGNORADA %: %',v_alvo,v_r; end if;
  if public.resumo_criacao() is distinct from v_antes then raise exception 'FALHA_PARCIAL_DEIXOU_RESIDUO %',v_alvo; end if;
 end loop;
end $$;

-- Repetição: mesma chave e mesmo conteúdo devolve o original sem duplicar; conteúdo diferente é recusado.
do $$
declare
 v_admin uuid:='10000000-0000-4000-8000-000000000001'; v_s_admin uuid:='20000000-0000-4000-8000-000000000001';
 v_prof_ativo uuid:='10000000-0000-4000-8000-000000000003';
 v_paciente uuid:=gen_random_uuid(); v_reserva uuid:=gen_random_uuid(); v_geracao bigint; v_c uuid:=gen_random_uuid();
 v_env jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
 v_e jsonb; v_r1 jsonb; v_r2 jsonb; v_r3 jsonb; v_antes text;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'session_id',v_s_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select epoca into v_geracao from operacao.barreira_cadastro where ator_usuario_id=v_admin;
 v_geracao:=coalesce(v_geracao,1);
 if operacao.reservar_cadastro_privado(v_admin,v_geracao,v_reserva)<>'aberta' then raise exception 'RESERVA_REPETICAO'; end if;
 v_e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',v_paciente,'reserva_id',v_reserva,'geracao_reserva',v_geracao,
  'auditoria_id',gen_random_uuid(),'chave_idempotencia','cc-repete','digest_idempotencia',repeat('a',43),
  'nome',v_env,'nome_preferencia',v_env,'data_nascimento',v_env,
  'contatos',jsonb_build_array(jsonb_build_object('contato_id',v_c,'tipo','email','valor',v_env,'aad',jsonb_build_object('tabela','cadastro.contato_paciente','registro_id',v_c::text,'campo','valor','formato',1))),
  'situacao','ativo','responsavel_id',v_prof_ativo,
  'aad',jsonb_build_object(
   'nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',v_paciente::text,'campo','nome','formato',1),
   'nome_preferencia',jsonb_build_object('tabela','cadastro.paciente','registro_id',v_paciente::text,'campo','nome_preferencia','formato',1),
   'data_nascimento',jsonb_build_object('tabela','cadastro.paciente','registro_id',v_paciente::text,'campo','data_nascimento','formato',1)));
 v_r1:=api.criar_paciente(public.assinar_anamnese_fixture(v_e,'api.criar_paciente',v_admin,v_s_admin));
 v_antes:=public.resumo_criacao();
 v_e:=jsonb_set(jsonb_set(v_e,'{request_id}',to_jsonb(gen_random_uuid()::text)),'{auditoria_id}',to_jsonb(gen_random_uuid()::text));
 v_r2:=api.criar_paciente(public.assinar_anamnese_fixture(v_e,'api.criar_paciente',v_admin,v_s_admin));
 if v_r1->>'ok' is distinct from 'true' or v_r2->>'ok' is distinct from 'true' or public.resumo_criacao() is distinct from v_antes
  or v_r2#>>'{dados,paciente_id}' is distinct from v_paciente::text then
  raise exception 'REPETICAO_DUPLICOU: % %',v_r1,v_r2;
 end if;
 -- Mesma chave com conteúdo diferente (digest diferente): recusada e auditada, sem alterar o caso.
 v_e:=jsonb_set(jsonb_set(jsonb_set(v_e,'{request_id}',to_jsonb(gen_random_uuid()::text)),'{auditoria_id}',to_jsonb(gen_random_uuid()::text)),'{digest_idempotencia}',to_jsonb(repeat('b',43)));
 v_r3:=api.criar_paciente(public.assinar_anamnese_fixture(v_e,'api.criar_paciente',v_admin,v_s_admin));
 if v_r3#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' or public.resumo_criacao() is distinct from v_antes
  or not exists(select 1 from auditoria.evento ev where ev.request_id=(v_e->>'request_id')::uuid and ev.resultado='negado') then
  raise exception 'CONFLITO_DE_CONTEUDO_ACEITO: %',v_r3;
 end if;
end $$;

-- Privilégios do papel dono da criação: só insere contato e primeiro retrato; vê só o responsável elegível; nunca altera.
do $$
declare
 v_admin uuid:='10000000-0000-4000-8000-000000000001'; v_prof_ativo uuid:='10000000-0000-4000-8000-000000000003';
 v_prof_inativo uuid:='10000000-0000-4000-8000-000000000004'; v_familia uuid:='10000000-0000-4000-8000-000000000005';
 v_paciente uuid; v_n integer; v_alvo text;
begin
 select id into v_paciente from cadastro.paciente order by criado_em limit 1;
 if has_table_privilege('ffcmapp_api_cadastro_owner','cadastro.contato_paciente','update')
  or has_table_privilege('ffcmapp_api_cadastro_owner','cadastro.contato_paciente','delete')
  or has_table_privilege('ffcmapp_api_cadastro_owner','cadastro.acompanhamento_caso','update')
  or has_table_privilege('ffcmapp_api_cadastro_owner','cadastro.acompanhamento_caso','delete')
  or has_table_privilege('ffcmapp_api_cadastro_owner','cadastro.acompanhamento_caso','truncate')
  or has_table_privilege('authenticated','cadastro.contato_paciente','insert')
  or has_table_privilege('authenticated','cadastro.acompanhamento_caso','insert')
  or has_function_privilege('anon','operacao.envelope_cifrado_valido(jsonb)','execute')
  or has_function_privilege('authenticated','operacao.envelope_cifrado_valido(jsonb)','execute') then
  raise exception 'PRIVILEGIO_INDEVIDO_DO_DONO_DA_CRIACAO';
 end if;
 execute 'set local role ffcmapp_api_cadastro_owner';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'amr','[]'::jsonb)::text,true);
 select count(*) into v_n from public.usuario where id in (v_prof_inativo,v_familia);
 if v_n<>0 then raise exception 'DONO_VE_USUARIO_INELEGIVEL: %',v_n; end if;
 select count(*) into v_n from public.usuario where id in (v_admin,v_prof_ativo);
 if v_n<>2 then raise exception 'DONO_NAO_VE_USUARIO_ELEGIVEL: %',v_n; end if;
 foreach v_alvo in array array[
  'update public.usuario set ativo=false where id=''10000000-0000-4000-8000-000000000001''',
  'insert into cadastro.acompanhamento_caso(id,paciente_id,versao,situacao,auditoria_id,ator_usuario_id) values (gen_random_uuid(),'''||v_paciente||''',9,''ativo'',gen_random_uuid(),'''||v_admin||''')',
  'insert into cadastro.acompanhamento_caso(id,paciente_id,versao,situacao,auditoria_id,ator_usuario_id) values (gen_random_uuid(),'''||v_paciente||''',1,''ativo'',gen_random_uuid(),'''||v_prof_ativo||''')'] loop
  begin
   execute v_alvo;
   raise exception 'DONO_EXECUTOU: %',v_alvo;
  exception when insufficient_privilege then null;
  end;
 end loop;
 -- Contato de paciente criado por outra pessoa é recusado pela política, mesmo com envelope válido.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_prof_ativo,'amr','[]'::jsonb)::text,true);
 begin
  insert into cadastro.contato_paciente(id,paciente_id,tipo,valor_cifrado)
   values (gen_random_uuid(),v_paciente,'email','{"formato":1,"key_id":"k","nonce":"n","ciphertext":"c","tag":"t"}');
  raise exception 'DONO_INSERIU_CONTATO_DE_OUTRO';
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
 if not (select ativo from public.usuario where id=v_admin) then raise exception 'USUARIO_ALTERADO_PELO_DONO'; end if;
end $$;
