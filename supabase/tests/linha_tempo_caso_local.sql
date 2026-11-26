\set ON_ERROR_STOP on
-- Prova local da linha do tempo do caso (FR-007). PostgreSQL descartável; Auth, Vault e
-- assinatura são fixtures fictícias e não comprovam serviço real. Toda chamada passa pelo
-- wrapper api.*, que executa como o papel dono, então grants e políticas são exercitados.
\ir linha_tempo_fixture_local.sql
\ir linha_tempo_area_local.sql

-- 1. Profissional com acesso vê todas as fontes, e cada tipo de evento é distinguido.
do $$
#variable_conflict use_variable
declare r jsonb; itens jsonb;
begin
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth');
 if r->>'ok' is distinct from 'true' then raise exception 'PROFISSIONAL_NEGADO: %',r; end if;
 itens:=r#>'{dados,itens}';
 -- 2 fatias versionadas + 5 versões de diário + 2 documentos visíveis (o removido sai).
 if jsonb_array_length(itens) <> 9 then raise exception 'TOTAL_INESPERADO: %',itens; end if;
 if exists(select 1 from jsonb_array_elements(itens) i where i->>'id'='71000000-0000-4000-8000-000000000003') then
  raise exception 'DOCUMENTO_REMOVIDO_VISIVEL';
 end if;
 -- FR-007: acontecimento, registro e retificação distinguidos.
 if (select i->>'tipo_evento' from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000001') is distinct from 'rascunho'
  or (select i->>'tipo_evento' from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000003') is distinct from 'registro'
  or (select i->>'tipo_evento' from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000004') is distinct from 'retificacao' then
  raise exception 'TIPO_EVENTO: %',itens;
 end if;
 -- A versão anterior continua na linha do tempo depois da retificação (FR-012).
 if not exists(select 1 from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000003') then
  raise exception 'VERSAO_ANTERIOR_APAGADA';
 end if;
 -- Acontecimento em claro só onde a fatia o pôs em claro.
 if (select i->>'aconteceu_em' from jsonb_array_elements(itens) i where i->>'id'='71000000-0000-4000-8000-000000000001') is distinct from to_char(current_date-40,'YYYY-MM-DD')
  -- 12/11/2026: a data do acontecimento do diário saiu do envelope e aparece aqui. Quando
  -- a versão não a tem (registro antigo), continua nula e a tela diz isso em vez de
  -- apresentar a data de registro no lugar.
  or (select i->>'aconteceu_em' from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000003') is distinct from to_char(current_date-7,'YYYY-MM-DD')
  or (select i->>'area' from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000003') is distinct from 'escola'
  or (select i->>'aconteceu_em' from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000005') is not null then
  raise exception 'ACONTECIMENTO: %',itens;
 end if;
 -- Indisponibilidade é identificada, não escondida (FR-029/SC-010).
 if (select i#>>'{detalhe,estado}' from jsonb_array_elements(itens) i where i->>'id'='71000000-0000-4000-8000-000000000002') is distinct from 'indisponivel' then
  raise exception 'INDISPONIVEL_NAO_MARCADO: %',itens;
 end if;
 -- Ordem decrescente por registro.
 if (select i->>'id' from jsonb_array_elements(itens) i limit 1) is distinct from '71000000-0000-4000-8000-000000000002' then
  raise exception 'ORDEM: %',itens;
 end if;
 if not exists(select 1 from auditoria.evento where acao='api.ler_linha_tempo' and resultado='permitido') then
  raise exception 'AUDITORIA_AUSENTE';
 end if;
end $$;

-- 2. Rascunho é privado do autor: outro profissional não o vê, nem como metadado.
do $$
#variable_conflict use_variable
declare r jsonb;
begin
 insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
  values (gen_random_uuid(),'40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
 r:=public.ler_linha('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','oauth');
 if r->>'ok' is distinct from 'true' then raise exception 'OUTRO_PROFISSIONAL_NEGADO: %',r; end if;
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'id'='61000000-0000-4000-8000-000000000001') then
  raise exception 'RASCUNHO_ALHEIO_VISIVEL';
 end if;
 if jsonb_array_length(r#>'{dados,itens}') <> 8 then raise exception 'TOTAL_OUTRO: %',r#>'{dados,itens}'; end if;
end $$;

-- 3. Família: só diário 'equipe_e_familia' publicado/retificado, o que ela escreveu, e
-- documento 'equipe_e_familia'. Nenhuma outra fatia aparece NEM COMO METADADO.
do $$
#variable_conflict use_variable
declare r jsonb; itens jsonb;
begin
 r:=public.ler_linha('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','password');
 if r->>'ok' is distinct from 'true' then raise exception 'FAMILIA_NEGADA: %',r; end if;
 itens:=r#>'{dados,itens}';
 if r#>>'{dados,papel}' is distinct from 'familia' then raise exception 'PAPEL: %',r; end if;
 -- 2 versões do registro equipe_e_familia + o próprio relato + 1 documento = 4.
 if jsonb_array_length(itens) <> 4 then raise exception 'FAMILIA_TOTAL: %',itens; end if;
 if exists(select 1 from jsonb_array_elements(itens) i where i->>'fonte' not in ('diario','documento')) then
  raise exception 'FAMILIA_VE_OUTRA_FONTE: %',itens;
 end if;
 if exists(select 1 from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000002') then
  raise exception 'FAMILIA_VE_DIARIO_DE_EQUIPE';
 end if;
 if exists(select 1 from jsonb_array_elements(itens) i where i->>'id'='71000000-0000-4000-8000-000000000001') then
  raise exception 'FAMILIA_VE_DOCUMENTO_DE_EQUIPE';
 end if;
 if exists(select 1 from jsonb_array_elements(itens) i where i->>'id'='61000000-0000-4000-8000-000000000001') then
  raise exception 'FAMILIA_VE_RASCUNHO';
 end if;
end $$;

-- 4. Família de outro caso: negada, com auditoria de negativa e nenhum dado.
do $$
#variable_conflict use_variable
declare r jsonb; req uuid:=gen_random_uuid();
begin
 perform public.claims_linha_fixture('10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','password');
 r:=api.linha_tempo_operacao_privada(public.assinar_linha_fixture(
   jsonb_build_object('request_id',req,'paciente_id','40000000-0000-4000-8000-000000000001'),
   'api.ler_linha_tempo','10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005'));
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then
  raise exception 'OUTRA_FAMILIA_ALCANCOU: %',r;
 end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='negado' and acao='api.ler_linha_tempo') then
  raise exception 'AUDITORIA_NEGATIVA_AUSENTE';
 end if;
end $$;

-- 5. Filtros: período, fonte e autor.
do $$
#variable_conflict use_variable
declare r jsonb; corte text;
begin
 -- O corte sai do próprio dado, não de `now()`: as fontes foram gravadas em transações
 -- anteriores e comparar com um `now()` novo tornaria a asserção instável.
 select to_char(v.criado_em - interval '1 second','YYYY-MM-DD"T"HH24:MI:SS.USOF') into corte
  from cadastro.documento_caso_versao v where v.id='71000000-0000-4000-8000-000000000002';
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
   jsonb_build_object('fontes',jsonb_build_array('documento')));
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'fonte'<>'documento')
  or jsonb_array_length(r#>'{dados,itens}')<>2 then raise exception 'FILTRO_FONTE: %',r#>'{dados,itens}'; end if;
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
   jsonb_build_object('autor_usuario_id','10000000-0000-4000-8000-000000000003'));
 if jsonb_array_length(r#>'{dados,itens}')<>1
  or (r#>>'{dados,itens,0,fonte}') is distinct from 'saude' then raise exception 'FILTRO_AUTOR: %',r#>'{dados,itens}'; end if;
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
   jsonb_build_object('de',corte));
 -- Nada antes do corte, e o que está depois continua lá: o filtro recorta, não esvazia.
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where (i->>'registrado_em')::timestamptz < corte::timestamptz) then
  raise exception 'FILTRO_PERIODO: %',r#>'{dados,itens}';
 end if;
 if not exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'id'='71000000-0000-4000-8000-000000000002') then
  raise exception 'FILTRO_PERIODO_CORTOU_DEMAIS: %',r#>'{dados,itens}';
 end if;
 -- Filtro por área (FR-007), possível desde que a área saiu do envelope.
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
   jsonb_build_object('areas',jsonb_build_array('escola')));
 if jsonb_array_length(r#>'{dados,itens}')<>3
  or exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'area'<>'escola') then
  raise exception 'FILTRO_AREA: %',r#>'{dados,itens}';
 end if;
 -- Área que ninguém usou devolve lista vazia honestamente: o vocabulário é configurado
 -- pela equipe, não uma lista fechada no código, então não é entrada inválida.
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
   jsonb_build_object('areas',jsonb_build_array('inexistente')));
 if jsonb_array_length(r#>'{dados,itens}')<>0 then raise exception 'AREA_VAZIA: %',r; end if;
 -- Área malformada continua sendo entrada inválida.
 begin
  r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
    jsonb_build_object('areas',jsonb_build_array('')));
  raise exception 'AREA_VAZIA_ACEITA';
 exception when invalid_parameter_value then null;
 end;
 -- Fonte inexistente é entrada inválida, não lista vazia silenciosa.
 begin
  r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
    jsonb_build_object('fontes',jsonb_build_array('inventada')));
  raise exception 'FONTE_INVALIDA_ACEITA';
 exception when invalid_parameter_value then null;
 end;
 -- Período invertido é entrada inválida.
 begin
  r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
    jsonb_build_object('de',to_char(now(),'YYYY-MM-DD"T"HH24:MI:SSOF'),'ate',to_char(now()-interval '1 day','YYYY-MM-DD"T"HH24:MI:SSOF')));
  raise exception 'PERIODO_INVERTIDO_ACEITO';
 exception when invalid_parameter_value then null;
 end;
end $$;

-- 6. Paginação: o cursor devolve a página seguinte sem repetir nem pular item.
do $$
#variable_conflict use_variable
declare r jsonb; cursor_em text; cursor_id text; primeiros jsonb; segundos jsonb;
begin
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
   jsonb_build_object('limite',4));
 primeiros:=r#>'{dados,itens}';
 if jsonb_array_length(primeiros)<>4 or r#>>'{dados,proximo_cursor}' is null then
  raise exception 'PAGINA_1: %',r#>'{dados}';
 end if;
 cursor_em:=r#>>'{dados,proximo_cursor,registrado_em}'; cursor_id:=r#>>'{dados,proximo_cursor,id}';
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth',
   jsonb_build_object('limite',4,'cursor_em',cursor_em,'cursor_id',cursor_id));
 segundos:=r#>'{dados,itens}';
 if jsonb_array_length(segundos)<>4 then raise exception 'PAGINA_2: %',segundos; end if;
 if exists(select 1 from jsonb_array_elements(primeiros) a join jsonb_array_elements(segundos) b on a->>'id'=b->>'id') then
  raise exception 'PAGINA_REPETIDA';
 end if;
