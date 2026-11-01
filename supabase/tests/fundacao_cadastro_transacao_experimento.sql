-- Prova parcial e fictícia em PostgreSQL descartável, não é integração Supabase.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'ffcm_cadastro_teste_local' or inet_server_addr() is not null
     or current_setting('unix_socket_directories') not like '/tmp/ffcm-cadastro.%' then
    raise exception 'Cluster local descartável obrigatório';
  end if;
end $$;
create role ffcm_teste_owner nologin;
create role ffcm_teste_runtime nologin;
create schema experimento_atestado authorization ffcm_teste_owner;
create schema auth;
create schema identidade;
create schema cadastro;
create schema operacao;
create schema auditoria;
create schema extensions;
create extension pgcrypto with schema extensions;
create table public.usuario (id uuid primary key, ativo boolean, perfil text);
create table identidade.concessao_equipe (id uuid primary key, usuario_id uuid, estado text);
create table identidade.sessao (session_id uuid primary key, usuario_id uuid, concessao_id uuid, revogada_em timestamptz);
create table cadastro.paciente (id uuid primary key,nome_cifrado jsonb,nome_preferencia_cifrado jsonb,data_nascimento_cifrada jsonb,criado_por_usuario_id uuid,versao integer not null default 1);
create table cadastro.contato_paciente (id uuid primary key,paciente_id uuid not null references cadastro.paciente(id),tipo text not null,valor_cifrado jsonb not null,versao integer not null default 1,criado_em timestamptz not null default clock_timestamp());
create table operacao.requisicao (id uuid primary key,ator_usuario_id uuid,operacao text,chave_idempotencia text,digest_entrada text,estado text,resultado_id uuid,resultado_versao integer,criada_em timestamptz not null default clock_timestamp(),unique(ator_usuario_id,operacao,chave_idempotencia));
create table auditoria.evento (id uuid primary key,ator_usuario_id uuid,acao text,tipo_objeto text,objeto_id uuid,resultado text check (current_setting('ffcm_teste.falha_auditoria',true) is distinct from 'sim'),request_id uuid);
create function operacao.suprimir_atualizacao_fixture() returns trigger language plpgsql as $$
begin
  if current_setting('ffcm_teste.suprimir_ledger',true) = 'sim' then return null; end if;
  return new;
end $$;
create trigger suprimir_ledger before update on operacao.requisicao for each row execute function operacao.suprimir_atualizacao_fixture();
create function operacao.suprimir_insercao_fixture() returns trigger language plpgsql as $$
begin
  if current_setting('ffcm_teste.suprimir_insercao',true) = tg_table_schema then return null; end if;
  return new;
