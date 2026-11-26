-- PostgreSQL descartável; Auth e Vault são fixtures fictícias, sem serviço remoto.
--
-- Duas decisões do solicitante de 12/11/2026:
--  1. FR-039 passa a gravar `paciente_id` no evento e a filtrar a consulta por caso
--     (migrations 20261120200000 e 20261120210000).
--  2. FR-041 precisa alcançar a família.
--
-- Sobre (2), este teste existe para CONFERIR a premissa, não para assumi-la. A nota de
-- integração em `governanca_auditoria_lgpd_regras_local.sql` dizia que a família não lia as
-- regras; a leitura do código mostra que `operacao.consultar_regras_atendimento_privado` nunca
-- consulta `identidade.concessao_equipe` — exige apenas usuário ativo e sessão viva. A causa
-- real era a fixture herdada, que não tinha sessão familiar. Aqui a sessão familiar existe e o
-- resultado é afirmado nos dois sentidos.
\set ON_ERROR_STOP on
\ir configuracao_sistema_local.sql
-- `ator_auth_id` na trilha: identidade Auth não admitida também é ator, e a consulta a devolve.
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
-- Só os ALTERs de sessão desta migration interessam aqui: `metodo = 'familia'` com
-- `concessao_id` nulo. A admissão em si tem teste próprio (jornada_familiar_local.sql).
\ir ../migrations/20261111160000_admissao_familiar_privada.sql
\ir ../migrations/20261119300000_consulta_auditoria_privada.sql
\ir ../migrations/20261119320000_regras_atendimento_publicas.sql
\ir ../migrations/20261120200000_auditoria_paciente_id.sql
\ir ../migrations/20261120210000_consulta_auditoria_por_caso.sql

-- Terceiro paciente, exclusivo deste teste, para provar isolamento entre casos.
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('40000000-0000-4000-8000-000000000009','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001');

-- Familiar: usuário 4 recebe perfil família e uma sessão familiar de verdade (sem concessão de
-- equipe, que é justamente o que a nota antiga apontava como impedimento).
update public.usuario set perfil = 'familia', ativo = true
  where id = '10000000-0000-4000-8000-000000000004';
insert into identidade.sessao(session_id, usuario_id, concessao_id, concessao_versao_admissao, metodo)
  values ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',null,null,'familia')
  on conflict (session_id) do update set metodo = 'familia', concessao_id = null,
    concessao_versao_admissao = null, revogada_em = null, encerrada_em = null;

do $$
declare
 administrador uuid := '10000000-0000-4000-8000-000000000001';
 sessao_admin uuid := '20000000-0000-4000-8000-000000000001';
 profissional uuid := '10000000-0000-4000-8000-000000000002';
 sessao_prof uuid := '20000000-0000-4000-8000-000000000002';
 familia uuid := '10000000-0000-4000-8000-000000000004';
 sessao_familia uuid := '20000000-0000-4000-8000-000000000004';
 paciente_a uuid := '40000000-0000-4000-8000-000000000001';
 paciente_b uuid := '40000000-0000-4000-8000-000000000009';
 acesso_a uuid := '50000000-0000-4000-8000-000000000031';
 e jsonb; r jsonb; marcado uuid; total integer; req_a uuid; req_b uuid;
