-- O domínio continua obrigatório quando Google é o provedor confirmado.
alter table identidade.configuracao_auth_nativo
  alter column dominio_workspace drop not null,
  add constraint configuracao_auth_google_exige_dominio
    check (not google_unico_oauth_confirmado or dominio_workspace is not null);
