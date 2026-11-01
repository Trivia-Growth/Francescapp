-- Somente cluster local descartável, roles e JWT são fixtures.
\set ON_ERROR_STOP on
\set ffcm_concorrente true
\ir fundacao_cadastro_transacao_experimento.sql
set role ffcm_teste_owner;
\ir ../drafts/20261101140000_reconciliacao_cadastro_experimento.sql
grant execute on function experimento_atestado.listar_reconciliacao(jsonb) to ffcm_teste_runtime;
reset role;
create function public.fixture_consulta(p jsonb) returns jsonb language sql as $$
  select experimento_atestado.listar_reconciliacao(jsonb_build_object('consulta',p,'request_id','60000000-0000-4000-8000-000000000001'))
$$;
insert into public.usuario values ('10000000-0000-4000-8000-000000000099',true,'administrador');
insert into identidade.concessao_equipe values ('10000000-0000-4000-8000-000000000098','10000000-0000-4000-8000-000000000099','vinculada');
insert into identidade.sessao values ('10000000-0000-4000-8000-000000000097','10000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000098',null);
set role ffcm_teste_runtime;
select set_config('ffcm_teste.usuario','10000000-0000-4000-8000-000000000001',false);
select set_config('ffcm_teste.sessao','10000000-0000-4000-8000-000000000002',false);
select set_config('ffcm_teste.ativa','sim',false);
do $$
declare pagina jsonb; cursor_alheio text;
begin
 pagina := public.fixture_consulta('{"limite":10}');
 if pagina ->> 'request_id' is distinct from '60000000-0000-4000-8000-000000000001' then raise exception 'request não correlacionado'; end if;
 pagina := experimento_atestado.listar_reconciliacao('{"consulta":{"limite":10},"request_id":"60000000-0000-4000-8000-000000000002"}');
 if pagina ->> 'request_id' is distinct from '60000000-0000-4000-8000-000000000002' then raise exception 'segundo request não correlacionado'; end if;
 pagina := experimento_atestado.listar_reconciliacao('{"consulta":{"limite":10},"request_id":"01890f47-7c63-7cc7-98c4-dc0c0c07398f"}');
 if pagina ->> 'request_id' is distinct from '01890f47-7c63-7cc7-98c4-dc0c0c07398f' then raise exception 'UUIDv7 recusado'; end if;
 pagina := experimento_atestado.listar_reconciliacao('{"consulta":{"limite":10},"request_id":"00000000-0000-0000-0000-000000000000"}');
 if pagina ->> 'request_id' is distinct from '00000000-0000-0000-0000-000000000000' then raise exception 'UUID nil recusado'; end if;
 pagina := experimento_atestado.listar_reconciliacao('{"consulta":{"limite":10},"request_id":"ffffffff-ffff-ffff-ffff-ffffffffffff"}');
 if pagina ->> 'request_id' is distinct from 'ffffffff-ffff-ffff-ffff-ffffffffffff' then raise exception 'UUID max recusado'; end if;
 begin
   perform experimento_atestado.listar_reconciliacao('{"consulta":{"limite":10},"request_id":null}');
   raise exception 'request nulo aceito';
 exception when invalid_parameter_value then null; end;
 begin
   perform experimento_atestado.listar_reconciliacao('{"consulta":{"limite":10},"request_id":"inválido"}');
   raise exception 'request inválido aceito';
 exception when invalid_parameter_value then
   if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 if jsonb_array_length(pagina -> 'dados' -> 'itens') is distinct from 1
    or pagina #>> '{dados,itens,0,situacao,estado}' is distinct from 'confirmado'
    or pagina #>> '{dados,itens,0,situacao,resultado_id}' is distinct from '20000000-0000-4000-8000-000000000001' then
   raise exception 'reconciliação própria incorreta';
 end if;
 cursor_alheio := pagina #>> '{dados,itens,0,operacao_id}';
 begin
   perform public.fixture_consulta('{"limite":10,"usuario_id":"10000000-0000-4000-8000-000000000099"}');
   raise exception 'filtro de usuário aceito';
 exception when invalid_parameter_value then null; end;
 perform set_config('ffcm_teste.usuario','10000000-0000-4000-8000-000000000099',true);
 perform set_config('ffcm_teste.sessao','10000000-0000-4000-8000-000000000097',true);
 pagina := public.fixture_consulta('{"limite":10}');
 if jsonb_array_length(pagina -> 'dados' -> 'itens') is distinct from 0 then raise exception 'outro ator viu operação alheia'; end if;
 begin
   perform public.fixture_consulta(jsonb_build_object('limite',10,'cursor',cursor_alheio));
   raise exception 'cursor de outro ator aceito';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.fixture_consulta('{"limite":10,"cursor":"inválido"}');
   raise exception 'cursor malformado aceito';
 exception when invalid_parameter_value then
   if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 perform set_config('ffcm_teste.usuario','10000000-0000-4000-8000-000000000001',true);
 perform set_config('ffcm_teste.sessao','10000000-0000-4000-8000-000000000002',true);
 perform set_config('ffcm_teste.falha_auditoria','sim',true);
 begin
   perform public.fixture_consulta('{"limite":10}');
   raise exception 'leitura sem auditoria aceita';
 exception when check_violation then null; end;
 perform set_config('ffcm_teste.falha_auditoria','não',true);
 perform set_config('ffcm_teste.ativa','não',true);
 pagina := public.fixture_consulta('{"limite":10}');
 if pagina ->> 'ok' is distinct from 'false' or pagina #>> '{erro,codigo}' is distinct from 'sem_permissao' then
   raise exception 'sessão revogada aceita';
 end if;
 perform set_config('ffcm_teste.falha_auditoria','sim',true);
 begin
   perform public.fixture_consulta('{"limite":10}');
   raise exception 'negação retornou sem auditoria';
 exception when check_violation then null; end;
