import type { RegraAtendimento } from '../packages/contracts/src/regras-atendimento.ts';
import type { ServicoRegrasAtendimento } from './servico-regras-atendimento-http.ts';

const formatadorData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeZone: 'America/Sao_Paulo',
});

/** Ordem em que as regras aparecem. "Onde pedir ajuda" vem primeiro de propósito: FR-041 diz que
 * a pessoa deve encontrar onde pedir ajuda "sem precisar ler termos extensos". Chave que não
 * estiver nesta lista aparece depois, em ordem alfabética — o catálogo pode crescer por migration
 * sem que esta tela precise mudar. */
const ORDEM = [
  'ffcm.regras.canais',
  'ffcm.regras.funcionamento',
  'ffcm.regras.periodos',
  'ffcm.regras.diario',
];

function ordenar(itens: readonly RegraAtendimento[]): RegraAtendimento[] {
  return [...itens].sort((a, b) => {
    const posicaoA = ORDEM.indexOf(a.chave);
    const posicaoB = ORDEM.indexOf(b.chave);
    if (posicaoA !== posicaoB)
      return (posicaoA < 0 ? ORDEM.length : posicaoA) - (posicaoB < 0 ? ORDEM.length : posicaoB);
    return a.chave.localeCompare(b.chave, 'pt-BR');
  });
}

/** Regras de funcionamento, períodos, canais de retorno e uso do diário (FR-041).
 *
 * Somente leitura. Quem edita o texto é Administrador, na tela de configuração do sistema —
 * aqui não há formulário de propósito, para que a tela sirva igual a profissional, paciente e
 * familiar sem precisar de um caminho diferente por perfil. */
export function montarRegrasAtendimento(
  raiz: HTMLElement,
  servico: ServicoRegrasAtendimento,
): () => void {
  let ativa = true;
  const secao = document.createElement('section');
  secao.className = 'regras-atendimento';
  const titulo = document.createElement('h2');
  titulo.textContent = 'Como funciona e onde pedir ajuda';
  const status = document.createElement('p');
  status.className = 'regras-atendimento__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const lista = document.createElement('div');
  lista.className = 'regras-atendimento__lista';
  const recarregar = document.createElement('button');
  recarregar.type = 'button';
  recarregar.className = 'button-secondary';
  recarregar.textContent = 'Recarregar';
  secao.append(titulo, status, lista, recarregar);
  raiz.replaceChildren(secao);

  const desenhar = (itens: readonly RegraAtendimento[]) => {
    lista.replaceChildren();
    for (const item of ordenar(itens)) {
      const bloco = document.createElement('article');
      bloco.className = 'regras-atendimento__item';
      const subtitulo = document.createElement('h3');
      subtitulo.textContent = item.rotulo;
      const texto = document.createElement('p');
      texto.className = 'regras-atendimento__texto';
      texto.textContent = item.valor;
      const quando = new Date(item.atualizado_em);
      bloco.append(subtitulo, texto);
      if (!Number.isNaN(quando.getTime())) {
        const atualizacao = document.createElement('p');
        atualizacao.className = 'regras-atendimento__atualizacao';
        atualizacao.textContent = `Atualizado em ${formatadorData.format(quando)}.`;
        bloco.append(atualizacao);
      }
      lista.append(bloco);
    }
  };

  const carregar = async () => {
    status.textContent = 'Carregando…';
    recarregar.disabled = true;
    try {
      const itens = await servico.consultar();
      if (!ativa) return;
      desenhar(itens);
      status.textContent = itens.length === 0 ? 'As regras ainda não foram publicadas.' : '';
      if (!status.textContent) status.hidden = true;
    } catch {
      if (!ativa) return;
      lista.replaceChildren();
      status.hidden = false;
      status.textContent = 'Não foi possível carregar as regras. Tente recarregar.';
    } finally {
      if (ativa) recarregar.disabled = false;
    }
  };

  recarregar.addEventListener('click', () => {
    status.hidden = false;
    void carregar();
  });
  void carregar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
