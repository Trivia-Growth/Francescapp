-- FR-010: transcrever áudio em português para rascunho editável, permitir ouvir o original
-- e revisar texto e audiência antes de publicar.
--
-- Modelo de dados, e por que não é uma tabela de versões como as outras fatias:
-- este registro TEM ciclo de vida. O áudio nasce ouvível, a revisão humana é confirmada
-- depois, e só então a exclusão do original é solicitada — com estado verificável. Uma
-- tabela imutável não representaria "exclusão pendente com erro" sem inventar uma versão
-- nova para cada tentativa de apagar. Por isso a linha é mutável em colunas nomeadas, e um
-- trigger protege tudo o que não pode mudar.
--
-- O que NUNCA muda depois de criado: paciente, autor, áudio original (só pode ser apagado,
-- nunca substituído), transcrição automática, mime, duração, modelo. O que muda uma vez e
-- não volta: confirmação da revisão e exclusão confirmada.
--
-- Conteúdo: o áudio e os dois textos viajam cifrados no envelope AEAD. Nenhuma coluna
-- legível carrega fala, transcrição ou texto revisado.

-- Partes do áudio: a cifra compartilhada limita cada texto cifrado a 32 KiB, então o áudio
-- é cifrado em pedaços numerados. A validação precisa percorrer o array, e CHECK não aceita
-- subconsulta — daí a função IMMUTABLE.
create function cadastro.envelope_audio_valido(p_partes jsonb) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select p_partes is null or (
    jsonb_typeof(p_partes) = 'array'
    and jsonb_array_length(p_partes) between 1 and 64
    and not exists (
      select 1 from pg_catalog.jsonb_array_elements(p_partes) parte
      where not (
        jsonb_typeof(parte.value) = 'object'
        and parte.value - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
        and parte.value -> 'formato' = '1'::jsonb
        and jsonb_typeof(parte.value -> 'key_id') = 'string'
        and jsonb_typeof(parte.value -> 'nonce') = 'string'
        and jsonb_typeof(parte.value -> 'ciphertext') = 'string'
        and jsonb_typeof(parte.value -> 'tag') = 'string'
        and nullif(parte.value ->> 'key_id', '') is not null
        and nullif(parte.value ->> 'nonce', '') is not null
        and nullif(parte.value ->> 'ciphertext', '') is not null
        and nullif(parte.value ->> 'tag', '') is not null
      )
    )
  );
$$;
revoke all on function cadastro.envelope_audio_valido(jsonb) from public, anon, authenticated, service_role;

create function cadastro.envelope_texto_valido(p_campo jsonb) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select p_campo is null or (
    jsonb_typeof(p_campo) = 'object'
    and p_campo - array['formato', 'key_id', 'nonce', 'ciphertext', 'tag'] = '{}'::jsonb
    and p_campo -> 'formato' = '1'::jsonb
    and jsonb_typeof(p_campo -> 'key_id') = 'string'
    and jsonb_typeof(p_campo -> 'nonce') = 'string'
    and jsonb_typeof(p_campo -> 'ciphertext') = 'string'
    and jsonb_typeof(p_campo -> 'tag') = 'string'
    and nullif(p_campo ->> 'key_id', '') is not null
    and nullif(p_campo ->> 'nonce', '') is not null
    and nullif(p_campo ->> 'ciphertext', '') is not null
    and nullif(p_campo ->> 'tag', '') is not null
  );
$$;
revoke all on function cadastro.envelope_texto_valido(jsonb) from public, anon, authenticated, service_role;

