import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';
import type { ServicoDocumentoPaciente } from './servico-documento-paciente-http.ts';

export type CorpoEditor<T> = {
  /** Campos do formulário, já montados a partir do conteúdo carregado. */
  campos: HTMLElement;
  /** Lê o formulário. Devolver `null` cancela o envio e escreve o aviso. */
  coletar(): { conteudo: unknown } | { aviso: string; foco?: HTMLElement };
  /** Chamado quando o editor volta a aceitar edição após uma falha. */
  liberar(): void;
  /** Chamado quando o envio começa, para impedir edição concorrente. */
  bloquear(): void;
  vazio: boolean;
  conteudo: T;
};

/** Editor de documento versionado por paciente, compartilhado por FR-005 e FR-002.
 * Concentra carregamento, conflito de versão, idempotência e salvamento incerto
 * para que as duas telas tratem esses estados exatamente do mesmo jeito. */
export function montarEditorDocumentoPaciente<T>(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoDocumentoPaciente<T>,
  acessoPerdido: (erro: unknown) => void,
  textos: {
    titulo: string;
    carregando: string;
    salvar: string;
    salvando: string;
    salvo: string;
    vazio: string;
    conflito: string;
  },
  construir: (conteudo: T | null, aoAlterar: () => void) => CorpoEditor<T>,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let ativa = true;
  let versao = 0;
  let conflitoVersao = false;
  let pendente: { conteudo: unknown; chave: string } | null = null;
  const descartarAcesso = (erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    pendente = null;
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const status = elemento('p', textos.carregando);
  status.setAttribute('role', 'status');
  raiz.replaceChildren(status);

  const desenhar = (resultado: { versao: number; conteudo: T } | null) => {
    if (!ativa) return;
    versao = resultado?.versao ?? 0;
    const form = elemento('form');
    const aviso = elemento('p');
    aviso.setAttribute('role', 'status');
    const salvar = elemento('button', textos.salvar);
    salvar.type = 'submit';
    const retry = elemento('button', 'Tentar confirmar salvamento');
    retry.type = 'button';
    retry.hidden = true;
    const corpo = construir(resultado?.conteudo ?? null, () => alteracaoPendente(true));
    form.append(elemento('h2', textos.titulo));
    if (corpo.vazio) form.append(elemento('p', textos.vazio));
    form.append(corpo.campos, aviso, salvar, retry);

    const enviar = async () => {
      if (!pendente) return;
      salvar.disabled = retry.disabled = true;
      aviso.textContent = textos.salvando;
      try {
        const salvo = await servico.salvar(pacienteId, versao, pendente.conteudo, pendente.chave);
        if (!ativa) return;
        pendente = null;
        alteracaoPendente(false);
        desenhar(salvo);
        const mensagem = raiz.querySelector('[role="status"]');
        if (mensagem) mensagem.textContent = textos.salvo;
      } catch (erro) {
        if (!ativa || descartarAcesso(erro)) return;
        if (resultadoIncerto(erro)) {
          aviso.textContent =
            'Não foi possível confirmar o salvamento. Tente confirmar antes de editar novamente.';
          retry.hidden = false;
          retry.disabled = false;
        } else {
          pendente = null;
          corpo.liberar();
          conflitoVersao = erro instanceof FalhaApi && erro.codigo === 'conflito_versao';
          salvar.disabled = conflitoVersao;
          retry.hidden = true;
          aviso.textContent = conflitoVersao ? textos.conflito : mensagemFalha(erro);
        }
      }
    };

    form.addEventListener('input', () => alteracaoPendente(true));
    form.addEventListener('change', () => alteracaoPendente(true));
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      if (pendente || conflitoVersao) return;
      const coletado = corpo.coletar();
      if ('aviso' in coletado) {
        aviso.textContent = coletado.aviso;
        coletado.foco?.focus();
        return;
      }
      pendente = { conteudo: coletado.conteudo, chave: crypto.randomUUID() };
      alteracaoPendente(true);
      corpo.bloquear();
      void enviar();
    });
    retry.addEventListener('click', () => {
      void enviar();
    });
    raiz.replaceChildren(form);
  };

  const consultar = () => {
    status.textContent = textos.carregando;
    raiz.replaceChildren(status);
    void servico
      .consultar(pacienteId)
      .then(desenhar)
      .catch((erro: unknown) => {
        if (!ativa || descartarAcesso(erro)) return;
        status.textContent = mensagemFalha(erro);
        const tentarNovamente = elemento('button', 'Tentar novamente');
        tentarNovamente.type = 'button';
        tentarNovamente.addEventListener('click', consultar);
        raiz.append(tentarNovamente);
      });
  };
  consultar();
  return () => {
    ativa = false;
    pendente = null;
    raiz.replaceChildren();
  };
}
