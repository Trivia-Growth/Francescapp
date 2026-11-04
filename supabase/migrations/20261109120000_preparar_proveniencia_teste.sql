-- Nenhum lote é criado e nenhum registro existente é alterado. Após aplicação,
-- novos pacientes exigem configuração privada explícita de lote aberto.
create table operacao.configuracao_lote_teste (
  singleton boolean primary key default true check (singleton),
  lote_teste_id uuid not null references operacao.lote_teste(id) on delete restrict
);
alter table operacao.configuracao_lote_teste enable row level security;
revoke all on operacao.configuracao_lote_teste from public, anon, authenticated, service_role;

-- Somente o proprietário privilegiado configura o lote; entrada do cliente
-- jamais escolhe proveniência. O bloqueio impede encerramento concorrente.
create function operacao.marcar_paciente_teste_preparado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lote uuid;
begin
  if new.lote_teste_id is not null then
    raise exception using errcode = '22023', message = 'LOTE_TESTE_NAO_ACEITO_DO_CLIENTE';
  end if;
  select l.id into lote
    from operacao.configuracao_lote_teste c
    join operacao.lote_teste l on l.id = c.lote_teste_id
    where c.singleton and l.encerrado_em is null
    for share of c, l;
  if lote is null then
    raise exception using errcode = '55000', message = 'LOTE_TESTE_NAO_CONFIGURADO';
  end if;
  new.lote_teste_id := lote;
  return new;
end $$;
revoke all on function operacao.marcar_paciente_teste_preparado() from public, anon, authenticated, service_role;

create trigger paciente_exigir_lote_teste before insert on cadastro.paciente
for each row execute function operacao.marcar_paciente_teste_preparado();
