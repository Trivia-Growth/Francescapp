-- Executar apenas em banco local descartável após as migrations; rollback final.
-- Simula registro anterior à migração apenas neste banco descartável.
begin;
delete from operacao.configuracao_lote_teste;
insert into auth.users (id) values ('ae000000-0000-4000-8000-000000000001');
insert into public.usuario (id, perfil) values ('ae000000-0000-4000-8000-000000000001', 'administrador');
insert into operacao.lote_teste (id, identificacao, responsavel_usuario_id) values
 ('ae000000-0000-4000-8000-000000000002', 'teste-proveniencia', 'ae000000-0000-4000-8000-000000000001');
alter table cadastro.paciente disable trigger paciente_exigir_lote_teste;
insert into cadastro.paciente (id, nome_cifrado, criado_por_usuario_id) values
 ('ae000000-0000-4000-8000-000000000003', '{"formato":1,"key_id":"teste","nonce":"teste","ciphertext":"teste","tag":"teste"}', 'ae000000-0000-4000-8000-000000000001');
alter table cadastro.paciente enable trigger paciente_exigir_lote_teste;

do $$
declare envelope constant jsonb := '{"formato":1,"key_id":"teste","nonce":"teste","ciphertext":"teste","tag":"teste"}';
begin
 if has_table_privilege('authenticated', 'operacao.configuracao_lote_teste', 'select,insert,update,delete')
    or has_table_privilege('anon', 'operacao.configuracao_lote_teste', 'select,insert,update,delete')
    or has_table_privilege('service_role', 'operacao.configuracao_lote_teste', 'select,insert,update,delete') then
   raise exception 'Configuração acessível a cliente';
 end if;
 begin
   insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id)
   values ('ae000000-0000-4000-8000-000000000004',envelope,'ae000000-0000-4000-8000-000000000001');
   raise exception 'Aceitou criação sem lote';
 exception when sqlstate '55000' then null; end;
 insert into operacao.configuracao_lote_teste(lote_teste_id) values ('ae000000-0000-4000-8000-000000000002');
 insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id)
 values ('ae000000-0000-4000-8000-000000000004',envelope,'ae000000-0000-4000-8000-000000000001');
 if (select lote_teste_id from cadastro.paciente where id='ae000000-0000-4000-8000-000000000004') is distinct from 'ae000000-0000-4000-8000-000000000002'::uuid
    or (select lote_teste_id from cadastro.paciente where id='ae000000-0000-4000-8000-000000000003') is not null then
   raise exception 'Proveniência incorreta ou registro anterior alterado';
 end if;
 begin
   insert into cadastro.paciente(id,nome_cifrado,lote_teste_id,criado_por_usuario_id)
   values ('ae000000-0000-4000-8000-000000000005',envelope,'ae000000-0000-4000-8000-000000000002','ae000000-0000-4000-8000-000000000001');
   raise exception 'Aceitou lote fornecido pelo cliente';
 exception when sqlstate '22023' then null; end;
 update operacao.lote_teste set encerrado_em=clock_timestamp() where id='ae000000-0000-4000-8000-000000000002';
 begin
   insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id)
   values ('ae000000-0000-4000-8000-000000000005',envelope,'ae000000-0000-4000-8000-000000000001');
   raise exception 'Aceitou lote encerrado';
 exception when sqlstate '55000' then null; end;
end $$;
rollback;
