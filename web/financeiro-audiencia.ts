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
  let pedido = 0;
  return {
    /** Resposta síncrona usada pelo filtro de áreas. */
    permitidaPara(sessionId: string): boolean {
      return permitida && sessaoSondada === sessionId;
    },
    /** Dispara a sondagem para esta sessão, uma vez por sessão. Com `renovar`, pergunta de
     * novo na mesma sessão (revalidação com o Financeiro aberto): a audiência atual vale até
     * a resposta chegar, e uma resposta negativa ou uma falha a revogam e avisam. */
    sondar(sessao: { session_id: string; perfil: string }, renovar = false): void {
      const mesma = sessaoSondada === sessao.session_id;
      if (mesma && !renovar) return;
      sessaoSondada = sessao.session_id;
      const minha = ++pedido;
      if (!mesma) permitida = false;
      if (sessao.perfil === 'familia') {
        // Família não tem audiência financeira em nenhuma hipótese (FR-068): não há o que
        // perguntar, e perguntar só geraria um evento de auditoria inútil.
        permitida = false;
        aoMudar();
        return;
      }
      void consultar()
        .then((resposta) => {
          if (pedido !== minha) return;
          permitida = resposta === true;
          aoMudar();
        })
        .catch(() => {
          if (pedido !== minha) return;
          permitida = false;
          aoMudar();
        });
    },
    esquecer(): void {
      pedido += 1;
      sessaoSondada = null;
      permitida = false;
    },
  };
}
