# Modelo de ameaças — cadastro de segredos

## Escopo e suposições

UI administrativa, BFF `/api/admin/segredos-integracoes`, RPC atestada, metadados e escrita Vault. Sem leitura pela UI, dados clínicos, testes de provedor ou operações remotas. Solicitante ausente conforme briefing; assume-se sessão BFF cookie existente e catálogo fechado. Cadastro não valida credencial externa. Esta suposição conserva indisponibilidade honesta.

## Ativos e fronteiras

- Credenciais: navegador envia por POST ao BFF; BFF envia transporte assinado para RPC autenticada; função grava Vault. UI não recebe valor de volta.
- Identidade/autorização: cookies passam pelo Auth nativo, `consultar_sessao_nativa` valida sessão, composição exige Administrador. SQL repete verificação Google/técnica, concessão/sessão/usuário e atestado.
- Versões e auditoria: catálogo e histórico em `identidade`; eventos registram ação/ator/objeto/resultado/request ID sem valor. Históricos Vault mantêm UUID, nome anterior recebe sufixo.

## Ameaças priorizadas

| Ameaça | Probabilidade/impacto | Controle implementado e prova |
| --- | --- | --- |
| Profissional/Família ou sessão revogada substitui credencial | Média/alto | Composição admin-only; SQL reautoriza com locks e atestado. Unitário servidor + SQL local perfis/revogação/direto passaram. |
| Credencial retorna em tela/resposta/log/auditoria | Média/alto | Contrato strict somente metadados; SQL nunca seleciona `secret`/`decrypted_secret`; erros públicos fixos. Teste saída contaminada negada, UI limpa campo e SQL auditoria sem valor. Log real do ambiente não exercitado. |
| CSRF altera integração | Média/alto | Origem exata no POST, cookie e sessão/fluxo existentes; teste origem incorreta antes Vault passou. |
| Repetição/concorrência apaga histórico ou aplica duas vezes | Média/alto | Versão esperada, lock de catálogo, recibo HMAC, transação única e renomeação preservando UUID. SQL replay/conflito/preservação passou. |
| Corpo excessivo ocupa memória/conexão | Média/médio | Entrada limita 65.536 bytes/15s e valor 48.000 caracteres; SQL valida comprimento. Teste dedicado do leitor HTTP pendente. |

## Limitações e próximos gates

Vault no PostgreSQL descartável é adapter sem criptografia. Não comprova extensão real nem permissões remotas; ativação deve testar migration e criptografia nativa. Auth foi simulado no teste de composição; camada Auth existente exige gate integrado. Revisão independente e logs reais continuam pendentes.

Referências primárias consultadas: [Vault](https://supabase.com/docs/guides/database/vault) e [implementação Vault 0.3.0](https://github.com/supabase/vault/blob/main/sql/supabase_vault--0.3.0.sql). Nesta versão, AAD depende do UUID, não do nome; renomear somente nome preserva cifra. Confirmar versão instalada na ativação. `vault.create_secret` é SECURITY DEFINER; owner novo recebe EXECUTE e somente SELECT id/name e UPDATE name em `vault.secrets`, sem SELECT secret. UI/HTTP nunca recebem permissão Vault.
