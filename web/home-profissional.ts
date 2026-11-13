import type { FiltrosCarteira, PacienteLista } from '../packages/contracts/src/cadastro.js';
import { avisoSinalOperacional } from '../packages/contracts/src/pendencia.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { esqueletoCarregando } from './esqueleto.js';
import { hashFicha } from './ficha-paciente.js';

export type PaginaCarteira = {
  itens: PacienteLista[];
  proximo_cursor: string | null;
};

export type ServicoHome = {
  listar(filtros?: FiltrosCarteira): Promise<PaginaCarteira>;
};

const elemento = <K extends keyof HTMLElementTagNameMap>(
  tipo: K,
  texto?: string,
  classe?: string,
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tipo);
  if (texto !== undefined) el.textContent = texto;
  if (classe) el.className = classe;
  return el;
};

function nomeVisivel(paciente: PacienteLista): string {
  return paciente.nome_preferencia ?? paciente.nome;
}

/** Plural em português sem recorrer a "(s)", que lê mal em voz alta. */
function frase(quantidade: number, singular: string, plural: string): string {
  return quantidade === 1 ? singular : plural.replace('{n}', String(quantidade));
}

/** Linha de um caso que pede atenção.
 *
 * O destino do link é a aba que resolve o motivo, não a ficha genérica: quem abre a home
 * entre dois atendimentos não deveria precisar caçar a aba certa depois de clicar. */
function linhaCaso(paciente: PacienteLista, secao: string): HTMLLIElement {
  const item = elemento('li', undefined, 'home-caso');
  const link = elemento('a', undefined, 'home-caso-link');
  link.href = hashFicha(paciente.id, secao);
  const nome = elemento('span', nomeVisivel(paciente), 'home-caso-nome');
  link.append(nome);
  const motivos = paciente.sinal?.motivos ?? [];
  if (motivos.length > 0) {
    const lista = elemento('ul', undefined, 'home-caso-motivos');
    for (const motivo of motivos) lista.append(elemento('li', motivo));
    link.append(lista);
  }
  const seta = elemento('span', undefined, 'home-caso-seta');
  seta.setAttribute('aria-hidden', 'true');
  link.append(seta);
  item.append(link);
  return item;
}

/** Home do profissional: responde "o que precisa de mim agora?".
 *
 * Três decisões que são regra, não estilo:
 *
 * - **Só entra o que tem fonte.** Nada de bloco vazio anunciando o que ainda não existe.
 *   A tela é montada do sinal operacional da carteira, que é a única agregação entre casos
 *   que o servidor oferece hoje. Agenda, documentos e transcrição ficam de fora porque não
 *   há dado — não porque não caberiam.
 * - **A autorização é a da carteira.** Cada chamada é a mesma consulta que a lista de
 *   pessoas faz, com o mesmo recorte por `acesso_paciente`. A home não soma nada que o
 *   servidor não tenha devolvido, então nenhuma contagem revela caso que a pessoa não vê.
 * - **O sinal nunca vira leitura clínica.** O aviso de FR-028 acompanha a seção que mostra
 *   o estado, como em toda outra superfície que o exibe.
 *
 * Uma fonte que falha degrada o próprio bloco e mantém o resto da tela de pé. */