end $$;

-- 7. Revogação do acesso fecha a linha do tempo na hora.
do $$
#variable_conflict use_variable
declare r jsonb;
begin
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),
   revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',
   motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'
  where usuario_id='10000000-0000-4000-8000-000000000002' and paciente_id='40000000-0000-4000-8000-000000000001';
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth');
 if r->>'ok' is distinct from 'false' or r ? 'dados' then raise exception 'REVOGACAO_IGNORADA: %',r; end if;
 update cadastro.acesso_paciente set revogada_em=null, revogado_por_usuario_id=null, motivo_revogacao_cifrado=null
  where usuario_id='10000000-0000-4000-8000-000000000002' and paciente_id='40000000-0000-4000-8000-000000000001';
end $$;

-- 8. Sessão encerrada, MAC falso e perfil sem vínculo são recusados.
do $$
#variable_conflict use_variable
declare r jsonb; t jsonb;
begin
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id='20000000-0000-4000-8000-000000000002';
 r:=public.ler_linha('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth');
 if r->>'ok' is distinct from 'false' then raise exception 'SESSAO_ENCERRADA_ACEITA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id='20000000-0000-4000-8000-000000000002';
 perform public.claims_linha_fixture('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','oauth');
 t:=public.assinar_linha_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001'),
   'api.ler_linha_tempo','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
 begin
  perform api.linha_tempo_operacao_privada(jsonb_set(t,'{entrada,atestado,mac}',to_jsonb(repeat('z',43))));
  raise exception 'MAC_FALSO_ACEITO';
 exception when insufficient_privilege then null;
 end;
 -- Administrador sem acesso individual alcança o caso (exceção aprovada da carteira completa).
 r:=public.ler_linha('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','oauth');
 if r->>'ok' is distinct from 'true' then raise exception 'ADMINISTRADOR_NEGADO: %',r; end if;
