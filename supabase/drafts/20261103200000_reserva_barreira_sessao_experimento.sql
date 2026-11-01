-- EXPERIMENTO SEM AUTH REAL: identidade, admissão e segredo são hipóteses de
-- fixture. Não integra ou modifica sessões reais. Nenhum dado de paciente.
create table reserva_fixture.snapshot_sessao_fixture (
 sessao uuid primary key, ator uuid not null references reserva_fixture.ator(id),
 epoca bigint not null, verificador bytea not null
);
revoke all on reserva_fixture.snapshot_sessao_fixture from public,anon,authenticated;
-- Mantém estado não reconhecido até protocolo de confirmação futuro.
create table reserva_fixture.resultado_barreira_fixture (
 ator uuid primary key references reserva_fixture.ator(id),
 reserva uuid not null references reserva_fixture.reserva(id),
 estado text not null check(estado in ('cancelada','confirmada'))
);
revoke all on reserva_fixture.resultado_barreira_fixture from public,anon,authenticated;
create function reserva_fixture.admitir_snapshot_fixture(p_ator uuid,p_sessao uuid,p_verificador bytea)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare v_epoca bigint;
begin
 if p_ator is null or p_sessao is null or octet_length(p_verificador) is distinct from 32 then return false; end if;
 select geracao into v_epoca from reserva_fixture.ator where id=p_ator for update;
 if not found then return false; end if;
 insert into reserva_fixture.snapshot_sessao_fixture values(p_sessao,p_ator,v_epoca,p_verificador) on conflict do nothing;
 return found;
end $$;
create function reserva_fixture.abrir_snapshot_fixture(p_ator uuid,p_sessao uuid,p_verificador bytea,p_reserva uuid)
returns text language plpgsql security invoker set search_path=pg_catalog as $$
declare v_epoca bigint;
begin
 select geracao into v_epoca from reserva_fixture.ator where id=p_ator for update;
 if not found or not exists(select 1 from reserva_fixture.snapshot_sessao_fixture where ator=p_ator and sessao=p_sessao and epoca=v_epoca and verificador=p_verificador) then return 'negada'; end if;
 if exists(select 1 from reserva_fixture.resultado_barreira_fixture where ator=p_ator) then return 'bloqueada'; end if;
 return reserva_fixture.abrir(p_ator,v_epoca,p_reserva);
end $$;
create function reserva_fixture.barreira_snapshot_fixture(p_ator uuid,p_sessao uuid,p_verificador bytea)
returns text language plpgsql security invoker set search_path=pg_catalog as $$
declare a reserva_fixture.ator; v_estado text; v_linhas bigint;
begin
 select * into a from reserva_fixture.ator where id=p_ator for update;
 if not found or not exists(select 1 from reserva_fixture.snapshot_sessao_fixture where ator=p_ator and sessao=p_sessao and epoca=a.geracao and verificador=p_verificador) then return 'negada'; end if;
 if a.atual is null then
  select estado into v_estado from reserva_fixture.resultado_barreira_fixture where ator=p_ator;
  if not found then v_estado:='ausente_cercada'; end if;
 else
  select estado into v_estado from reserva_fixture.reserva where id=a.atual and ator_id=p_ator and geracao=a.geracao and not fechada for update;
  if not found then raise exception 'ESTADO_INCONSISTENTE'; end if;
  update reserva_fixture.reserva set fechada=true,estado=case when estado='aberta' then 'cancelada' else estado end where id=a.atual returning estado into v_estado;
  if not found then raise exception 'RESERVA_NAO_FECHADA'; end if;
  insert into reserva_fixture.resultado_barreira_fixture(ator,reserva,estado) values(p_ator,a.atual,v_estado);
  get diagnostics v_linhas=row_count;
  if v_linhas<>1 then raise exception using errcode='P0002',message='RESULTADO_NAO_REGISTRADO'; end if;
 end if;
 update reserva_fixture.ator set geracao=geracao+1,atual=null where id=p_ator;
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='BARREIRA_NAO_AVANCADA'; end if;
 return v_estado;
end $$;
revoke all on all functions in schema reserva_fixture from public,anon,authenticated;
