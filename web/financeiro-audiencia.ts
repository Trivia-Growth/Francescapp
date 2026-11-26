/** Cache por sessão da sondagem de audiência financeira.
 *
 * Existe por um motivo de apresentação, não de autorização: a marca financeira mora na
 * concessão de equipe e NÃO entra no payload de sessão (ver
 * `20261126200000_financeiro_concessao.sql`), então a interface não tem como saber, de
 * forma síncrona, se deve mostrar a área financeira. A sondagem pergunta ao servidor.
 *
 * Falha fechado em todos os caminhos: valor inicial `false`, erro mantém `false`, troca de
 * sessão zera, e perfil `familia` nem chega a perguntar. Esconder a área não autoriza nada —
 * cada rota financeira continua sendo autorizada no servidor e no banco, e um profissional
 * sem concessão que force o caminho recebe `sem_permissao`. */
export function criarAudienciaFinanceira(consultar: () => Promise<boolean>, aoMudar: () => void) {
  let sessaoSondada: string | null = null;
  let permitida = false;
  return {
    /** Resposta síncrona usada pelo filtro de áreas. */
    permitidaPara(sessionId: string): boolean {
      return permitida && sessaoSondada === sessionId;
    },
    /** Dispara a sondagem para esta sessão, uma vez por sessão. */
    sondar(sessao: { session_id: string; perfil: string }): void {
      if (sessaoSondada === sessao.session_id) return;
      sessaoSondada = sessao.session_id;
      permitida = false;
      if (sessao.perfil === 'familia') {
        // Família não tem audiência financeira em nenhuma hipótese (FR-068): não há o que
        // perguntar, e perguntar só geraria um evento de auditoria inútil.
        aoMudar();
        return;
      }
      void consultar()
        .then((resposta) => {
          if (sessaoSondada !== sessao.session_id) return;
          permitida = resposta === true;
          aoMudar();
        })
        .catch(() => {
          if (sessaoSondada !== sessao.session_id) return;
          permitida = false;
          aoMudar();
        });
    },
    esquecer(): void {
      sessaoSondada = null;
      permitida = false;
    },
  };
}
