-- FR-069 / design D5: comprovante da despesa no repositório privado do Supabase, com política
-- ligada à CONCESSÃO FINANCEIRA — não à autorização do caso.
--
-- O molde é o de 20261125230000_turno_anexos.sql, com uma diferença deliberada: lá a função de
-- autorização consulta `cadastro.acesso_paciente`, porque anexo de ocorrência é conteúdo do
-- caso. Aqui ela não consulta, e não pode: o papel dono não tem privilégio nessa tabela. Quem
-- cuida do caso não lê o comprovante, e quem tem audiência financeira lê o comprovante de
-- qualquer caso.
--
-- Entrega por fluxo autorizado a cada leitura: a política é avaliada em toda leitura, e nenhuma
-- URL pública ou assinada de longa duração é emitida ou persistida. Revogar a concessão nega a
-- leitura seguinte, sem precisar invalidar nada que já tenha sido entregue.
--
-- Formato e limite (Open Question do design.md, decididos aqui): JPEG, PNG, WebP e PDF, até
-- 5 MiB. PDF entra porque comprovante fiscal de compra chega em PDF com frequência; o teto é o
-- do balde, e a mesma regra está repetida no CHECK da despesa para que uma divergência futura
-- entre balde e tabela não passe despercebida.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values('financeiro-comprovantes', 'financeiro-comprovantes', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

select set_config('ffcmapp.financeiro_comprovante_migrador', current_user, false);
grant ffcmapp_financeiro_owner to current_user with inherit false, set true;
grant create on schema operacao to ffcmapp_financeiro_owner;
grant usage on schema storage, identidade to ffcmapp_financeiro_owner;
grant select (id, bucket_id, name, metadata) on storage.objects to ffcmapp_financeiro_owner;
create policy financeiro_owner_objeto on storage.objects for select to ffcmapp_financeiro_owner using (bucket_id = 'financeiro-comprovantes');

create function operacao.objeto_comprovante_autorizado(p_bucket text, p_nome text, p_escrita boolean) returns boolean
language plpgsql security definer set search_path = '' set row_security = on as $$
declare
  ator uuid := auth_privado.uid(); sessao uuid; lancamento financeiro.despesa_lancamento;
  permitido boolean := false;
begin
  if p_bucket is distinct from 'financeiro-comprovantes' or p_nome is null or ator is null then
    return false;
  end if;
  begin sessao := (auth_privado.jwt()->>'session_id')::uuid;
  exception when invalid_text_representation then return false; end;
  -- Audiência financeira própria. Nenhuma consulta a vínculo de caso (design D1/D5).
  if operacao.financeiro_audiencia_privada(ator, sessao) then
    select * into lancamento from financeiro.despesa_lancamento d where d.comprovante_objeto_nome = p_nome;
    if found then
      if p_escrita then
        -- Só quem lançou envia os bytes, e só enquanto o objeto ainda não existe:
        -- os bytes do comprovante são imutáveis.
        permitido := lancamento.autor_usuario_id = ator
          and not exists(select 1 from storage.objects o where o.bucket_id = p_bucket and o.name = p_nome);
      else
        permitido := true;
      end if;
    end if;
  end if;
  insert into auditoria.evento(id, ator_usuario_id, acao, tipo_objeto, objeto_id, resultado, request_id)
    values(gen_random_uuid(), ator,
      case when p_escrita then 'storage.enviar_comprovante_despesa' else 'storage.consultar_comprovante_despesa' end,
      'despesa', lancamento.despesa_id,
      case when permitido then 'permitido' else 'negado' end, gen_random_uuid());
  if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
  return permitido;
end $$;
alter function operacao.objeto_comprovante_autorizado(text, text, boolean) owner to ffcmapp_financeiro_owner;
do $acl$ declare migrador text := current_setting('ffcmapp.financeiro_comprovante_migrador'); begin
  perform set_config('role', 'ffcmapp_financeiro_owner', true);
  revoke all on function operacao.objeto_comprovante_autorizado(text, text, boolean) from public, anon, authenticated, service_role;
  grant execute on function operacao.objeto_comprovante_autorizado(text, text, boolean) to authenticated;
  perform set_config('role', migrador, true);
end $acl$;

create policy financeiro_comprovante_inserir on storage.objects for insert to authenticated
  with check (bucket_id = 'financeiro-comprovantes' and operacao.objeto_comprovante_autorizado(bucket_id, name, true));
create policy financeiro_comprovante_ler on storage.objects for select to authenticated
  using (bucket_id = 'financeiro-comprovantes' and operacao.objeto_comprovante_autorizado(bucket_id, name, false));
-- Política permissiva preexistente não pode alargar este balde: a guarda restritiva compõe
-- com qualquer política futura e deixa os demais baldes intactos.
create policy financeiro_comprovante_guarda on storage.objects as restrictive to authenticated
  using (bucket_id <> 'financeiro-comprovantes' or operacao.objeto_comprovante_autorizado(bucket_id, name, false))
  with check (bucket_id <> 'financeiro-comprovantes' or operacao.objeto_comprovante_autorizado(bucket_id, name, true));
create policy financeiro_comprovante_negar_update on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'financeiro-comprovantes') with check (bucket_id <> 'financeiro-comprovantes');
create policy financeiro_comprovante_negar_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'financeiro-comprovantes');

select set_config('role', current_setting('ffcmapp.financeiro_comprovante_migrador'), false);
revoke create on schema operacao from ffcmapp_financeiro_owner;
revoke ffcmapp_financeiro_owner from current_user;
