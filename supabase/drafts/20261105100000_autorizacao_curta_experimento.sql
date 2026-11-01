-- SOMENTE FIXTURE: não instalar. Chave, sessão, operação e auditoria são fictícias.
-- Não comprova Vault, gateway, isolamento de autoridade, RLS ou S-02.
do $$
begin
 if current_database() <> 'ffcm_curta_teste_local'
   or current_setting('listen_addresses') <> ''
   or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-curta\.[A-Za-z0-9]+$'
   or current_setting('data_directory') <> current_setting('unix_socket_directories') || '/data'
 then raise exception 'cluster descartável obrigatório'; end if;
end $$;
create schema autorizacao_curta_fixture;
revoke all on schema autorizacao_curta_fixture from public;
create table autorizacao_curta_fixture.sessao(id uuid primary key, usuario uuid not null, geracao bigint not null, ativa boolean not null);
create table autorizacao_curta_fixture.perfil(usuario uuid primary key, ativo boolean not null);
create table autorizacao_curta_fixture.concessao(usuario uuid primary key, ativa boolean not null);
create table autorizacao_curta_fixture.consumo(id uuid primary key);
create table autorizacao_curta_fixture.efeito(id uuid primary key, entrada jsonb not null);
create table autorizacao_curta_fixture.auditoria(id uuid primary key);

create function autorizacao_curta_fixture.executar(p_dados text,p_mac text,p_entrada text,p_usado jsonb)
returns boolean language plpgsql set search_path=pg_catalog as $$
declare d jsonb; sid uuid; uid uuid; aid uuid; gen bigint; emitido bigint; expira bigint; agora bigint; assinatura text; hash text;
begin
 if p_dados is null or p_entrada is null or p_usado is null or p_mac is null
  or octet_length(p_dados)>4096 or octet_length(p_entrada)>1048576 or p_mac !~ '^[A-Za-z0-9_-]{43}$' then return false; end if;
 begin
  d:=p_dados::jsonb;
  if jsonb_typeof(d)<>'object' or d - array['usuario_id','session_id','geracao','operacao','audiencia','key_id','id','emitido_em','expira_em','digest_entrada'] <> '{}'::jsonb
   or (select count(*) from jsonb_object_keys(d))<>10 or p_entrada::jsonb is distinct from p_usado
   or jsonb_typeof(d->'usuario_id') is distinct from 'string' or jsonb_typeof(d->'session_id') is distinct from 'string'
   or jsonb_typeof(d->'id') is distinct from 'string' or jsonb_typeof(d->'geracao') is distinct from 'number'
   or jsonb_typeof(d->'emitido_em') is distinct from 'number' or jsonb_typeof(d->'expira_em') is distinct from 'number'
   or jsonb_typeof(d->'digest_entrada') is distinct from 'string' then return false; end if;
  sid:=(d->>'session_id')::uuid; uid:=(d->>'usuario_id')::uuid; aid:=(d->>'id')::uuid;
  gen:=(d->>'geracao')::bigint; emitido:=(d->>'emitido_em')::bigint; expira:=(d->>'expira_em')::bigint;
 exception when others then return false;
 end;
 agora:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 if sid is null or uid is null or aid is null or gen is null or gen<1 or emitido is null or expira is null
  or emitido>agora or expira<=agora or expira-emitido<>60000
  or d->>'operacao' is distinct from 'fixture.criar' or d->>'audiencia' is distinct from 'fixture'
  or d->>'key_id' is distinct from 'fixture' then return false; end if;
 hash:=translate(rtrim(encode(public.digest(convert_to(p_entrada,'UTF8'),'sha256'),'base64'),'='),'+/','-_');
 assinatura:=translate(rtrim(encode(public.hmac(convert_to('ffcmapp:autorizacao-curta:v1:'||p_dados,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'='),'+/','-_');
 if d->>'digest_entrada' is distinct from hash or p_mac is distinct from assinatura then return false; end if;
 perform 1 from autorizacao_curta_fixture.sessao where id=sid and usuario=uid and geracao=gen and ativa for update;
 if not found then return false; end if;
 -- Revogadores devem atualizar estas mesmas linhas; locks persistem até o commit.
 perform 1 from autorizacao_curta_fixture.perfil where usuario=uid and ativo for update;
 if not found then return false; end if;
 perform 1 from autorizacao_curta_fixture.concessao where usuario=uid and ativa for update;
 if not found then return false; end if;
 -- O lock pode ter aguardado até depois da expiração.
 agora:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 if emitido>agora or expira<=agora then return false; end if;
 insert into autorizacao_curta_fixture.consumo values(aid) on conflict do nothing;
 if not found then return false; end if;
 insert into autorizacao_curta_fixture.efeito values(aid,p_usado);
 insert into autorizacao_curta_fixture.auditoria values(aid);
 return true;
end $$;
revoke all on function autorizacao_curta_fixture.executar(text,text,text,jsonb) from public;
