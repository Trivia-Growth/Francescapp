-- FR-010. Catálogo de configuração da transcrição, no banco e editável pela tela de
-- administração (diretriz do solicitante de 11/11/2026).
--
-- O que é variável e entra aqui: ligar/desligar o serviço, o modelo usado e o teto de
-- duração da gravação.
--
-- O que NÃO entra aqui, e por quê:
-- 1. A CHAVE DE API do OpenRouter fica no Supabase Vault
--    (`20261119100000_vault_segredo_integracao.sql`). Segredo em tabela de configuração
--    seria legível por quem administra a tela e apareceria em qualquer leitura da linha.
-- 2. O ENDEREÇO do provedor é fixo no código. Configurar para onde a chave é enviada
--    transformaria a tela de administração numa alavanca para extrair a credencial: bastaria
--    apontar o endereço para outro servidor. O provedor foi decidido pelo solicitante
--    (OpenRouter); o que ele pediu para escolher na plataforma é o MODELO.
insert into identidade.configuracao_sistema (id, chave, valor, tipo, rotulo, descricao, exposicao, opcoes)
values
  (
    gen_random_uuid(),
    'ffcm.transcricao.ativa',
    'false'::jsonb,
    'booleano',
    'Transcrição de áudio',
    'Permite gravar um áudio e receber um rascunho de texto para revisar. Começa desligada: depende de a chave do provedor estar cadastrada no cofre. Não altera quem tem permissão.',
    'servidor',
    null
  ),
  (
    gen_random_uuid(),
    'ffcm.transcricao.modelo',
    '"openai/whisper-large-v3"'::jsonb,
    'texto',
    'Modelo de transcrição',
    'Modelo usado para transcrever. Whisper large v3 é o mais fiel ao português falado; as opções servidas pela Groq respondem mais rápido e custam menos. Trocar o modelo vale para as próximas gravações, não para as já transcritas.',
    'servidor',
    jsonb_build_array(
      'openai/whisper-large-v3',
      'openai/whisper-large-v3-turbo',
      'groq/whisper-large-v3',
      'groq/whisper-large-v3-turbo',
      'groq/distil-whisper-large-v3-en'
    )
  ),
  (
    gen_random_uuid(),
    'ffcm.transcricao.duracao_maxima_segundos',
    '90'::jsonb,
    'numero',
    'Duração máxima da gravação (segundos)',
    'Teto de cada gravação. O requisito é explícito em não transcrever sessões completas por padrão: este campo existe para manter o áudio no tamanho de um recado, não de um atendimento. O sistema nunca aceita mais que 300 segundos, qualquer que seja o valor aqui.',
    'servidor',
    null
  );