end $$;

-- 9. Quem autentica sem perfil é auditado por `ator_auth_id`, sem criar usuário.
do $$
#variable_conflict use_variable
declare r jsonb; req uuid:=gen_random_uuid(); sem_perfil uuid:='10000000-0000-4000-8000-00000000000f';
begin
 insert into auth.users values (sem_perfil);
 insert into auth.sessions values ('20000000-0000-4000-8000-00000000000f',sem_perfil,null);
 perform public.claims_linha_fixture(sem_perfil,'20000000-0000-4000-8000-00000000000f','oauth');
 r:=api.linha_tempo_operacao_privada(public.assinar_linha_fixture(
   jsonb_build_object('request_id',req,'paciente_id','40000000-0000-4000-8000-000000000001'),
   'api.ler_linha_tempo',sem_perfil,'20000000-0000-4000-8000-00000000000f'));
 if r->>'ok' is distinct from 'false' then raise exception 'SEM_PERFIL_ACEITO: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=sem_perfil and resultado='negado') then
  raise exception 'AUDITORIA_AUTH_AUSENTE';
 end if;
 if exists(select 1 from public.usuario where id=sem_perfil) then raise exception 'USUARIO_CRIADO'; end if;
end $$;

do $$ begin raise notice 'LINHA_TEMPO_OK'; end $$;