end $$;
create trigger suprimir_paciente before insert on cadastro.paciente for each row execute function operacao.suprimir_insercao_fixture();
create trigger suprimir_auditoria before insert on auditoria.evento for each row execute function operacao.suprimir_insercao_fixture();
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('ffcm_teste.usuario',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('session_id',current_setting('ffcm_teste.sessao',true)) $$;
create function identidade.sessao_atual_valida() returns boolean language sql as $$ select current_setting('ffcm_teste.ativa',true)='sim' $$;
grant usage on schema experimento_atestado to ffcm_teste_runtime;
grant usage on schema auth,identidade,cadastro,operacao,auditoria,extensions to ffcm_teste_owner;
grant select,update on public.usuario,identidade.sessao,identidade.concessao_equipe to ffcm_teste_owner;
grant select,insert on cadastro.paciente,operacao.requisicao,auditoria.evento to ffcm_teste_owner;
grant select on cadastro.contato_paciente to ffcm_teste_owner;
grant update on operacao.requisicao to ffcm_teste_owner;
set role ffcm_teste_owner;
create function experimento_atestado.ler_chave_interna(p_id text) returns bytea language plpgsql as $$
begin
 if current_setting('ffcm_teste.falha_chave',true)='sim' then
   raise exception using errcode='55000',message='CHAVE_INDISPONIVEL';
 end if;
 return case when p_id='v1' then decode(repeat('07',32),'hex') end;
end $$;
revoke all on function experimento_atestado.ler_chave_interna(text) from public;
create function experimento_atestado.prazo_maximo_teste() returns interval language sql as $$ select interval '60 seconds' $$;
revoke all on function experimento_atestado.prazo_maximo_teste() from public;
\ir ../drafts/20261101100000_atestado_jcs_experimento.sql
\ir ../drafts/20261101110000_atestado_chave_interna_experimento.sql
\ir ../drafts/20261101120000_atestado_autoridade_experimento.sql
\ir ../drafts/20261101130000_cadastro_paciente_experimento.sql
grant execute on function experimento_atestado.criar_paciente(jsonb) to ffcm_teste_runtime;
reset role;
insert into public.usuario values ('10000000-0000-4000-8000-000000000001',true,'administrador');
insert into identidade.concessao_equipe values ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','vinculada');
insert into identidade.sessao values ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003',null);
create function public.assinar_fixture(e jsonb, p_operacao text default 'api.criar_paciente') returns jsonb language plpgsql as $$
declare entrada text := e::text; dados jsonb; texto text; mac text;
begin
 dados := jsonb_build_object('key_id','v1','usuario_id','10000000-0000-4000-8000-000000000001',
   'session_id','10000000-0000-4000-8000-000000000002','request_id',e ->> 'request_id',
   'operacao',p_operacao,'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '30 seconds',
   'digest_entrada',translate(rtrim(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_'));
 texto := dados::text;
 mac := translate(rtrim(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('07',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',dados||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
do $$
declare
 e jsonb := jsonb_build_object('request_id','30000000-0000-4000-8000-000000000001','auditoria_id','40000000-0000-4000-8000-000000000001',
   'paciente_id','20000000-0000-4000-8000-000000000001','chave_idempotencia','ficticia','digest_idempotencia','digestficticio',
   'nome',jsonb_build_object('formato',1,'key_id','v1','nonce','fake','ciphertext','fake','tag','fake'),
   'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id','20000000-0000-4000-8000-000000000001','campo','nome','formato',1)));
 t jsonb; r jsonb; opcionais jsonb; invalido jsonb;
begin
 perform set_config('ffcm_teste.usuario','10000000-0000-4000-8000-000000000001',true);
 perform set_config('ffcm_teste.sessao','10000000-0000-4000-8000-000000000002',true);
 perform set_config('ffcm_teste.ativa','sim',true);
 t := public.assinar_fixture(e);
 begin
   perform experimento_atestado.criar_paciente(jsonb_set(t,'{entrada,paciente_id}','"uuid-invalido-ficticio"'));
   raise exception 'UUID malformado aceito';
 exception when invalid_parameter_value then
   if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 if experimento_atestado.criar_paciente(public.assinar_fixture(e,'api.outra_operacao')) ->> 'ok' is distinct from 'false'
    or exists (select 1 from auditoria.evento) then raise exception 'outra operação assinada gerou auditoria atribuída'; end if;
 perform set_config('ffcm_teste.transporte',t::text,true);
 update public.usuario set perfil='profissional';
 perform set_config('ffcm_teste.suprimir_insercao','auditoria',true);
 begin
   perform experimento_atestado.criar_paciente(t);
   raise exception 'auditoria negada suprimida foi aceita';
 exception when sqlstate 'P0002' then
   if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if;
 end;
 if exists (select 1 from auditoria.evento) then raise exception 'negação sem auditoria deixou registro'; end if;
 perform set_config('ffcm_teste.suprimir_insercao','não',true);
 r := experimento_atestado.criar_paciente(t);
 if r ->> 'ok' is distinct from 'false' or (select count(*) from auditoria.evento where resultado='negado') <> 1 then raise exception 'perfil não negado ou não auditado'; end if;
 r := experimento_atestado.criar_paciente(t);
 if r ->> 'ok' is distinct from 'false' or (select count(*) from auditoria.evento) <> 1 then
   raise exception 'repetição idêntica não preservou negativa auditada';
 end if;
 begin
   perform experimento_atestado.criar_paciente(public.assinar_fixture(jsonb_set(e,'{request_id}','"30000000-0000-4000-8000-000000000099"')));
   raise exception 'auditoria divergente aceita';
 exception when unique_violation then
   if sqlerrm <> 'AUDITORIA_CONFLITANTE' then raise; end if;
 end;
 begin
   perform experimento_atestado.registrar_negacao_fixture('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000099','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
   raise exception 'colisão de ator aceita';
 exception when unique_violation then
   if sqlerrm <> 'AUDITORIA_CONFLITANTE' then raise; end if;
 end;
 insert into auditoria.evento values ('40000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','api.outra_operacao','paciente','20000000-0000-4000-8000-000000000001','negado','30000000-0000-4000-8000-000000000001');
 begin
   perform experimento_atestado.registrar_negacao_fixture('40000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
   raise exception 'colisão de operação aceita';
 exception when unique_violation then
   if sqlerrm <> 'AUDITORIA_CONFLITANTE' then raise; end if;
 end;
 delete from auditoria.evento where id='40000000-0000-4000-8000-000000000099';
 if (select count(*) from auditoria.evento) <> 1 then raise exception 'colisão alterou auditoria'; end if;
 update public.usuario set perfil='administrador';
 delete from auditoria.evento;
 perform set_config('ffcm_teste.ativa','não',true);
 if experimento_atestado.criar_paciente(t) ->> 'ok' is distinct from 'false' then raise exception 'sessão revogada aceita'; end if;
 if not exists (select 1 from auditoria.evento where resultado='negado') then raise exception 'sessão negada sem auditoria'; end if;
 delete from auditoria.evento;
 perform set_config('ffcm_teste.falha_auditoria','sim',true);
 begin
   perform experimento_atestado.criar_paciente(t);
   raise exception 'falha de auditoria na negativa foi aceita';
 exception when check_violation then null; end;
 if exists (select 1 from auditoria.evento) or exists (select 1 from cadastro.paciente) or exists (select 1 from operacao.requisicao) then
   raise exception 'falha da auditoria de negativa deixou efeitos';
 end if;
 perform set_config('ffcm_teste.falha_auditoria','não',true);
 perform set_config('ffcm_teste.ativa','sim',true);
 if experimento_atestado.criar_paciente(jsonb_set(t,'{entrada,atestado,mac}',to_jsonb(repeat('A',43)))) ->> 'ok' is distinct from 'false'
   or exists (select 1 from auditoria.evento) then raise exception 'prova adulterada gerou identidade auditada'; end if;
 perform set_config('ffcm_teste.falha_chave','sim',true);
 begin
   perform experimento_atestado.criar_paciente(t);
   raise exception 'indisponibilidade de chave confundida com prova inválida';
 exception when object_not_in_prerequisite_state then
   if sqlerrm <> 'CHAVE_INDISPONIVEL' then raise; end if;
 end;
 if exists (select 1 from cadastro.paciente) or exists (select 1 from operacao.requisicao) or exists (select 1 from auditoria.evento) then
   raise exception 'falha de chave deixou efeitos';
 end if;
 perform set_config('ffcm_teste.falha_chave','não',true);
 perform set_config('ffcm_teste.usuario','',true);
 if experimento_atestado.criar_paciente(t) ->> 'ok' is distinct from 'false'
   or exists (select 1 from auditoria.evento) then raise exception 'ator ausente gerou identidade auditada'; end if;
 perform set_config('ffcm_teste.usuario','10000000-0000-4000-8000-000000000001',true);
 perform set_config('ffcm_teste.falha_auditoria','sim',true);
 begin
   perform experimento_atestado.criar_paciente(public.assinar_fixture(jsonb_set(e,'{aad,nome,campo}','"outro"')));
   raise exception 'AAD inválido retornou sem auditoria';
 exception when check_violation then null; end;
 perform set_config('ffcm_teste.falha_auditoria','não',true);
 r := experimento_atestado.criar_paciente(public.assinar_fixture(jsonb_set(e,'{aad,nome,campo}','"outro"')));
 if r #>> '{erro,codigo}' is distinct from 'entrada_invalida'
    or not exists (select 1 from auditoria.evento ev where ev.id=(e ->> 'auditoria_id')::uuid
      and ev.ator_usuario_id='10000000-0000-4000-8000-000000000001'::uuid
      and ev.acao='api.criar_paciente' and ev.resultado='negado'
      and ev.request_id=(e ->> 'request_id')::uuid)
    or exists (select 1 from cadastro.paciente) or exists (select 1 from operacao.requisicao) then
   raise exception 'AAD inválido sem negativa auditada';
 end if;
 r := experimento_atestado.criar_paciente(public.assinar_fixture(jsonb_set(e,'{aad,nome,campo}','"outro"')));
 if r #>> '{erro,codigo}' is distinct from 'entrada_invalida'
    or (select count(*) from auditoria.evento where id=(e ->> 'auditoria_id')::uuid) <> 1 then
   raise exception 'repetição de negativa inválida não foi idempotente';
 end if;
 if experimento_atestado.criar_paciente(public.assinar_fixture(e || jsonb_build_object('nome',(e -> 'nome') - 'nonce'))) ->> 'ok' is distinct from 'false'
    or experimento_atestado.criar_paciente(public.assinar_fixture(jsonb_set(e,'{nome,texto_claro}','"ficticio"',true))) ->> 'ok' is distinct from 'false'
    or experimento_atestado.criar_paciente(public.assinar_fixture(jsonb_set(e,'{aad,extra}','{}'::jsonb,true))) ->> 'ok' is distinct from 'false' then
   raise exception 'envelope ou AAD inválido aceito';
 end if;
 if experimento_atestado.criar_paciente(public.assinar_fixture(e || jsonb_build_object('nome_preferencia',e -> 'nome'))) ->> 'ok' is distinct from 'false'
    or experimento_atestado.criar_paciente(public.assinar_fixture(e || jsonb_build_object('data_nascimento',e -> 'nome'))) ->> 'ok' is distinct from 'false' then
   raise exception 'opcional sem AAD aceito';
 end if;
 opcionais := e || jsonb_build_object('nome_preferencia',e -> 'nome','data_nascimento',e -> 'nome',
   'aad',(e -> 'aad') || jsonb_build_object(
     'nome_preferencia',jsonb_build_object('tabela','cadastro.paciente','registro_id',e ->> 'paciente_id','campo','nome_preferencia','formato',1),
     'data_nascimento',jsonb_build_object('tabela','cadastro.paciente','registro_id',e ->> 'paciente_id','campo','data_nascimento','formato',1)));
 if experimento_atestado.criar_paciente(public.assinar_fixture(jsonb_set(opcionais,'{data_nascimento,tag}','null'::jsonb))) ->> 'ok' is distinct from 'false'
    or experimento_atestado.criar_paciente(public.assinar_fixture(jsonb_set(opcionais,'{aad,nome_preferencia,registro_id}','"20000000-0000-4000-8000-000000000099"'))) ->> 'ok' is distinct from 'false' then
   raise exception 'opcional inválido aceito';
 end if;
 foreach invalido in array array[
   jsonb_set(e,'{aad,extra}','{}'::jsonb,true),
   e || jsonb_build_object('nome',(e -> 'nome') - 'nonce'),
   e || jsonb_build_object('nome_preferencia',e -> 'nome'),
   (e - 'nome') || jsonb_build_object('aad',(e -> 'aad') - 'nome')
 ] loop
   delete from auditoria.evento;
   r := experimento_atestado.criar_paciente(public.assinar_fixture(invalido));
   if r #>> '{erro,codigo}' is distinct from 'entrada_invalida'
      or not exists (select 1 from auditoria.evento ev where ev.id=(e ->> 'auditoria_id')::uuid
        and ev.ator_usuario_id='10000000-0000-4000-8000-000000000001'::uuid
        and ev.acao='api.criar_paciente' and ev.resultado='negado'
        and ev.request_id=(e ->> 'request_id')::uuid)
      or exists (select 1 from cadastro.paciente) or exists (select 1 from operacao.requisicao) then
     raise exception 'entrada inválida sem negativa auditada';
   end if;
 end loop;
 delete from auditoria.evento;
 begin
   if experimento_atestado.criar_paciente(public.assinar_fixture(opcionais)) ->> 'ok' is distinct from 'true' then
     raise exception 'opcionais válidos recusados';
   end if;
   raise exception using errcode='P0003',message='ROLLBACK_FIXTURE_OPCIONAIS';
 exception when sqlstate 'P0003' then
   if sqlerrm <> 'ROLLBACK_FIXTURE_OPCIONAIS' then raise; end if;
 end;
 insert into operacao.requisicao values ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','api.criar_paciente','ficticia','digestficticio','registrada','20000000-0000-4000-8000-000000000001',1);
 if experimento_atestado.criar_paciente(t) ->> 'ok' is distinct from 'false' then raise exception 'pendência devolveu sucesso'; end if;
 delete from operacao.requisicao;
 perform set_config('ffcm_teste.falha_auditoria','sim',true);
 begin
   perform experimento_atestado.criar_paciente(t);
   raise exception 'falha de auditoria aceita';
 exception when check_violation then null; end;
 if exists (select 1 from cadastro.paciente) or exists (select 1 from operacao.requisicao) then raise exception 'falha deixou efeitos'; end if;
 perform set_config('ffcm_teste.falha_auditoria','não',true);
 perform set_config('ffcm_teste.suprimir_ledger','sim',true);
 begin
   r := experimento_atestado.criar_paciente(t);
   raise exception 'atualização do ledger suprimida retornou sucesso';
 exception when sqlstate 'P0002' then null; end;
 if exists (select 1 from cadastro.paciente) or exists (select 1 from operacao.requisicao)
    or exists (select 1 from auditoria.evento) then raise exception 'ledger suprimido deixou efeitos'; end if;
 perform set_config('ffcm_teste.suprimir_ledger','não',true);
 for i in 1..2 loop
   perform set_config('ffcm_teste.suprimir_insercao',case i when 1 then 'cadastro' else 'auditoria' end,true);
   begin
     r := experimento_atestado.criar_paciente(t);
     raise exception 'inserção suprimida retornou sucesso';
   exception when sqlstate 'P0002' then null; end;
   if exists (select 1 from cadastro.paciente) or exists (select 1 from operacao.requisicao)
      or exists (select 1 from auditoria.evento) then raise exception 'inserção suprimida deixou efeitos'; end if;
 end loop;
 perform set_config('ffcm_teste.suprimir_insercao','não',true);
 r := experimento_atestado.criar_paciente(t);
 if r ->> 'ok' is distinct from 'true' then raise exception 'cadastro válido recusado'; end if;
 if r -> 'dados' is distinct from jsonb_build_object('paciente_id',e ->> 'paciente_id','nome',e -> 'nome',
   'nome_preferencia',null,'data_nascimento',null,'contatos','[]'::jsonb,'versao',1) then
   raise exception 'primeira resposta não projeta cadastro administrativo';
 end if;
 update cadastro.paciente set versao=2, nome_cifrado=jsonb_set(nome_cifrado,'{ciphertext}','"atualizado"')
   where id=(e ->> 'paciente_id')::uuid;
 insert into cadastro.contato_paciente(id,paciente_id,tipo,valor_cifrado,versao)
 values ('60000000-0000-4000-8000-000000000001',(e ->> 'paciente_id')::uuid,'email',e -> 'nome',3);
 perform set_config('ffcm_teste.falha_auditoria','sim',true);
 begin
   perform experimento_atestado.criar_paciente(t);
   raise exception 'retry retornou dados sem auditoria';
 exception when check_violation then null; end;
 if (select count(*) from cadastro.paciente) <> 1 or (select count(*) from auditoria.evento) <> 1 then
   raise exception 'falha da auditoria no retry alterou dados';
 end if;
 perform set_config('ffcm_teste.falha_auditoria','não',true);
 perform set_config('ffcm_teste.suprimir_insercao','auditoria',true);
 begin
   perform experimento_atestado.criar_paciente(t);
   raise exception 'retry aceitou auditoria suprimida';
 exception when sqlstate 'P0002' then
   if sqlerrm <> 'AUDITORIA_NAO_INSERIDA' then raise; end if;
 end;
 perform set_config('ffcm_teste.suprimir_insercao','não',true);
 r := experimento_atestado.criar_paciente(t);
 if r ->> 'ok' is distinct from 'true' or (select count(*) from cadastro.paciente) <> 1 or (select count(*) from auditoria.evento) <> 2 then raise exception 'retry não preservou criação ou auditoria'; end if;
 if not exists (select 1 from auditoria.evento where acao='api.criar_paciente.repeticao'
   and ator_usuario_id='10000000-0000-4000-8000-000000000001'
   and objeto_id=(e ->> 'paciente_id')::uuid and resultado='permitido'
   and request_id=(e ->> 'request_id')::uuid) then
   raise exception 'retry sem evidência de leitura';
 end if;
 if r -> 'dados' is distinct from jsonb_build_object('paciente_id',e ->> 'paciente_id',
   'nome',jsonb_set(e -> 'nome','{ciphertext}','"atualizado"'),'nome_preferencia',null,'data_nascimento',null,
   'contatos',jsonb_build_array(jsonb_build_object('contato_id','60000000-0000-4000-8000-000000000001',
     'tipo','email','valor',e -> 'nome','versao',3)),'versao',2) then
   raise exception 'repetição não projetou cadastro vigente';
 end if;
 delete from cadastro.contato_paciente;
 e := jsonb_set(e,'{digest_idempotencia}','"diferente"');
 e := jsonb_set(e,'{auditoria_id}','"40000000-0000-4000-8000-000000000099"');
 perform set_config('ffcm_teste.falha_auditoria','sim',true);
 begin
   perform experimento_atestado.criar_paciente(public.assinar_fixture(e));
   raise exception 'conflito retornado sem auditoria';
 exception when check_violation then null; end;
 perform set_config('ffcm_teste.falha_auditoria','não',true);
 r := experimento_atestado.criar_paciente(public.assinar_fixture(e));
 if r #>> '{erro,codigo}' is distinct from 'conflito_idempotencia'
    or not exists (select 1 from auditoria.evento ev where ev.id=(e ->> 'auditoria_id')::uuid
       and ev.ator_usuario_id='10000000-0000-4000-8000-000000000001'::uuid
       and ev.acao='api.criar_paciente' and ev.tipo_objeto='paciente'
       and ev.objeto_id=(e ->> 'paciente_id')::uuid and ev.resultado='negado'
       and ev.request_id=(e ->> 'request_id')::uuid) then
   raise exception 'conflito sem negativa auditada';
 end if;
end $$;
delete from auditoria.evento;
delete from cadastro.paciente;
delete from operacao.requisicao;
set role ffcm_teste_runtime;
do $$
begin
  if experimento_atestado.criar_paciente(current_setting('ffcm_teste.transporte')::jsonb) ->> 'ok' is distinct from 'true' then
    raise exception 'papel restrito não conseguiu executar primeira criação';
  end if;
  begin
    perform * from cadastro.paciente;
    raise exception 'papel restrito acessou tabela diretamente';
  exception when insufficient_privilege then null; end;
  begin
    perform experimento_atestado.ler_chave_interna('v1');
    raise exception 'papel restrito leu chave';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from cadastro.paciente) <> 1 or (select count(*) from auditoria.evento) <> 1
    or (select count(*) from operacao.requisicao where estado='concluida') <> 1 then
    raise exception 'primeira criação por runtime não persistiu efeitos esperados';
  end if;
end $$;
\if :{?ffcm_concorrente}
commit;
\else
rollback;
\endif
