import { relatoTextualSchema } from '../packages/contracts/src/relato-textual.ts';

/** Protótipo isolado: sem armazenamento, envio, autorização ou rota. */
export function montarRelatoTextual(raiz: HTMLElement): () => void {
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const form = elemento('form');
  form.noValidate = true;
  form.append(
    elemento('h2', 'Preparar relato'),
    elemento(
      'p',
      'Demonstração local: use apenas dados fictícios. O relato não será salvo nem enviado e será perdido ao sair.',
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
  const revisar = elemento('button', 'Revisar dados');
  revisar.type = 'submit';
  const revisao = elemento('section');
  form.append(revisar, aviso, revisao);
  form.addEventListener('input', () => {
    aviso.textContent = '';
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
    aviso.textContent = 'Dados prontos para revisão local. Nada foi salvo ou enviado.';
    revisao.append(elemento('h3', 'Revisão'));
    const camposRevisao: [string, string][] = [
      ['Data', resultado.data.dataAcontecimento],
      ['Descrição', resultado.data.descricao],
      ['Categoria', resultado.data.categoria || 'Não informada'],
      ['Contexto', resultado.data.contexto || 'Não informado'],
      ['Ação tomada', resultado.data.acaoTomada || 'Não informada'],
      ['Solicitação de retorno', resultado.data.solicitacaoRetorno ? 'Sim' : 'Não'],
    ];
    for (const [titulo, valor] of camposRevisao) {
      const item = elemento('p');
      item.append(elemento('strong', `${titulo}: `), document.createTextNode(valor));
      revisao.append(item);
    }
  });
  raiz.replaceChildren(form);
  return () => raiz.replaceChildren();
}
