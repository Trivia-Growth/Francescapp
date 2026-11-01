-- Somente instância descartável: owner local, fixtures fictícias e dblink.
-- Pré-requisitos: migração de fundação e drafts de fencing e admissão técnica.
-- A operação de revogação é uma simulação; não comprova RPC, RLS, Auth ou Vault.
-- Exclusivamente banco novo ffcm_admissao_teste_* em socket /tmp/ffcm-admissao.*;
-- descarte somente a instância própria. A trava é defesa adicional, não prova
-- que uma instância cujo administrador alterou sua configuração seja descartável.
\set ON_ERROR_STOP on
do $$
begin
 if current_database() !~ '^ffcm_admissao_teste_[a-z0-9]+$'
    or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-admissao\.[A-Za-z0-9]+$'
    or inet_client_addr() is not null then
   raise exception 'execução recusada: requer banco e socket de teste isolado';
 end if;
end $$;
create extension if not exists dblink;
insert into auth.users(id) select ('41000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid from generate_series(1,4) i;
insert into public.usuario(id,perfil) select ('41000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,'administrador' from generate_series(1,4) i;
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
select ('42000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
 '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}', 'fixture-'||i,
 'administrador','google_workspace','vinculada',('41000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
 'fixture-'||i,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',clock_timestamp() - interval '1 second',clock_timestamp() from generate_series(1,4) i;
insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado)
select ('41000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,('42000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
 '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' from generate_series(1,4) i;
create function public.teste_revogar_admissao(c uuid,u uuid,s uuid) returns boolean language plpgsql as $$
begin
 perform 1 from identidade.concessao_equipe where id=c for update;
 perform 1 from public.usuario where id=u for update;
 update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=u,
 motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where session_id=s;
 update public.usuario set ativo=false where id=u;
 return true;
end $$;

select dblink_connect('a', format('dbname=%L host=%L port=%s application_name=teste_admissao_a', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
select dblink_connect('b', format('dbname=%L host=%L port=%s application_name=teste_admissao_b', current_database(), current_setting('unix_socket_directories'), current_setting('port')));
do $$
declare i int; u uuid; c uuid; s uuid; r uuid; entrada jsonb; q text; resultado jsonb; lock_visto boolean; pid_a int; pid_b int;
begin
 select pid into pid_a from dblink('a','select pg_backend_pid()') as t(pid int);
 select pid into pid_b from dblink('b','select pg_backend_pid()') as t(pid int);
 for i in 1..4 loop
  u := ('41000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
  c := ('42000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
  s := ('43000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
  r := ('44000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
  entrada := jsonb_build_object('identidade',jsonb_build_object('usuario_id',u,'session_id',s,'metodo','tecnica'),
    'request_id',r,'credencial_refresh', '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb);
  perform dblink_exec('a','begin');
  if i in (1,2) then
   perform * from dblink('a',format('select id from identidade.concessao_equipe where id=%L for update',c)) as t(id uuid);
   perform * from dblink('a',format('select id from public.usuario where id=%L for update',u)) as t(id uuid);
   if i=1 then
    perform dblink_exec('a',format('update public.usuario set ativo=false where id=%L',u));
   else
    perform dblink_exec('a',format('update identidade.concessao_equipe set estado=''revogada'',revogada_em=clock_timestamp(),revogada_por_usuario_id=%L,motivo_revogacao_cifrado=%L::jsonb where id=%L',u,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',c));
   end if;
   q := format('select identidade.admitir_sessao_tecnica(%L::jsonb)',entrada);
  else
   select t.v into resultado from dblink('a',format('select identidade.admitir_sessao_tecnica(%L::jsonb)',entrada)) as t(v jsonb);
   if resultado->>'ok' is distinct from 'true' then raise exception 'admissão inicial negada no caso %',i; end if;
   if i=3 then
    q := format('select to_jsonb(public.teste_revogar_admissao(%L,%L,%L))',c,u,s);
   else
    entrada := jsonb_set(entrada,'{request_id}',to_jsonb('45000000-0000-4000-8000-000000000004'::text));
    q := format('select identidade.admitir_sessao_tecnica(%L::jsonb)',entrada);
   end if;
  end if;
  perform dblink_send_query('b',q);
  lock_visto := false;
  for j in 1..100 loop
   if exists(select 1 from pg_stat_activity where pid=pid_b and wait_event_type='Lock' and pid_a = any(pg_blocking_pids(pid_b))) then lock_visto := true; exit; end if;
   perform pg_sleep(0.02);
  end loop;
  if not lock_visto then raise exception 'espera em lock não observada no caso %',i; end if;
  perform dblink_exec('a','commit');
  select t.v into resultado from dblink_get_result('b') as t(v jsonb);
  if i=3 and resultado is distinct from 'true'::jsonb then raise exception 'revogação simulada falhou'; end if;
  if i<>3 and resultado->>'ok' is distinct from 'false' then raise exception 'admissão concorrente não negada no caso %',i; end if;
  perform * from dblink_get_result('b') as t(v jsonb);
  if i in (1,2) and exists(select 1 from identidade.sessao where session_id=s) then raise exception 'sessão criada após retirada de autoridade'; end if;
  if i=3 and not exists(select 1 from identidade.sessao where session_id=s and revogada_em is not null) then raise exception 'sessão não revogada após admissão'; end if;
  if i=3 and exists(select 1 from identidade.iniciar_renovacao(s,u)) then raise exception 'credencial disponível para renovação após revogação'; end if;
  if i=4 and (select count(*) from identidade.credencial_sessao where session_id=s) <> 1 then raise exception 'credencial duplicada'; end if;
  if i in (1,2) and not exists(select 1 from auditoria.evento e where e.request_id=r and e.resultado='negado') then raise exception 'negação sem auditoria no caso %',i; end if;
  if i=4 and not exists(select 1 from auditoria.evento e where e.request_id='45000000-0000-4000-8000-000000000004' and e.resultado='negado') then raise exception 'replay sem auditoria'; end if;
  raise notice 'caso %: lock observado e resultado conferido',i;
 end loop;
end $$;
select dblink_disconnect('a');
select dblink_disconnect('b');
