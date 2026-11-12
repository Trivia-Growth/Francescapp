import type {
  FiltrosLinhaTempo,
  ItemLinhaTempo,
  LinhaTempo,
} from '../packages/contracts/src/linha-tempo.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { dataDeInstante } from './datas.js';
import { esqueletoCarregando } from './esqueleto.js';

export type ServicoLinhaTempo = {
  consultar(pacienteId: string, filtros?: FiltrosLinhaTempo): Promise<LinhaTempo>;
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

const ROTULOS_FONTE: Record<ItemLinhaTempo['fonte'], string> = {
  diario: 'Diário',
  documento: 'Documento',
  anamnese: 'Anamnese',
  saude: 'Saúde',
  contexto: 'Rotina e recursos',
  rede: 'Rede de cuidado',
  situacao: 'Situação do caso',
  objetivo: 'Objetivo',
  tarefa: 'Tarefa',
  encaminhamento: 'Encaminhamento',
  orientacao: 'Orientação',
  pendencia: 'Pendência',
};

/** FR-007 manda distinguir acontecimento, registro e retificação. Rascunho aparece só para
 * o autor e é rotulado como tal para não se confundir com publicação. */
const ROTULOS_EVENTO: Record<ItemLinhaTempo['tipo_evento'], string> = {
  registro: 'Registrado',
  atualizacao: 'Atualizado',
  retificacao: 'Retificado',
  rascunho: 'Rascunho',
};

function dataCivil(valor: string | null): string {
  if (!valor) return '';
  const [ano, mes, dia] = valor.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

/** Linha do tempo do caso (FR-007).
 *
 * Duas coisas que esta tela nunca faz:
 * - não inventa data de acontecimento. Quando o registro não tem data informada, ela
 *   simplesmente não aparece, em vez de a data de registro ocupar o lugar dela;
 * - não anuncia o que foi filtrado por audiência. O que a pessoa não pode ver não chega
 *   aqui nem como contagem.
 *
 * Desde 12/11/2026 a data do acontecimento e a área do diário saíram do envelope, então o
 * filtro por área é real. As áreas vêm do que já apareceu no acervo carregado, não de uma
 * lista fixa no código: o vocabulário é configurado pela equipe. */
export function montarLinhaTempo(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoLinhaTempo,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  let vivo = true;
  let filtros: FiltrosLinhaTempo = {};
  let acumulado: ItemLinhaTempo[] = [];

  const secao = elemento('section', undefined, 'secao-linha-tempo');
  const titulo = elemento('h3', 'Linha do tempo');
  titulo.id = `linha-tempo-titulo-${pacienteId}`;
  secao.setAttribute('aria-labelledby', titulo.id);
  const estado = elemento('p', '', 'linha-tempo__estado');
  estado.setAttribute('role', 'status');
  estado.setAttribute('aria-live', 'polite');

  const barra = elemento('div', undefined, 'linha-tempo__filtros');
  const rotuloFonte = elemento('label', 'Tipo de registro');
  const seletor = elemento('select');
  seletor.id = `linha-tempo-fonte-${pacienteId}`;
  rotuloFonte.htmlFor = seletor.id;
  seletor.append(new Option('Todos', ''));
  for (const [chave, rotulo] of Object.entries(ROTULOS_FONTE))
    seletor.append(new Option(rotulo, chave));
  const rotuloArea = elemento('label', 'Área');
  const seletorArea = elemento('select');
  seletorArea.id = `linha-tempo-area-${pacienteId}`;
  rotuloArea.htmlFor = seletorArea.id;
  seletorArea.append(new Option('Todas', ''));
  const rotuloDe = elemento('label', 'A partir de');
  const campoDe = elemento('input');
  campoDe.type = 'date';
  campoDe.id = `linha-tempo-de-${pacienteId}`;
  rotuloDe.htmlFor = campoDe.id;
  barra.append(rotuloFonte, seletor, rotuloArea, seletorArea, rotuloDe, campoDe);

  const lista = elemento('ol', undefined, 'linha-tempo__lista');
  const mais = elemento('button', 'Carregar mais');
  mais.type = 'button';
  mais.hidden = true;
  secao.append(titulo, estado, barra, lista, mais);
  raiz.append(secao);

  function desenharItem(item: ItemLinhaTempo): HTMLElement {
    const linha = elemento('li', undefined, 'linha-tempo__item');
    const cabecalho = elemento('div', undefined, 'linha-tempo__cabecalho');
    cabecalho.append(
      elemento('span', ROTULOS_FONTE[item.fonte], 'linha-tempo__fonte'),
      elemento('span', ROTULOS_EVENTO[item.tipo_evento], 'linha-tempo__evento'),
    );
    linha.append(cabecalho);
    const registrado = dataDeInstante(item.registrado_em);
    linha.append(
      elemento(
        'p',
        registrado ? `Registrado em ${registrado}` : 'Data de registro indisponível',
        'linha-tempo__registro',
      ),
    );
    if (item.aconteceu_em)
      linha.append(
        elemento('p', `Aconteceu em ${dataCivil(item.aconteceu_em)}`, 'linha-tempo__acontecimento'),
      );
    if (item.area) linha.append(elemento('p', item.area, 'linha-tempo__area'));
    if (item.detalhe.estado === 'indisponivel')
      linha.append(elemento('p', 'Conteúdo indisponível', 'linha-tempo__indisponivel'));
    if (item.audiencia === 'equipe_e_familia')
      linha.append(elemento('p', 'Visível também para a família', 'linha-tempo__audiencia'));
    return linha;
  }

  function desenhar(): void {
    lista.replaceChildren();
    for (const item of acumulado) lista.append(desenharItem(item));
    atualizarAreas();
  }

  /** As áreas oferecidas saem do acervo já carregado. Enquanto nada apareceu, o seletor
   * fica escondido em vez de oferecer uma lista vazia que parece defeito. */
  function atualizarAreas(): void {
    const vistas = [...new Set(acumulado.map((i) => i.area).filter((a): a is string => !!a))].sort(
      (a, b) => a.localeCompare(b, 'pt-BR'),
    );
    const escolhida = seletorArea.value;
    seletorArea.replaceChildren(new Option('Todas', ''));
    for (const area of vistas) seletorArea.append(new Option(area, area));
    if (vistas.includes(escolhida)) seletorArea.value = escolhida;
    const vazio = vistas.length === 0;
    seletorArea.hidden = vazio;
    rotuloArea.hidden = vazio;
  }

  async function carregar(continuar: boolean): Promise<void> {
    if (!continuar) {
      acumulado = [];
      lista.replaceChildren(esqueletoCarregando(4));
    }
    estado.textContent = 'Carregando a linha do tempo…';
    mais.disabled = true;
    try {
      const resposta = await servico.consultar(pacienteId, filtros);
      if (!vivo) return;
      acumulado = continuar ? [...acumulado, ...resposta.itens] : resposta.itens;
      desenhar();
      if (resposta.proximo_cursor) {
        filtros = {
          ...filtros,
          cursor_em: resposta.proximo_cursor.registrado_em,
          cursor_id: resposta.proximo_cursor.id,
        };
        mais.hidden = false;
      } else {
        const { cursor_em: _em, cursor_id: _id, ...resto } = filtros;
        filtros = resto;
        mais.hidden = true;
      }
      estado.textContent =
        acumulado.length === 0
          ? 'Nada registrado neste caso ainda.'
          : `${acumulado.length} registros.`;
    } catch (erro) {
      if (!vivo) return;
      if (exigeNovoAcesso(erro)) {
        acessoPerdido(erro);
        return;
      }
      lista.replaceChildren();
      estado.textContent = mensagemFalha(erro);
    } finally {
      if (vivo) mais.disabled = false;
    }
  }

  function reiniciar(): void {
    const { cursor_em: _em, cursor_id: _id, ...resto } = filtros;
    filtros = resto;
    void carregar(false);
  }

  seletor.addEventListener('change', () => {
    const escolha = seletor.value;
    const { fontes: _fontes, ...resto } = filtros;
    filtros = escolha ? { ...resto, fontes: [escolha as ItemLinhaTempo['fonte']] } : resto;
    reiniciar();
  });
  seletorArea.addEventListener('change', () => {
    const escolha = seletorArea.value;
    const { areas: _areas, ...resto } = filtros;
    filtros = escolha ? { ...resto, areas: [escolha] } : resto;
    reiniciar();
  });
  campoDe.addEventListener('change', () => {
    const { de: _de, ...resto } = filtros;
    filtros = campoDe.value ? { ...resto, de: `${campoDe.value}T00:00:00Z` } : resto;
    reiniciar();
  });
  mais.addEventListener('click', () => void carregar(true));

  void carregar(false);
  return () => {
    vivo = false;
    secao.remove();
  };
}
