/** A autorização permanece no servidor. Reconsulta informa somente o estado observado. */
export function montarRevogacaoVinculo(
  raiz: HTMLElement,
  revogar: (
    acessoId: string,
    dados: { versao_esperada: number; motivo: string },
  ) => Promise<unknown>,
  atualizarVinculos: () => Promise<void>,
  acessoPerdido: (erro: unknown) => boolean,
  alteracaoPendente: (pendente: boolean) => void,
): {
  selecionar: (acesso: { id: string; versao: number; nome: string }) => void;
  invalidarSelecao: () => void;
  reconciliar: () => void;
  destruir: () => void;
} {
  let ativa = true;
  let alvo: { id: string; versao: number; nome: string } | undefined;
  let enviando = false;
  let incerto = false;
  let selecaoValida = false;
  const titulo = document.createElement('h3');
  titulo.textContent = 'Revogar acesso';
  const identificacao = document.createElement('p');
  const rotulo = document.createElement('label');
  rotulo.textContent = 'Motivo da revogação';
  const motivo = document.createElement('textarea');
  motivo.required = true;
  motivo.maxLength = 4000;
  rotulo.append(motivo);
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.textContent = 'Revogar acesso';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  raiz.hidden = true;
  raiz.replaceChildren(titulo, identificacao, rotulo, botao, status);
  motivo.addEventListener('input', () => alteracaoPendente(motivo.value.trim().length > 0));
  botao.addEventListener('click', () => {
    const atual = alvo;
    const razao = motivo.value;
    if (!atual || enviando || incerto || !selecaoValida || !razao.trim()) return;
    if (!window.confirm(`Revogar o acesso de ${atual.nome}?`)) return;
    enviando = true;
    botao.disabled = true;
    status.textContent = 'Enviando revogação…';
    let perdeuAcesso = false;
    let concluida = false;
    void (async () => {
      try {
        await revogar(atual.id, { versao_esperada: atual.versao, motivo: razao });
        if (!ativa) return;
        if (motivo.value === razao) {
          motivo.value = '';
          alteracaoPendente(false);
        }
        concluida = true;
        alvo = undefined;
        status.textContent = 'Revogação confirmada. Consultando estado atual.';
      } catch (erro) {
        if (!ativa) return;
        perdeuAcesso = acessoPerdido(erro);
        if (perdeuAcesso) return;
        incerto = true;
        status.textContent =
          'Resultado desconhecido. O pedido ainda pode ser concluído. Consulte o estado atual antes de agir.';
      } finally {
        if (ativa && !perdeuAcesso) {
          try {
            await atualizarVinculos();
          } catch {
            if (ativa)
              status.textContent +=
                ' Não foi possível consultar o estado atual; tente atualizar a lista.';
          }
          if (ativa) {
            enviando = false;
            botao.disabled = concluida || incerto || !selecaoValida;
          }
        }
      }
    })();
  });
  return {
    selecionar(acesso) {
      if (enviando || incerto) return;
      if (
        alvo &&
        alvo.id !== acesso.id &&
        motivo.value.trim() &&
        !window.confirm('Descartar motivo de revogação digitado?')
      )
        return;
      if (!alvo || alvo.id !== acesso.id) {
        motivo.value = '';
        alteracaoPendente(false);
      }
      alvo = acesso;
      selecaoValida = true;
      botao.disabled = false;
      identificacao.textContent = acesso.nome;
      status.textContent = '';
      raiz.hidden = false;
      motivo.focus();
    },
    reconciliar() {
      incerto = false;
      selecaoValida = false;
      botao.disabled = true;
      status.textContent = 'Tudo conferido. Selecione o vínculo que deseja alterar.';
    },
    invalidarSelecao() {
      selecaoValida = false;
      botao.disabled = true;
      if (alvo && !enviando && !incerto)
        status.textContent =
          'A lista foi atualizada. Selecione o vínculo novamente para confirmar a versão atual.';
    },
    destruir() {
      ativa = false;
      raiz.replaceChildren();
    },
  };
}