export function montarHomeProfissional(
  raiz: HTMLElement,
  servico: ServicoHome,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  let ativa = true;
  let geracao = 0;

  const secao = elemento('section', undefined, 'home');
  secao.setAttribute('aria-labelledby', 'home-saudacao');

  const cabecalho = elemento('header', undefined, 'home-cabecalho');
  const saudacao = elemento('h1', 'Carregando seu dia…', 'home-saudacao');
  saudacao.id = 'home-saudacao';
  saudacao.tabIndex = -1;
  const apoio = elemento('p', undefined, 'home-apoio');
  cabecalho.append(saudacao, apoio);

  const estado = elemento('p', undefined, 'sr-only');
  estado.setAttribute('role', 'status');
  estado.setAttribute('aria-live', 'polite');
  estado.setAttribute('aria-atomic', 'true');

  const corpo = elemento('div', undefined, 'home-corpo');
  secao.append(cabecalho, estado, corpo);
  raiz.replaceChildren(secao);

  const descartarAcesso = (erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };

  let seqBloco = 0;

  /** Cada bloco é uma região com nome, e o nome vem do próprio título por
   * `aria-labelledby` — repetir o texto num `aria-label` faria o leitor de tela anunciar
   * duas vezes a mesma coisa. */
  function bloco(titulo: string, aviso?: string): { secao: HTMLElement; corpo: HTMLElement } {
    seqBloco += 1;
    const bloco = elemento('section', undefined, 'home-bloco');
    const cabecalho = elemento('h2', titulo, 'home-bloco-titulo');
    cabecalho.id = `home-bloco-${seqBloco}`;
    bloco.setAttribute('aria-labelledby', cabecalho.id);
    bloco.dataset.bloco = titulo;
    bloco.append(cabecalho);
    if (aviso) bloco.append(elemento('p', aviso, 'home-aviso'));
    const dentro = elemento('div', undefined, 'home-bloco-corpo');
    bloco.append(dentro);
    return { secao: bloco, corpo: dentro };
  }

  function desenharFalha(erro: unknown, repetir: () => void): HTMLElement {
    const bloco = elemento('div', undefined, 'home-falha');
    const texto = elemento('p', `${mensagemFalha(erro)} Esta leitura não foi carregada.`);
    texto.dataset.tone = 'error';
    const tentar = elemento('button', 'Tentar novamente', 'button-secondary');
    tentar.type = 'button';
    tentar.addEventListener('click', repetir);
    bloco.append(texto, tentar);
    return bloco;
  }

  async function carregar(): Promise<void> {
    if (!ativa) return;
    geracao += 1;
    const numero = geracao;
    saudacao.textContent = 'Carregando seu dia…';
    apoio.textContent = '';
    estado.textContent = 'Carregando o resumo do seu dia.';
    corpo.replaceChildren(esqueletoCarregando(3));

    // As duas leituras são a mesma consulta da carteira, com recortes diferentes. Elas
    // seguem em paralelo e são tratadas separadamente: uma falhar não derruba a outra.
    const [atencao, todos] = await Promise.allSettled([
      servico.listar({ pendencia: 'abertas' }),
      servico.listar(),
    ]);
    if (!ativa || numero !== geracao) return;

    for (const resultado of [atencao, todos])
      if (resultado.status === 'rejected' && descartarAcesso(resultado.reason)) return;

    corpo.replaceChildren();

    if (atencao.status === 'fulfilled') {
      const casos = atencao.value.itens;
      const parcial = atencao.value.proximo_cursor !== null;
      if (casos.length === 0) {
        saudacao.textContent = 'Nada precisa de você agora';
        apoio.textContent =
          'Nenhum caso com pendência aberta no seu acesso. Os compromissos combinados estão em dia.';
        const sereno = elemento('div', undefined, 'home-sereno');
        sereno.append(
          elemento(
            'p',
            'Quando algo precisar de atenção, aparece aqui primeiro, com o motivo e o caminho direto para o caso.',
          ),
        );
        corpo.append(sereno);
      } else {
        saudacao.textContent = frase(
          casos.length,
          'Um caso precisa de você',
          '{n} casos precisam de você',
        );
        apoio.textContent = parcial
          ? 'Os primeiros da fila; abra a lista completa para ver o restante.'
          : 'Em ordem de chegada, com o motivo de cada um.';
        const { secao: bloco1, corpo: dentro } = bloco(
          'Precisa de você agora',
          avisoSinalOperacional,
        );
        const lista = elemento('ul', undefined, 'home-lista');
        for (const caso of casos) lista.append(linhaCaso(caso, 'pendencias'));
        dentro.append(lista);
        corpo.append(bloco1);
      }
    } else {
      saudacao.textContent = 'Seu dia';
      apoio.textContent = '';
      const { secao: bloco1, corpo: dentro } = bloco('Precisa de você agora');
      dentro.append(desenharFalha(atencao.reason, () => void carregar()));
      corpo.append(bloco1);
    }

    if (todos.status === 'fulfilled') {
      const semAcordo = todos.value.itens.filter(
        (caso) => caso.sinal?.estado === 'informacao_insuficiente',
      );
      if (semAcordo.length > 0) {
        const { secao: bloco2, corpo: dentro } = bloco(
          'Esperando combinar',
          'Sem periodicidade acordada o acompanhamento não consegue apontar pendência — ausência de aviso aqui não é sinal de que está tudo bem.',
        );
        const lista = elemento('ul', undefined, 'home-lista');
        for (const caso of semAcordo) lista.append(linhaCaso(caso, 'pendencias'));
        dentro.append(lista);
        corpo.append(bloco2);
      }
      const total = todos.value.itens.length;
      const parcial = todos.value.proximo_cursor !== null;
      const rodape = elemento('p', undefined, 'home-rodape');
      const contagem = parcial
        ? `Você acompanha mais de ${total} ${frase(total, 'pessoa', 'pessoas')}.`
        : `Você acompanha ${total} ${frase(total, 'pessoa', 'pessoas')}.`;
      const link = elemento('a', 'Ver a lista completa', 'home-rodape-link');
      link.href = '#carteira';
      rodape.append(document.createTextNode(`${contagem} `), link);
      corpo.append(rodape);
    } else {
      const { secao: bloco2, corpo: dentro } = bloco('Suas pessoas acompanhadas');
      dentro.append(desenharFalha(todos.reason, () => void carregar()));
      corpo.append(bloco2);
    }

    // A região viva existe para anunciar o fim do carregamento. Repetir aqui a frase do
    // título faria o leitor de tela dizer duas vezes a mesma coisa.
    estado.textContent = 'Resumo do dia atualizado.';
  }

  void carregar();

  return () => {
    ativa = false;
    geracao += 1;
    raiz.replaceChildren();
  };
}
