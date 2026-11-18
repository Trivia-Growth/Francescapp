-- Catálogo público STT conferido em 18/11/2026, sem chamada de transcrição.
-- Somente opções publicadas; não substitui modelo escolhido, flags ou credenciais.
do $$
declare
 atual identidade.configuracao_sistema%rowtype;
 originais constant jsonb := '["openai/whisper-large-v3","openai/whisper-large-v3-turbo","groq/whisper-large-v3","groq/whisper-large-v3-turbo","groq/distil-whisper-large-v3-en"]'::jsonb;
 publicadas constant jsonb := '["openai/whisper-large-v3","openai/whisper-large-v3-turbo"]'::jsonb;
begin
 select * into atual from identidade.configuracao_sistema
  where chave='ffcm.transcricao.modelo' for update;
 if not found or atual.tipo is distinct from 'texto'
   or atual.opcoes is distinct from originais then
  raise exception using errcode='P0001', message='CATALOGO_TRANSCRICAO_DIVERGENTE',
   hint='Confira o catálogo de ffcm.transcricao.modelo contra a migration 20261119140000 antes de reaplicar. Nenhuma opção ou escolha foi alterada.';
 end if;
 if not (publicadas @> jsonb_build_array(atual.valor)) then
  raise exception using errcode='P0001', message='MODELO_TRANSCRICAO_NAO_PUBLICADO',
   hint='Selecione openai/whisper-large-v3 ou openai/whisper-large-v3-turbo em Configuração do sistema antes de reaplicar. O modelo atual foi preservado.';
 end if;
 update identidade.configuracao_sistema set opcoes=publicadas where id=atual.id;
end $$;