end $$;
reset role;
do $$ begin
 if not exists (select 1 from auditoria.evento e where e.acao='api.listar_reconciliacao' and e.resultado='negado') then
   raise exception 'negação sem auditoria persistida';
 end if;
 if not exists (select 1 from auditoria.evento e where e.acao='api.listar_reconciliacao'
   and e.resultado='permitido' and e.request_id='60000000-0000-4000-8000-000000000001')
   or not exists (select 1 from auditoria.evento e where e.acao='api.listar_reconciliacao'
   and e.resultado='negado' and e.request_id='60000000-0000-4000-8000-000000000001') then
   raise exception 'auditoria sem correlação exata';
 end if;
 if not exists (select 1 from auditoria.evento e where e.acao='api.listar_reconciliacao'
   and e.resultado='permitido' and e.request_id='60000000-0000-4000-8000-000000000002') then
   raise exception 'segunda requisição sem auditoria correlacionada';
 end if;
end $$;
insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,criada_em)
values
 ('f0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','api.criar_paciente','pagina1','d','registrada','2025-01-01T00:00:00Z'),
 ('10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','api.criar_paciente','pagina2','d','registrada','2025-01-01T00:00:02Z'),
 ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','api.criar_paciente','pagina3','d','registrada','2025-01-01T00:00:02Z');
set role ffcm_teste_runtime;
select set_config('ffcm_teste.ativa','sim',false);
do $$ declare p jsonb; begin
 p := public.fixture_consulta('{"limite":1}');
 if p #>> '{dados,itens,0,operacao_id}' is distinct from 'f0000000-0000-4000-8000-000000000001' or p #>> '{dados,proximo_cursor}' is distinct from 'f0000000-0000-4000-8000-000000000001' then
   raise exception 'primeira página não usa ordem temporal';
 end if;
 perform set_config('ffcm_teste.cursor',p #>> '{dados,proximo_cursor}',false);
end $$;
reset role;
-- Inserção separada entre chamadas, sem afirmar snapshot completo.
insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,criada_em)
values ('e0000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','api.criar_paciente','pagina_inserida','d','registrada','2025-01-01T00:00:01Z');
set role ffcm_teste_runtime;
do $$ declare p jsonb; begin
 p := public.fixture_consulta(jsonb_build_object('limite',1,'cursor',current_setting('ffcm_teste.cursor')));
 if p #>> '{dados,itens,0,operacao_id}' is distinct from 'e0000000-0000-4000-8000-000000000006' then raise exception 'segunda página incorreta'; end if;
 p := public.fixture_consulta(jsonb_build_object('limite',1,'cursor',p #>> '{dados,proximo_cursor}'));
 if p #>> '{dados,itens,0,operacao_id}' is distinct from '10000000-0000-4000-8000-000000000005' then raise exception 'terceira página incorreta'; end if;
 p := public.fixture_consulta(jsonb_build_object('limite',1,'cursor',p #>> '{dados,proximo_cursor}'));
 if p #>> '{dados,itens,0,operacao_id}' is distinct from '20000000-0000-4000-8000-000000000005' then raise exception 'desempate por ID incorreto'; end if;
end $$;
reset role;
