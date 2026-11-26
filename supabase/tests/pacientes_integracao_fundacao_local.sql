\set ON_ERROR_STOP on
-- Fundação pro teste de integração HTTP de pacientes (netlify/functions/_shared/pacientes-integracao-local.test.ts),
-- atualizada pra incluir o contrato de "caso novo atômico" (Entrega 2B, 08/11/2026) sem tocar na cadeia
-- compartilhada antiga (cadeia_migrations_local.sql, usada por outros 10+ testes). Só migrations puras
-- (sem fixture de identidade própria) pra não colidir com os inserts que o teste TS faz em runtime.
\ir cadeia_migrations_local.sql
\ir ../migrations/20261109100000_editar_paciente_privado.sql
\ir ../migrations/20261111100000_criar_contato_privado.sql
\ir ../migrations/20261111110000_contato_wrapper_privado.sql
\ir ../migrations/20261111120000_contato_owner_privado.sql
\ir ../migrations/20261111200000_barreira_criacao_contato_privada.sql
\ir ../migrations/20261111210000_barreira_contato_composicao_privada.sql
\ir ../migrations/20261111230000_contato_barreira_owner_privado.sql
\ir ../migrations/20261109110000_barreira_edicao_paciente_privada.sql
\ir ../migrations/20261109130000_edicao_paciente_composicao.sql
\ir ../migrations/20261110200000_edicao_paciente_wrappers_privados.sql
\ir ../migrations/20261110210000_consultar_paciente_edicao_privado.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261112120000_corrigir_reserva_barreira_contato.sql
\ir ../migrations/20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql
\ir ../migrations/20261113100000_acompanhamento_caso.sql
\ir ../migrations/20261113110000_situacao_na_lista.sql
\ir ../migrations/20261113120000_criar_caso_atomico.sql
\ir cofre_nativo_integracao_local.sql
