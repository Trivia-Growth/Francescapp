-- Apenas cluster descartável; fixtures confirmadas localmente para acesso dblink.
\set ON_ERROR_STOP on
\set ffcm_concorrente true
\ir fundacao_cadastro_transacao_experimento.sql
create extension dblink;
do $$
declare
 conn text := format('host=%s port=%s dbname=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database());
 a integer; b integer; bloqueado boolean; resultado jsonb; transporte jsonb; valida boolean;
 e jsonb := jsonb_build_object('request_id','30000000-0000-4000-8000-000000000002','auditoria_id','40000000-0000-4000-8000-000000000002',
   'paciente_id','20000000-0000-4000-8000-000000000002','chave_idempotencia','segunda_ficticia','digest_idempotencia','digestficticio',
   'nome',jsonb_build_object('formato',1,'key_id','v1','nonce','fake','ciphertext','fake','tag','fake'),
   'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id','20000000-0000-4000-8000-000000000002','campo','nome','formato',1)));
 cmd text;
begin
 perform dblink_connect('ca',conn); perform dblink_connect('cb',conn);
 select pid into a from dblink('ca','select pg_backend_pid()') as t(pid integer);
 select pid into b from dblink('cb','select pg_backend_pid()') as t(pid integer);
 perform dblink_exec('ca',$q$set ffcm_teste.usuario='10000000-0000-4000-8000-000000000001'$q$);
 perform dblink_exec('cb',$q$set ffcm_teste.usuario='10000000-0000-4000-8000-000000000001'$q$);
 perform dblink_exec('ca',$q$set ffcm_teste.sessao='10000000-0000-4000-8000-000000000002'$q$);
 perform dblink_exec('cb',$q$set ffcm_teste.sessao='10000000-0000-4000-8000-000000000002'$q$);
 perform dblink_exec('ca',$q$set ffcm_teste.ativa='sim'$q$);
 perform dblink_exec('cb',$q$set ffcm_teste.ativa='sim'$q$);
 transporte := public.assinar_fixture(e);
 cmd := format('select experimento_atestado.criar_paciente(%L::jsonb)',transporte::text);
 select ok into valida from dblink('cb',format('select experimento_atestado.verificar_criar_paciente(%L,%L,%L::jsonb,%L::jsonb,%L)',
   transporte ->> 'entrada_canonica', transporte ->> 'dados_canonicos',
   ((transporte -> 'entrada') - 'atestado')::text, ((transporte -> 'entrada' -> 'atestado') - 'mac')::text,
   transporte -> 'entrada' -> 'atestado' ->> 'mac')) as t(ok boolean);
 if valida is distinct from true then raise exception 'atestado ou identidade inicial inválida'; end if;
 -- Revogação bloqueia concessão; criação aguarda e deve negar depois do commit.
 perform dblink_exec('ca','begin');
 perform dblink_exec('ca',$q$update identidade.concessao_equipe set estado='revogada'$q$);
 perform dblink_send_query('cb',cmd);
 bloqueado := false;
 for i in 1..100 loop
   select a=any(pg_blocking_pids(b)) into bloqueado; exit when bloqueado; perform pg_sleep(0.02);
 end loop;
 if not bloqueado then raise exception 'criação não bloqueou na revogação'; end if;
 perform dblink_exec('ca','commit');
 select r into resultado from dblink_get_result('cb') as t(r jsonb);
 if resultado ->> 'ok' is distinct from 'false' or resultado #>> '{erro,codigo}' is distinct from 'sem_permissao'
    or clock_timestamp() >= (transporte #>> '{entrada,atestado,expira_em}')::timestamptz then
   raise exception 'negação de revogação não demonstrada dentro do prazo';
 end if;
 if exists (select 1 from cadastro.paciente where id='20000000-0000-4000-8000-000000000002')
    or exists (select 1 from operacao.requisicao where chave_idempotencia='segunda_ficticia')
    or not exists (select 1 from auditoria.evento ev where ev.id='40000000-0000-4000-8000-000000000002' and ev.resultado='negado') then
   raise exception 'revogação deixou efeitos inesperados';
 end if;
 perform * from dblink_get_result('cb') as t(r jsonb);
 perform dblink_exec('ca',$q$update identidade.concessao_equipe set estado='vinculada'$q$);
 -- Sessão revogada enquanto criação aguarda seu lock.
 e := jsonb_set(e,'{auditoria_id}','"40000000-0000-4000-8000-000000000004"');
 transporte := public.assinar_fixture(e);
 cmd := format('select experimento_atestado.criar_paciente(%L::jsonb)',transporte::text);
 select ok into valida from dblink('cb',format('select experimento_atestado.verificar_criar_paciente(%L,%L,%L::jsonb,%L::jsonb,%L)',
   transporte ->> 'entrada_canonica', transporte ->> 'dados_canonicos',
   ((transporte -> 'entrada') - 'atestado')::text, ((transporte -> 'entrada' -> 'atestado') - 'mac')::text,
   transporte -> 'entrada' -> 'atestado' ->> 'mac')) as t(ok boolean);
 if valida is distinct from true then raise exception 'atestado inválido antes de revogar sessão'; end if;
 perform dblink_exec('ca','begin');
 perform dblink_exec('ca',$q$update identidade.sessao set revogada_em=clock_timestamp()$q$);
 perform dblink_send_query('cb',cmd);
 bloqueado := false;
 for i in 1..100 loop
   select a=any(pg_blocking_pids(b)) into bloqueado; exit when bloqueado; perform pg_sleep(0.02);
 end loop;
 if not bloqueado then raise exception 'criação não bloqueou na sessão'; end if;
 perform dblink_exec('ca','commit');
 select r into resultado from dblink_get_result('cb') as t(r jsonb);
 if resultado ->> 'ok' is distinct from 'false' or resultado #>> '{erro,codigo}' is distinct from 'sem_permissao'
    or clock_timestamp() >= (transporte #>> '{entrada,atestado,expira_em}')::timestamptz then
   raise exception 'negação de sessão não demonstrada no prazo';
 end if;
 if exists (select 1 from cadastro.paciente where id='20000000-0000-4000-8000-000000000002')
    or exists (select 1 from operacao.requisicao where chave_idempotencia='segunda_ficticia')
    or not exists (select 1 from auditoria.evento ev where ev.id='40000000-0000-4000-8000-000000000004' and ev.resultado='negado') then
   raise exception 'efeitos inesperados da revogação de sessão';
 end if;
 perform * from dblink_get_result('cb') as t(r jsonb);
 -- Apenas para fixture: não representa reativação permitida em produção.
 perform dblink_exec('ca','update identidade.sessao set revogada_em=null');
 e := jsonb_set(e,'{auditoria_id}','"40000000-0000-4000-8000-000000000005"');
 transporte := public.assinar_fixture(e);
 cmd := format('select experimento_atestado.criar_paciente(%L::jsonb)',transporte::text);
 select ok into valida from dblink('cb',format('select experimento_atestado.verificar_criar_paciente(%L,%L,%L::jsonb,%L::jsonb,%L)',
   transporte ->> 'entrada_canonica', transporte ->> 'dados_canonicos',
   ((transporte -> 'entrada') - 'atestado')::text, ((transporte -> 'entrada' -> 'atestado') - 'mac')::text,
   transporte -> 'entrada' -> 'atestado' ->> 'mac')) as t(ok boolean);
 if valida is distinct from true then raise exception 'atestado ou identidade inicial inválida no rebaixamento'; end if;
 -- Rebaixamento ganha mesma ordem de lock; criação deve negar após commit.
 perform dblink_exec('ca','begin');
 perform * from dblink('ca','select id from identidade.concessao_equipe for update') as t(id uuid);
 perform dblink_exec('ca',$q$update public.usuario set perfil='profissional'$q$);
 perform dblink_send_query('cb',cmd);
 bloqueado := false;
 for i in 1..100 loop
   select a=any(pg_blocking_pids(b)) into bloqueado; exit when bloqueado; perform pg_sleep(0.02);
 end loop;
 if not bloqueado then raise exception 'criação não bloqueou no rebaixamento'; end if;
 perform dblink_exec('ca','commit');
 select r into resultado from dblink_get_result('cb') as t(r jsonb);
 if resultado ->> 'ok' is distinct from 'false' or resultado #>> '{erro,codigo}' is distinct from 'sem_permissao'
    or clock_timestamp() >= (transporte #>> '{entrada,atestado,expira_em}')::timestamptz then
   raise exception 'negação de rebaixamento não demonstrada dentro do prazo';
 end if;
 perform * from dblink_get_result('cb') as t(r jsonb);
 if exists (select 1 from cadastro.paciente where id='20000000-0000-4000-8000-000000000002')
    or exists (select 1 from operacao.requisicao where chave_idempotencia='segunda_ficticia')
    or not exists (select 1 from auditoria.evento evento where evento.id='40000000-0000-4000-8000-000000000005' and evento.resultado='negado') then
   raise exception 'efeitos de criação negada incorretos';
 end if;
 perform dblink_exec('ca',$q$update public.usuario set perfil='administrador'$q$);
 -- Criação vence; revogação aguarda término da transação de criação.
 e := jsonb_set(e,'{auditoria_id}','"40000000-0000-4000-8000-000000000003"');
 cmd := format('select experimento_atestado.criar_paciente(public.assinar_fixture(%L::jsonb))',e::text);
 perform dblink_exec('ca','begin');
 select r into resultado from dblink('ca',cmd) as t(r jsonb);
 if resultado ->> 'ok' is distinct from 'true' then raise exception 'criação anterior recusada'; end if;
 perform dblink_send_query('cb',$q$update identidade.concessao_equipe set estado='revogada'$q$);
 bloqueado := false;
 for i in 1..100 loop
   select a=any(pg_blocking_pids(b)) into bloqueado; exit when bloqueado; perform pg_sleep(0.02);
 end loop;
 if not bloqueado then raise exception 'revogação não esperou criação'; end if;
 perform dblink_exec('ca','commit');
 perform * from dblink_get_result('cb') as t(r text);
 if not exists (select 1 from cadastro.paciente where id='20000000-0000-4000-8000-000000000002')
    or not exists (select 1 from identidade.concessao_equipe where estado='revogada') then
   raise exception 'criação ou revogação não persistiu';
 end if;
 perform * from dblink_get_result('cb') as t(r text);
 perform dblink_exec('ca',$q$update identidade.concessao_equipe set estado='vinculada'$q$);
 -- Mesma chave: commit com digest igual retorna registro anterior; digest diferente
 -- conflita; rollback da primeira tentativa permite à segunda criar.
 for caso in 1..3 loop
   e := jsonb_set(e,'{chave_idempotencia}',to_jsonb('corrida-' || caso::text));
   e := jsonb_set(e,'{digest_idempotencia}',to_jsonb('digest-original'::text));
   e := jsonb_set(e,'{paciente_id}',to_jsonb(format('21000000-0000-4000-8000-%s',lpad((caso*2)::text,12,'0'))));
   e := jsonb_set(e,'{auditoria_id}',to_jsonb(format('41000000-0000-4000-8000-%s',lpad((caso*2)::text,12,'0'))));
   e := jsonb_set(e,'{request_id}',to_jsonb(format('31000000-0000-4000-8000-%s',lpad((caso*2)::text,12,'0'))));
   e := jsonb_set(e,'{aad,nome,registro_id}',e -> 'paciente_id');
   perform dblink_exec('ca','begin');
   cmd := format('select experimento_atestado.criar_paciente(public.assinar_fixture(%L::jsonb))',e::text);
   select r into resultado from dblink('ca',cmd) as t(r jsonb);
   if resultado ->> 'ok' is distinct from 'true' then raise exception 'primeira tentativa falhou'; end if;
   e := jsonb_set(e,'{paciente_id}',to_jsonb(format('21000000-0000-4000-8000-%s',lpad((caso*2+1)::text,12,'0'))));
   e := jsonb_set(e,'{auditoria_id}',to_jsonb(format('41000000-0000-4000-8000-%s',lpad((caso*2+1)::text,12,'0'))));
   e := jsonb_set(e,'{request_id}',to_jsonb(format('31000000-0000-4000-8000-%s',lpad((caso*2+1)::text,12,'0'))));
   e := jsonb_set(e,'{aad,nome,registro_id}',e -> 'paciente_id');
   if caso = 2 then e := jsonb_set(e,'{digest_idempotencia}',to_jsonb('digest-diferente'::text)); end if;
   cmd := format('select experimento_atestado.criar_paciente(public.assinar_fixture(%L::jsonb))',e::text);
   perform dblink_send_query('cb',cmd);
   bloqueado := false;
   for i in 1..100 loop
     select a=any(pg_blocking_pids(b)) into bloqueado;
     exit when bloqueado;
     perform pg_sleep(0.02);
   end loop;
   if bloqueado is distinct from true then raise exception 'segunda tentativa não aguardou primeira, caso %',caso; end if;
   perform dblink_exec('ca',case when caso = 3 then 'rollback' else 'commit' end);
   select r into resultado from dblink_get_result('cb') as t(r jsonb);
   perform * from dblink_get_result('cb') as t(r jsonb);
   if caso = 2 then
     if resultado ->> 'ok' is distinct from 'false' or resultado #>> '{erro,codigo}' is distinct from 'conflito_idempotencia' then
       raise exception 'digest diferente não conflitou';
     end if;
   elsif resultado ->> 'ok' is distinct from 'true' then
     raise exception 'segunda tentativa não sucedeu, caso %',caso;
   end if;
   if caso <> 2 and resultado #>> '{dados,paciente_id}' is distinct from
     format('21000000-0000-4000-8000-%s',lpad((caso*2 + case when caso=3 then 1 else 0 end)::text,12,'0')) then
     raise exception 'resultado não aponta para paciente correto, caso %',caso;
   end if;
   if (select count(*) from operacao.requisicao where chave_idempotencia='corrida-' || caso::text and estado='concluida') <> 1
      or (select count(*) from cadastro.paciente where id in
        (format('21000000-0000-4000-8000-%s',lpad((caso*2)::text,12,'0'))::uuid,
         format('21000000-0000-4000-8000-%s',lpad((caso*2+1)::text,12,'0'))::uuid)) <> 1 then
     raise exception 'efeitos duplicados ou ausentes, caso %',caso;
   end if;
   if (select count(*) from auditoria.evento where request_id in
        (format('31000000-0000-4000-8000-%s',lpad((caso*2)::text,12,'0'))::uuid,
         format('31000000-0000-4000-8000-%s',lpad((caso*2+1)::text,12,'0'))::uuid))
       <> (case when caso in (1,2) then 2 else 1 end) then
     raise exception 'auditoria incorreta na corrida, caso %',caso;
   end if;
   if caso = 2 and not exists (
     select 1 from auditoria.evento ev
     where ev.id = (e ->> 'auditoria_id')::uuid
       and ev.ator_usuario_id = '10000000-0000-4000-8000-000000000001'::uuid
       and ev.acao = 'api.criar_paciente' and ev.resultado = 'negado'
       and ev.tipo_objeto = 'paciente' and ev.objeto_id = (e ->> 'paciente_id')::uuid
       and ev.request_id = (e ->> 'request_id')::uuid
   ) then
     raise exception 'conflito concorrente não gerou auditoria de negação';
   end if;
 end loop;
 perform dblink_disconnect('ca'); perform dblink_disconnect('cb');
end $$;
