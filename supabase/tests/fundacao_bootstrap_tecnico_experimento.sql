-- Exclusivamente PostgreSQL isolado fictício; nenhuma prova de Supabase/Auth real.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'ffcm_bootstrap_teste_local'
   or current_setting('unix_socket_directories') !~ '^/tmp/ffcm-bootstrap\.[A-Za-z0-9]+$'
   or inet_client_addr() is not null then raise exception 'banco isolado obrigatório'; end if;
end $$;
begin;
insert into auth.users(id) values ('51000000-0000-4000-8000-000000000001'), ('51000000-0000-4000-8000-000000000002');
insert into identidade.bootstrap_experimento(projeto_ref) values ('projeto-ficticio');
-- Conta local inativa já existente não pode ser reativada ou sobrescrita.
insert into public.usuario(id,perfil,ativo) values ('51000000-0000-4000-8000-000000000002','profissional',false);
do $$
declare e constant jsonb := '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}';
 auth_antes jsonb; usuario_antes jsonb; falhou boolean := false;
begin
 select to_jsonb(a) into auth_antes from auth.users a where id='51000000-0000-4000-8000-000000000002';
 select to_jsonb(u) into usuario_antes from public.usuario u where id='51000000-0000-4000-8000-000000000002';
 begin
   perform identidade.bootstrap_tecnico_experimento('projeto-ficticio','51000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000002',e,'hmac',e,'operador','53000000-0000-4000-8000-000000000002');
 exception when unique_violation then falhou := true; end;
 if not falhou or auth_antes is distinct from (select to_jsonb(a) from auth.users a where id='51000000-0000-4000-8000-000000000002')
   or usuario_antes is distinct from (select to_jsonb(u) from public.usuario u where id='51000000-0000-4000-8000-000000000002')
   or exists(select 1 from identidade.concessao_equipe) or exists(select 1 from identidade.excecao_tecnica)
   or exists(select 1 from auditoria.evento) or exists(select 1 from identidade.bootstrap_experimento where usuario_id is not null)
 then raise exception 'conta existente alterada'; end if;
end $$;
delete from public.usuario where id='51000000-0000-4000-8000-000000000002';
-- ID de concessão ocupado não pode ser transferido a outra identidade.
do $$
declare e constant jsonb := '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}';
 antes jsonb; falhou boolean := false;
begin
 insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,motivo_cifrado)
 values ('52000000-0000-4000-8000-000000000001',e,'outro-hmac','profissional','google_workspace','pendente',e);
 select to_jsonb(c) into antes from identidade.concessao_equipe c where id='52000000-0000-4000-8000-000000000001';
 begin
  perform identidade.bootstrap_tecnico_experimento('projeto-ficticio','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',e,'hmac',e,'operador','53000000-0000-4000-8000-000000000001');
 exception when unique_violation then falhou := true; end;
 if not falhou or antes is distinct from (select to_jsonb(c) from identidade.concessao_equipe c where id='52000000-0000-4000-8000-000000000001')
   or exists(select 1 from public.usuario) or exists(select 1 from identidade.excecao_tecnica)
   or exists(select 1 from auditoria.evento) or exists(select 1 from identidade.bootstrap_experimento where usuario_id is not null)
 then raise exception 'concessão preexistente alterada'; end if;
 delete from identidade.concessao_equipe where id='52000000-0000-4000-8000-000000000001';
end $$;
create function pg_temp.falhar_auditoria() returns trigger language plpgsql as $$
begin raise exception 'auditoria indisponível'; end $$;
create trigger teste_falha_auditoria before insert on auditoria.evento
for each row execute function pg_temp.falhar_auditoria();
do $$
declare e constant jsonb := '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}';
begin
 begin
   perform identidade.bootstrap_tecnico_experimento('projeto-ficticio','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',e,'hmac',e,'operador','53000000-0000-4000-8000-000000000001');
   raise exception 'auditoria deveria falhar';
 exception when raise_exception then
   if sqlerrm <> 'auditoria indisponível' then raise; end if;
 end;
 if exists(select 1 from public.usuario) or exists(select 1 from identidade.concessao_equipe)
   or exists(select 1 from identidade.excecao_tecnica)
   or exists(select 1 from identidade.bootstrap_experimento where usuario_id is not null)
 then raise exception 'falha de auditoria deixou concessão'; end if;
end $$;
drop trigger teste_falha_auditoria on auditoria.evento;
create function pg_temp.suprimir_auditoria() returns trigger language plpgsql as $$ begin return null; end $$;
create trigger teste_suprime_auditoria before insert on auditoria.evento
for each row execute function pg_temp.suprimir_auditoria();
do $$
declare e constant jsonb := '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}';
begin
 begin
   perform identidade.bootstrap_tecnico_experimento('projeto-ficticio','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',e,'hmac',e,'operador','53000000-0000-4000-8000-000000000001');
   raise exception 'supressão deveria falhar';
 exception when raise_exception then
   if sqlerrm <> 'auditoria indisponível' then raise; end if;
 end;
 if exists(select 1 from public.usuario) or exists(select 1 from identidade.concessao_equipe)
   or exists(select 1 from identidade.excecao_tecnica)
   or exists(select 1 from identidade.bootstrap_experimento where usuario_id is not null)
 then raise exception 'supressão de auditoria deixou concessão'; end if;
