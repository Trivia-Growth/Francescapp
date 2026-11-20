begin;
-- Corrige a exposição de três interruptores que o servidor nunca conseguia ler.
--
-- `servicoAtivo` lê a configuração por um papel cuja policy filtra `exposicao = 'servidor'`
-- (`20261117420000`), e `identidade.ler_configuracao_sistema_publica()` faz o mesmo filtro.
-- Uma chave semeada como `administracao` aparece na tela de Administração, aceita ser
-- alternada, grava o valor novo — e **nunca chega ao servidor**. O interruptor mente.
--
-- Três estavam assim, contra 39 corretas:
--   `ffcm.acessos.ativo`      — semeada em 20261125150000
--   `ffcm.financeiro.ativo`   — semeada em 20261127300000 (hoje)
--   `ffcm.avisos.ativos`      — semeada em 20261127300000 (hoje)
--
-- As duas últimas são erro meu, do mesmo dia. A primeira é anterior, e era a mais grave:
-- é a tela por onde se concede acesso de equipe.
--
-- `exposicao` não é controle de autorização — a policy do leitor do servidor é. Mudar para
-- `servidor` faz a chave ser lida; a autorização de cada rota continua exigindo sessão,
-- atestado e perfil no banco, sem alteração.

update identidade.configuracao_sistema
   set exposicao = 'servidor', versao = versao + 1, atualizado_em = now()
 where chave in ('ffcm.acessos.ativo', 'ffcm.financeiro.ativo', 'ffcm.avisos.ativos')
   and exposicao <> 'servidor';

do $$
declare n integer;
begin
  select count(*) into n from identidade.configuracao_sistema
   where tipo = 'booleano' and exposicao <> 'servidor';
  if n > 0 then
    raise exception 'INTERRUPTOR_SEM_EXPOSICAO_SERVIDOR: % restantes', n;
  end if;
end $$;

commit;