begin
 -- ===========================================================================
 -- 1. O gatilho preenche o caso, e só onde há caso.
 -- ===========================================================================
 -- 1.1 `tipo_objeto = 'paciente'`: cópia pura, sem leitura nenhuma.
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),administrador,'fixture.conteudo','paciente',paciente_a,'permitido',gen_random_uuid())
  returning paciente_id into marcado;
 if marcado is distinct from paciente_a then
  raise exception 'GATILHO_NAO_MARCOU_PACIENTE: %',marcado;
 end if;

 -- 1.2 Caminho `negado` também é rotulado — é o que um investigador mais procura.
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),profissional,'fixture.sondagem','paciente',paciente_b,'negado',gen_random_uuid())
  returning paciente_id into marcado;
 if marcado is distinct from paciente_b then
  raise exception 'GATILHO_NAO_MARCOU_NEGADO: %',marcado;
 end if;

 -- 1.3 `acesso_paciente` resolve pela linha do vínculo (FR-039 nomeia "mudanças de acesso").
 insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
  values(acesso_a,paciente_a,profissional,administrador,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),administrador,'fixture.conceder','acesso_paciente',acesso_a,'permitido',gen_random_uuid())
  returning paciente_id into marcado;
 if marcado is distinct from paciente_a then
  raise exception 'GATILHO_NAO_RESOLVEU_ACESSO: %',marcado;
 end if;

 -- 1.4 Evento institucional continua sem caso. Nada é inventado.
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),administrador,'fixture.config','configuracao_sistema',null,'permitido',gen_random_uuid())
  returning paciente_id into marcado;
 if marcado is not null then
  raise exception 'GATILHO_INVENTOU_CASO_INSTITUCIONAL: %',marcado;
 end if;

 -- 1.5 Identificador que não corresponde a vínculo nenhum fica nulo, sem derrubar o insert.
 --     É o caso da sondagem com uuid inventado; é por isso que a coluna não tem chave
 --     estrangeira. Se tivesse, este insert falharia e levaria a operação junto.
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),profissional,'fixture.sondagem','acesso_paciente',gen_random_uuid(),'negado',gen_random_uuid())
  returning paciente_id into marcado;
 if marcado is not null then
  raise exception 'GATILHO_INVENTOU_CASO_INEXISTENTE: %',marcado;
 end if;

 -- 1.6 Valor informado explicitamente não é sobrescrito.
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,paciente_id,resultado,request_id)
  values(gen_random_uuid(),administrador,'fixture.explicito','paciente',paciente_a,paciente_b,'permitido',gen_random_uuid())
  returning paciente_id into marcado;
 if marcado is distinct from paciente_b then
  raise exception 'GATILHO_SOBRESCREVEU_EXPLICITO: %',marcado;
 end if;

 -- ===========================================================================
 -- 2. Operação real: o rótulo nasce sem que o dono da operação tenha privilégio na coluna.
 -- ===========================================================================
 -- É o ponto central do desenho. `ffcmapp_anamnese_owner` insere na trilha nomeando só as
 -- colunas antigas; o gatilho preenche `paciente_id`. Se o privilégio de coluna fosse exigido
 -- de quem não nomeia a coluna, esta chamada falharia.
 if has_column_privilege('ffcmapp_anamnese_owner','auditoria.evento','paciente_id','insert') then
  raise exception 'DONO_DE_OPERACAO_GANHOU_COLUNA_DE_CASO';
 end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 -- Duas leituras reais, em dois casos distintos. O que se afirma aqui é o ROTULAMENTO pela
 -- operação real; o rótulo no caminho `negado` já foi afirmado em 1.2, com a mesma forma de
 -- evento que estas funções gravam (`tipo_objeto = 'paciente'`, `objeto_id` = o caso).
 req_b := gen_random_uuid();
 e:=jsonb_build_object('request_id',req_b,'paciente_id',paciente_b);
 r:=api.anamnese_privada(public.assinar_anamnese_fixture(e,'api.ler_anamnese',profissional,sessao_prof));
 if not exists(select 1 from auditoria.evento where request_id=req_b and paciente_id=paciente_b) then
  raise exception 'OPERACAO_REAL_NAO_ROTULADA_B: %',r;
 end if;
 req_a := gen_random_uuid();
 e:=jsonb_build_object('request_id',req_a,'paciente_id',paciente_a);
 r:=api.anamnese_privada(public.assinar_anamnese_fixture(e,'api.ler_anamnese',profissional,sessao_prof));
 if not exists(select 1 from auditoria.evento where request_id=req_a and paciente_id=paciente_a) then
  raise exception 'OPERACAO_REAL_NAO_ROTULADA_A: %',r;
 end if;
 -- Nenhum evento destas duas chamadas ficou sem rótulo.
 if exists(select 1 from auditoria.evento where request_id in (req_a,req_b) and paciente_id is null) then
  raise exception 'OPERACAO_REAL_COM_CASO_NULO';
 end if;
 -- Contraprova da limitação registrada em tasks.md: os eventos que a própria fixture gravou
 -- ANTES desta migration continuam sem caso, embora tenham `tipo_objeto = 'paciente'`. O
 -- gatilho não reescreve o passado, e a trilha é append-only — não há backfill possível.
 if not exists(select 1 from auditoria.evento
   where tipo_objeto='paciente' and objeto_id is not null and paciente_id is null) then
  raise exception 'FIXTURE_SEM_EVENTO_ANTERIOR_A_MIGRATION';
 end if;

 -- ===========================================================================
 -- 3. FR-039: filtro por caso isola, e a trilha continua imutável.
 -- ===========================================================================
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'limite',100,'paciente_id',paciente_a);
 r:=api.consultar_auditoria(public.assinar_anamnese_fixture(e,'api.consultar_auditoria',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' then
  raise exception 'FILTRO_CASO_NEGADO: %',r;
 end if;
 if jsonb_array_length(r#>'{dados,itens}') = 0 then
  raise exception 'FILTRO_CASO_VAZIO: %',r;
 end if;
 -- Negativo que importa: nenhum evento de outro caso, e nenhum evento sem caso, entram.
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i
   where i->>'paciente_id' is distinct from paciente_a::text) then
  raise exception 'FILTRO_CASO_VAZOU_OUTRO_CASO: %',r;
 end if;
 -- O conteúdo cifrado continua fora da resposta, como em 20261119300000.
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i
   where i ?| array['motivo_cifrado','request_id']) then
  raise exception 'FILTRO_CASO_VAZOU_CONTEUDO: %',r;
 end if;
 -- A consulta por caso fica ela própria rotulada com o caso consultado.
 if not exists(select 1 from auditoria.evento where acao='api.consultar_auditoria'
   and ator_usuario_id=administrador and paciente_id=paciente_a and resultado='permitido') then
  raise exception 'CONSULTA_POR_CASO_NAO_ROTULADA';
 end if;

 -- Negativo: profissional não administrador continua recusado, agora também no filtro por caso.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'limite',25,'paciente_id',paciente_a);
 r:=api.consultar_auditoria(public.assinar_anamnese_fixture(e,'api.consultar_auditoria',profissional,sessao_prof));
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'FILTRO_CASO_PERMITIDO_A_NAO_ADMIN: %',r;
 end if;

 -- Negativo: familiar não alcança a auditoria, nem com sessão familiar válida.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'limite',25,'paciente_id',paciente_a);
 if api.consultar_auditoria(public.assinar_anamnese_fixture(e,'api.consultar_auditoria',familia,sessao_familia))#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'AUDITORIA_FAMILIA_PERMITIDA';
 end if;

 -- Imutabilidade: o gatilho append-only não foi afetado por ganhar um gatilho BEFORE INSERT.
 begin
  update auditoria.evento set paciente_id = paciente_b where paciente_id = paciente_a;
  raise exception 'TRILHA_ACEITOU_UPDATE';
 exception when sqlstate '55000' then null;
 end;
 begin
  delete from auditoria.evento where paciente_id = paciente_a;
  raise exception 'TRILHA_ACEITOU_DELETE';
 exception when sqlstate '55000' then null;
 end;

 -- Eventos anteriores à migration ficam sem caso, por construção. Afirmado para que a limitação
 -- registrada em tasks.md seja verdadeira e não apenas declarada.
 select count(*) into total from auditoria.evento where paciente_id is null;
 if total = 0 then
  raise exception 'FIXTURE_SEM_EVENTO_INSTITUCIONAL';
 end if;

 -- ===========================================================================
 -- 4. FR-041: a família lê as regras.
 -- ===========================================================================
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid());
 r:=api.consultar_regras_atendimento(public.assinar_anamnese_fixture(e,'api.consultar_regras_atendimento',familia,sessao_familia));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'dados') <> 4 then
  raise exception 'REGRAS_FAMILIA_NEGADAS: %',r;
 end if;
 -- E não leva nada além das regras: nenhuma chave de 'servidor' ou 'administracao'.
 if exists(select 1 from jsonb_array_elements(r->'dados') i where i->>'chave' not like 'ffcm.regras.%') then
  raise exception 'REGRAS_FAMILIA_VAZARAM_CONFIGURACAO: %',r;
 end if;
 -- A leitura da família é auditada como qualquer outra.
 if not exists(select 1 from auditoria.evento where acao='api.consultar_regras_atendimento'
   and ator_usuario_id=familia and resultado='permitido') then
  raise exception 'REGRAS_FAMILIA_SEM_AUDITORIA';
 end if;

 -- Negativo: sessão familiar encerrada não lê mais, na hora.
 update identidade.sessao set encerrada_em = clock_timestamp() where session_id = sessao_familia;
 e:=jsonb_build_object('request_id',gen_random_uuid());
 if api.consultar_regras_atendimento(public.assinar_anamnese_fixture(e,'api.consultar_regras_atendimento',familia,sessao_familia))#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'REGRAS_SESSAO_ENCERRADA_PERMITIDA';
 end if;
 update identidade.sessao set encerrada_em = null where session_id = sessao_familia;

 -- Negativo: sessão familiar revogada idem. A revogação exige autor e motivo cifrado, pelo
 -- `sessao_revogacao_chk` da fundação — revogar é ato registrado, não um campo de data solto.
 update identidade.sessao set revogada_em = clock_timestamp(),
   revogada_por_usuario_id = administrador,
   motivo_revogacao_cifrado = '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'
  where session_id = sessao_familia;
 e:=jsonb_build_object('request_id',gen_random_uuid());
 if api.consultar_regras_atendimento(public.assinar_anamnese_fixture(e,'api.consultar_regras_atendimento',familia,sessao_familia))#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'REGRAS_SESSAO_REVOGADA_PERMITIDA';
 end if;
 update identidade.sessao set revogada_em = null, revogada_por_usuario_id = null,
   motivo_revogacao_cifrado = null where session_id = sessao_familia;

 -- Negativo: usuário inativo não lê, mesmo com sessão viva.
 update public.usuario set ativo = false where id = familia;
 e:=jsonb_build_object('request_id',gen_random_uuid());
 if api.consultar_regras_atendimento(public.assinar_anamnese_fixture(e,'api.consultar_regras_atendimento',familia,sessao_familia))#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'REGRAS_USUARIO_INATIVO_PERMITIDO';
 end if;
 update public.usuario set ativo = true where id = familia;

 -- O dono do resolvedor não entra, não ignora RLS e não tem membro residual.
 if exists (select 1 from pg_roles r2 where r2.rolname = 'ffcmapp_marcar_caso_owner'
   and (r2.rolcanlogin or r2.rolsuper or r2.rolbypassrls or r2.rolcreaterole or r2.rolcreatedb)) then
  raise exception 'MARCAR_CASO_OWNER_COM_PRIVILEGIO_EXCESSIVO';
 end if;
 if exists (select 1 from pg_auth_members m join pg_roles r2 on r2.oid = m.roleid
   where r2.rolname = 'ffcmapp_marcar_caso_owner') then
  raise exception 'MARCAR_CASO_OWNER_COM_MEMBRO_RESIDUAL';
 end if;
 -- Ele lê duas colunas de uma tabela, e nenhuma delas é conteúdo.
 if has_column_privilege('ffcmapp_marcar_caso_owner','cadastro.acesso_paciente','motivo_concessao_cifrado','select')
   or has_column_privilege('ffcmapp_marcar_caso_owner','cadastro.acesso_paciente','motivo_revogacao_cifrado','select')
   or has_table_privilege('ffcmapp_marcar_caso_owner','cadastro.paciente','select') then
  raise exception 'MARCAR_CASO_OWNER_ALCANCOU_CONTEUDO';
 end if;
 -- O dono da CONSULTA continua sem alcançar o domínio clínico: ganhou só `paciente_id`.
 -- (`motivo_cifrado` vem de 20261109100000, fora desta cadeia de fixture; o negativo dele já é
 -- afirmado em governanca_auditoria_lgpd_regras_local.sql, que carrega aquela migration.)
 if has_table_privilege('ffcmapp_consulta_auditoria_owner','cadastro.paciente','select')
   or has_table_privilege('ffcmapp_consulta_auditoria_owner','cadastro.acesso_paciente','select') then
  raise exception 'CONSULTA_AUDITORIA_GANHOU_DOMINIO';
 end if;

 raise notice 'AUDITORIA_CASO_E_REGRAS_FAMILIA_OK';
end $$;