end $$;
drop trigger teste_suprime_auditoria on auditoria.evento;
do $$
declare e constant jsonb := '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}';
 alvo record; falhou boolean;
begin
 for alvo in select * from (values
   ('public.usuario','insert'),('identidade.concessao_equipe','insert'),
   ('identidade.excecao_tecnica','insert'),('identidade.bootstrap_experimento','update')
 ) as alvos(tabela,evento) loop
   execute format('create trigger teste_suprime before %s on %s for each row execute function pg_temp.suprimir_auditoria()', alvo.evento, alvo.tabela);
   falhou := false;
   begin
     perform identidade.bootstrap_tecnico_experimento('projeto-ficticio','51000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',e,'hmac',e,'operador','53000000-0000-4000-8000-000000000001');
   exception when raise_exception then
     if sqlerrm not like 'persistência de % indisponível' then raise; end if;
     falhou := true;
   end;
   if not falhou or exists(select 1 from public.usuario) or exists(select 1 from identidade.concessao_equipe)
     or exists(select 1 from identidade.excecao_tecnica) or exists(select 1 from auditoria.evento)
     or exists(select 1 from identidade.bootstrap_experimento where usuario_id is not null)
   then raise exception 'supressão em % não reverteu bootstrap', alvo.tabela; end if;
   execute format('drop trigger teste_suprime on %s', alvo.tabela);
 end loop;
end $$;
do $$
declare
 u constant uuid := '51000000-0000-4000-8000-000000000001';
 c constant uuid := '52000000-0000-4000-8000-000000000001';
 r constant uuid := '53000000-0000-4000-8000-000000000001';
 e constant jsonb := '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}';
 resultado text;
begin
 if has_function_privilege('anon','identidade.bootstrap_tecnico_experimento(text,uuid,uuid,jsonb,text,jsonb,text,uuid)','execute')
   or has_function_privilege('authenticated','identidade.bootstrap_tecnico_experimento(text,uuid,uuid,jsonb,text,jsonb,text,uuid)','execute')
   or has_table_privilege('anon','identidade.bootstrap_experimento','select,insert,update,delete')
   or has_table_privilege('authenticated','identidade.bootstrap_experimento','select,insert,update,delete') then
   raise exception 'bootstrap exposto';
 end if;
 begin
   perform identidade.bootstrap_tecnico_experimento('outro',u,c,e,'hmac',e,'operador',r);
   raise exception 'alvo incorreto aceito';
 exception when invalid_parameter_value then null; end;
 begin
   perform identidade.bootstrap_tecnico_experimento('projeto-ficticio','51000000-0000-4000-8000-000000000003',c,e,'hmac',e,'operador',r);
   raise exception 'identidade inexistente aceita';
 exception when invalid_parameter_value then null; end;
 resultado := identidade.bootstrap_tecnico_experimento('projeto-ficticio',u,c,e,'hmac',e,'operador',r);
 if resultado is distinct from 'inicializado' then raise exception 'bootstrap falhou'; end if;
 resultado := identidade.bootstrap_tecnico_experimento('projeto-ficticio',u,c,e,'hmac',e,'operador',r);
 if resultado is distinct from 'ja_inicializado' then raise exception 'repetição falhou'; end if;
 if (select count(*) from auditoria.evento where objeto_id=u and acao='bootstrap.tecnico') <> 2 then raise exception 'auditoria ausente'; end if;
 if not exists(select 1 from identidade.concessao_equipe where id=c and metodo='tecnica' and subject_google is null and usuario_id=u) then raise exception 'concessão inválida'; end if;
 -- Repetir depois da desativação não pode reativar ou restaurar perfil.
 update public.usuario set ativo=false, perfil='profissional' where id=u;
 resultado := identidade.bootstrap_tecnico_experimento('projeto-ficticio',u,c,e,'hmac',e,'operador',r);
 if resultado is distinct from 'ja_inicializado' or not exists(select 1 from public.usuario where id=u and not ativo and perfil='profissional') then
   raise exception 'repetição alterou autoridade'; end if;
 begin
   perform identidade.bootstrap_tecnico_experimento('projeto-ficticio',u,gen_random_uuid(),e,'hmac',e,'operador',r);
   raise exception 'concessão divergente aceita';
 exception when invalid_parameter_value then null; end;
 begin
   update identidade.concessao_equipe set estado='pendente',usuario_id=null,vinculada_em=null where id=c;
   raise exception 'pré-concessão técnica aceita';
 exception when check_violation then null; end;
 begin
   update identidade.concessao_equipe set subject_google='inventado' where id=c;
   raise exception 'subject inventado aceito';
 exception when check_violation then null; end;
end $$;
rollback;
