\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../drafts/20261112150000_barreira_acesso_paciente.sql
do $$
declare ator uuid:='10000000-0000-4000-8000-000000000001'; paciente uuid:='40000000-0000-4000-8000-000000000001';
 reserva uuid:=gen_random_uuid(); comando uuid:=gen_random_uuid(); outra uuid:=gen_random_uuid(); estado jsonb;
begin
 if has_function_privilege('authenticated','operacao.reservar_concessao_acesso_profissional_privado(uuid,bigint,uuid,uuid)','execute')
  or has_table_privilege('authenticated','operacao.reserva_concessao_acesso_profissional','select') then raise exception 'ACESSO_DIRETO_INDEVIDO'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator)::text,true);
 if operacao.reservar_concessao_acesso_profissional_privado(ator,1,reserva,paciente)<>'aberta' then raise exception 'RESERVA_FALHOU'; end if;
 if operacao.reservar_concessao_acesso_profissional_privado('10000000-0000-4000-8000-000000000002',1,outra,paciente)<>'negada' then raise exception 'ATOR_FORJADO_ACEITO'; end if;
 if operacao.reservar_concessao_acesso_profissional_privado(ator,1,outra,paciente)<>'bloqueada' then raise exception 'SEGUNDA_RESERVA_ACEITA'; end if;
 estado:=operacao.consultar_barreira_concessao_acesso_profissional_privado(gen_random_uuid());
 if estado#>>'{reserva,id}' <> reserva::text or estado#>>'{reserva,estado}' <> 'aberta' then raise exception 'RECONCILIACAO_FALHOU'; end if;
 if operacao.encerrar_concessao_acesso_profissional_privado(ator,1,reserva,comando)<>'cancelada' then raise exception 'ENCERRAMENTO_FALHOU'; end if;
 if operacao.reservar_concessao_acesso_profissional_privado(ator,1,reserva,paciente)<>'cancelada' then raise exception 'RESERVA_ATRASADA_ACEITA'; end if;
 if operacao.reservar_concessao_acesso_profissional_privado(ator,2,outra,paciente)<>'bloqueada' then raise exception 'RECIBO_NAO_BLOQUEOU'; end if;
 if operacao.reconhecer_barreira_concessao_acesso_profissional_privado(comando,gen_random_uuid())<>'reconhecido' then raise exception 'RECONHECIMENTO_FALHOU'; end if;
 if operacao.reservar_concessao_acesso_profissional_privado(ator,2,outra,paciente)<>'aberta' then raise exception 'REABERTURA_FALHOU'; end if;
end $$;