create table cadastro.audio_transcricao (
  id uuid primary key,
  paciente_id uuid not null references cadastro.paciente (id) on delete no action,
  -- Partes cifradas do áudio original, na ordem. `null` significa apagado, e a coluna de
  -- estado diz se isso foi confirmado — ausência de áudio nunca é, sozinha, prova de
  -- descarte concluído.
  audio_cifrado jsonb,
  mime text not null check (mime in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav')),
  duracao_segundos integer not null check (duracao_segundos between 1 and 300),
  -- Transcrição automática. Não é revisão humana e nunca é apagada: é a evidência do que o
  -- provedor devolveu.
  transcricao_cifrada jsonb not null,
  -- Identificador do modelo que produziu a transcrição, lido da configuração no momento da
  -- chamada. Parâmetro operacional, não conteúdo clínico; por isso fica legível.
  modelo text not null check (char_length(btrim(modelo)) between 1 and 160),
  -- Texto como o autor o deixou ao confirmar a revisão.
  texto_revisado_cifrado jsonb,
  revisao_confirmada_em timestamptz,
  exclusao_estado text not null default 'nao_solicitada'
    check (exclusao_estado in ('nao_solicitada', 'pendente', 'confirmada', 'falha')),
  exclusao_em timestamptz,
  exclusao_tentativas integer not null default 0 check (exclusao_tentativas between 0 and 1000),
  -- Prazo do áudio abandonado: 30 dias com aviso (delta confirmado em 16/10/2026).
  expira_em timestamptz not null,
  criado_por_usuario_id uuid not null references public.usuario (id) on delete no action,
  criado_em timestamptz not null default clock_timestamp(),
  constraint audio_transcricao_envelope_audio_chk check (cadastro.envelope_audio_valido(audio_cifrado) is true),
  constraint audio_transcricao_envelope_transcricao_chk check (cadastro.envelope_texto_valido(transcricao_cifrada) is true),
  constraint audio_transcricao_envelope_revisado_chk check (cadastro.envelope_texto_valido(texto_revisado_cifrado) is true),
  -- Revisão confirmada e texto revisado andam juntos: não existe revisão sem texto, nem
  -- texto de revisão sem o ato humano que o confirmou.
  constraint audio_transcricao_revisao_chk check (
    ((revisao_confirmada_em is null) = (texto_revisado_cifrado is null)) is true
  ),
  -- Exclusão confirmada exige áudio ausente e instante registrado; enquanto não foi
  -- confirmada, o áudio tem de estar lá. `falha` e `pendente` preservam o original.
  constraint audio_transcricao_exclusao_chk check ((
    case exclusao_estado
      when 'confirmada' then audio_cifrado is null and exclusao_em is not null
      else audio_cifrado is not null and exclusao_em is null
    end
  ) is true),
  -- Só se pede exclusão depois da revisão confirmada. Gerar ou salvar rascunho não dispara
  -- exclusão por revisão.
  constraint audio_transcricao_exclusao_depois_revisao_chk check ((
    exclusao_estado = 'nao_solicitada' or revisao_confirmada_em is not null
  ) is true)
);

create index audio_transcricao_paciente_idx on cadastro.audio_transcricao (paciente_id, criado_em desc);
create index audio_transcricao_autor_idx on cadastro.audio_transcricao (criado_por_usuario_id);
-- Varredura do prazo de 30 dias: só interessa o que ainda tem áudio guardado.
create index audio_transcricao_expiracao_idx on cadastro.audio_transcricao (expira_em)
  where audio_cifrado is not null;

alter table cadastro.audio_transcricao enable row level security;
revoke all on cadastro.audio_transcricao from public, anon, authenticated, service_role;

-- Transições permitidas, no banco e não só na função: o resto é recusado mesmo que a
-- operação tenha defeito. DELETE nunca é permitido — apagar o áudio não apaga o registro,
-- porque a exclusão SHALL preservar texto revisado, autoria e histórico.
create function cadastro.proteger_audio_transcricao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Registro de transcrição não é apagado; apenas o áudio original é excluído';
  end if;
  if new.id is distinct from old.id
    or new.paciente_id is distinct from old.paciente_id
    or new.mime is distinct from old.mime
    or new.duracao_segundos is distinct from old.duracao_segundos
    or new.transcricao_cifrada is distinct from old.transcricao_cifrada
    or new.modelo is distinct from old.modelo
    or new.criado_por_usuario_id is distinct from old.criado_por_usuario_id
    or new.criado_em is distinct from old.criado_em
    or new.expira_em is distinct from old.expira_em then
    raise exception 'Campos imutáveis da transcrição não podem ser alterados';
  end if;
  -- O áudio só pode desaparecer, nunca ser substituído por outro nem ressuscitar.
  if old.audio_cifrado is null and new.audio_cifrado is not null then
    raise exception 'Áudio excluído não retorna';
  end if;
  if old.audio_cifrado is not null and new.audio_cifrado is not null
    and new.audio_cifrado is distinct from old.audio_cifrado then
    raise exception 'Áudio original não pode ser substituído';
  end if;
  -- A revisão é confirmada uma vez; o texto revisado fica como a evidência dela.
  if old.revisao_confirmada_em is not null
    and (new.revisao_confirmada_em is distinct from old.revisao_confirmada_em
      or new.texto_revisado_cifrado is distinct from old.texto_revisado_cifrado) then
    raise exception 'Revisão confirmada não é reescrita';
  end if;
  -- Exclusão confirmada é terminal: repetir é seguro, mas não muda o estado nem o instante.
  if old.exclusao_estado = 'confirmada'
    and (new.exclusao_estado is distinct from 'confirmada'
      or new.exclusao_em is distinct from old.exclusao_em) then
    raise exception 'Exclusão confirmada não é revertida';
  end if;
  return new;
end $$;
revoke all on function cadastro.proteger_audio_transcricao() from public, anon, authenticated, service_role;
create trigger audio_transcricao_protegida
  before update or delete on cadastro.audio_transcricao
  for each row execute function cadastro.proteger_audio_transcricao();
