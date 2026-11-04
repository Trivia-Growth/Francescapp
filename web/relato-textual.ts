import {
  relatoTextualSchema,
  type RelatoTextual,
} from '../packages/contracts/src/relato-textual.ts';

/** Protótipo isolado: sem armazenamento, envio, autorização ou rota. */
export function montarRelatoTextual(
  raiz: HTMLElement,
  salvar?: (relato: RelatoTextual) => Promise<void>,
  bloqueado = false,
): () => void {
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  let salvamentoIncerto = bloqueado;
  const form = elemento('form');
  form.noValidate = true;
  form.append(
    elemento('h2', 'Preparar relato'),
    elemento(
      'p',
      salvar
        ? 'Demonstração local: use apenas dados fictícios. Relatos guardados ficam neste computador e não são enviados para atendimento.'
        : 'Demonstração local: use apenas dados fictícios. O relato não será salvo nem enviado e será perdido ao sair.',
    ),
    elemento('p', 'Esta demonstração não é um canal de atendimento ou emergência.'),
    elemento('p', 'Data e descrição são obrigatórias. Os demais campos são opcionais.'),
  );
  const campo = <T extends HTMLInputElement | HTMLTextAreaElement>(
    rotulo: string,
    controle: T,
  ): T => {
    const label = elemento('label', rotulo);
    label.append(controle);
    form.append(label);
    return controle;
  };
  const data = campo('Data do acontecimento (obrigatória)', elemento('input'));
  data.type = 'date';
  data.required = true;
  const descricao = campo('Descrição (obrigatória)', elemento('textarea'));
  descricao.required = true;
  const categoria = campo('Categoria (opcional)', elemento('input'));
  const contexto = campo('Contexto (opcional)', elemento('textarea'));
  const acao = campo('Ação tomada (opcional)', elemento('textarea'));
  const retorno = elemento('input');
  retorno.type = 'checkbox';
  campo('Solicitar retorno (opcional)', retorno);
  const aviso = elemento('p');
  aviso.setAttribute('role', 'status');
  aviso.setAttribute('aria-live', 'polite');
  if (bloqueado)
    aviso.textContent =
      'Gravação bloqueada para este paciente nesta página após resultado incerto. A recarga não confirma o resultado; confira a lista antes de qualquer nova tentativa.';
  const revisar = elemento('button', 'Revisar dados');
  revisar.type = 'submit';
  const revisao = elemento('section');
  form.append(revisar, aviso, revisao);
  form.addEventListener('input', () => {
    aviso.textContent = salvamentoIncerto
      ? 'Gravação bloqueada para este paciente nesta página após resultado incerto. A recarga não confirma o resultado; confira a lista antes de qualquer nova tentativa.'
      : '';
    revisao.replaceChildren();
  });
  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    revisao.replaceChildren();
    const resultado = relatoTextualSchema.safeParse({
      dataAcontecimento: data.value,
      descricao: descricao.value,
      categoria: categoria.value,
      contexto: contexto.value,
      acaoTomada: acao.value,
      solicitacaoRetorno: retorno.checked,
    });
    if (!resultado.success) {
      aviso.textContent = 'Informe uma data válida e uma descrição para revisar.';
      (!data.value ? data : descricao).focus();
      return;
    }
    aviso.textContent = salvamentoIncerto
      ? 'Gravação bloqueada para este paciente nesta página após resultado incerto. A recarga não confirma o resultado; confira a lista antes de qualquer nova tentativa.'
      : salvar
        ? 'Confira os dados antes de guardar nesta prévia local.'
        : 'Dados prontos para revisão local. Nada foi salvo ou enviado.';
    revisao.append(elemento('h3', 'Revisão'));
    const camposRevisao: [string, string][] = [
      ['Data', resultado.data.dataAcontecimento],
      ['Descrição', resultado.data.descricao],
      ['Categoria', resultado.data.categoria || 'Não informada'],
      ['Contexto', resultado.data.contexto || 'Não informado'],
      ['Ação tomada', resultado.data.acaoTomada || 'Não informada'],
      ['Solicitação de retorno', resultado.data.solicitacaoRetorno ? 'Sim' : 'Não'],
    ];
    if (salvar) {
      const guardar = elemento('button', 'Guardar relato fictício nesta prévia');
      guardar.type = 'button';
      guardar.disabled = salvamentoIncerto;
      guardar.addEventListener('click', async () => {
        const controles = [
          ...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(
            'input, textarea, button',
          ),
        ];
        for (const controle of controles) controle.disabled = true;
        try {
          await salvar(resultado.data);
          form.reset();
          revisao.replaceChildren();
          aviso.textContent = 'Relato fictício guardado neste computador.';
        } catch (erro) {
          salvamentoIncerto = !(erro instanceof Error && ['401', '409'].includes(erro.message));
          aviso.textContent = salvamentoIncerto
            ? 'Não foi possível confirmar o salvamento. Confira a lista e copie seu rascunho. A gravação fica bloqueada para este paciente enquanto esta página estiver aberta; recarregar não confirma o resultado.'
            : 'Não foi possível guardar. Confira a sessão ou a lista atualizada; seu rascunho permanece aqui.';
        } finally {
          for (const controle of controles) controle.disabled = false;
          guardar.disabled = salvamentoIncerto;
        }
      });
      revisao.append(guardar);
    }
    for (const [titulo, valor] of camposRevisao) {
      const item = elemento('p');
      item.append(elemento('strong', `${titulo}: `), document.createTextNode(valor));
      revisao.append(item);
    }
  });
  raiz.replaceChildren(form);
  return () => raiz.replaceChildren();
}
