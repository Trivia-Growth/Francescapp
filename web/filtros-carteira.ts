import type { FiltrosCarteira } from '../packages/contracts/src/cadastro.js';
import {
  avisoSinalOperacional,
  rotulosEstadoSinal,
  type SinalCarteira,
} from '../packages/contracts/src/pendencia.js';
import { rotulosSituacao, type ResponsavelOpcao } from './acompanhamento-caso.js';

/** FR-026: filtros da carteira. A busca por nome que já existe continua valendo só dentro
 * da página carregada, porque o nome é cifrado e o banco não o compara; estes filtros são
 * de outra natureza — vão para o servidor e recortam a carteira inteira antes de paginar.
 *
 * `responsavel` e `situacao` só aparecem para o Administrador, que é quem o servidor
 * autoriza a lê-los. Esconder o controle é conveniência; a recusa está no banco. */
export type AoFiltrar = (filtros: FiltrosCarteira) => void;

const REVISAO: [NonNullable<FiltrosCarteira['revisao']>, string][] = [
  ['vencida', 'Revisão vencida'],
  ['proxima', 'Revisão próxima'],
  ['sem_data', 'Sem revisão marcada'],
];
const PENDENCIA: [NonNullable<FiltrosCarteira['pendencia']>, string][] = [
  ['abertas', 'Com pendência em aberto'],
  ['nenhuma', 'Sem pendência em aberto'],
];

function campoSelecao(
  rotulo: string,
  nome: string,
  opcoes: [string, string][],
  vazio: string,
): { campo: HTMLLabelElement; selecao: HTMLSelectElement } {
  const campo = document.createElement('label');
  campo.className = 'filtro-carteira';
  const texto = document.createElement('span');
  texto.textContent = rotulo;
  const selecao = document.createElement('select');
  selecao.name = nome;
  selecao.append(new Option(vazio, ''));
  for (const [valor, legenda] of opcoes) selecao.append(new Option(legenda, valor));
  campo.append(texto, selecao);
  return { campo, selecao };
}

/** Barra de filtros. Não consulta nada: entrega o recorte escolhido a quem carrega a
 * carteira, para que a paginação continue sendo de uma camada só. */
export function montarFiltrosCarteira(
  raiz: HTMLElement,
  opcoes: {
    administrador: boolean;
    responsaveis?: readonly ResponsavelOpcao[];
    inicial?: FiltrosCarteira;
  },
  aoFiltrar: AoFiltrar,
): { aplicar(): void; limpar(): void } {
  const formulario = document.createElement('form');
  formulario.className = 'filtros-carteira';
  formulario.noValidate = true;
  const legenda = document.createElement('h2');
  legenda.textContent = 'Filtrar carteira';
  legenda.className = 'filtros-carteira-titulo';
  formulario.append(legenda);

  const campos: HTMLSelectElement[] = [];
  let responsavel: HTMLSelectElement | undefined;
  let situacao: HTMLSelectElement | undefined;
  if (opcoes.administrador) {
    const listaResponsaveis: [string, string][] = [
      ['nenhum', 'Sem responsável indicado'],
      ...(opcoes.responsaveis ?? []).map((item): [string, string] => [
        item.usuario_id,
        item.ativo ? item.rotulo : `${item.rotulo} (inativo)`,
      ]),
    ];
    const r = campoSelecao('Responsável', 'responsavel', listaResponsaveis, 'Qualquer responsável');
    const s = campoSelecao(
      'Situação do caso',
      'situacao',
      [...(Object.entries(rotulosSituacao) as [string, string][]), ['a_completar', 'A completar']],
      'Qualquer situação',
    );
    responsavel = r.selecao;
    situacao = s.selecao;
    campos.push(r.selecao, s.selecao);
    formulario.append(r.campo, s.campo);
  }
  const rev = campoSelecao('Revisão', 'revisao', REVISAO, 'Qualquer revisão');
  const pen = campoSelecao('Pendências', 'pendencia', PENDENCIA, 'Com ou sem pendência');
  campos.push(rev.selecao, pen.selecao);
  formulario.append(rev.campo, pen.campo);

  if (opcoes.inicial) {
    if (responsavel && opcoes.inicial.responsavel) responsavel.value = opcoes.inicial.responsavel;
    if (situacao && opcoes.inicial.situacao) situacao.value = opcoes.inicial.situacao;
    if (opcoes.inicial.revisao) rev.selecao.value = opcoes.inicial.revisao;
    if (opcoes.inicial.pendencia) pen.selecao.value = opcoes.inicial.pendencia;
  }

  const limparBotao = document.createElement('button');
  limparBotao.type = 'button';
  limparBotao.className = 'button-secondary';
  limparBotao.textContent = 'Limpar filtros';
  formulario.append(limparBotao);

  const reunir = (): FiltrosCarteira => ({
    ...(responsavel?.value
      ? { responsavel: responsavel.value as NonNullable<FiltrosCarteira['responsavel']> }
      : {}),
    ...(situacao?.value
      ? { situacao: situacao.value as NonNullable<FiltrosCarteira['situacao']> }
      : {}),
    ...(rev.selecao.value
      ? { revisao: rev.selecao.value as NonNullable<FiltrosCarteira['revisao']> }
      : {}),
    ...(pen.selecao.value
      ? { pendencia: pen.selecao.value as NonNullable<FiltrosCarteira['pendencia']> }
      : {}),
  });
  const aplicar = () => aoFiltrar(reunir());
  for (const campo of campos) campo.addEventListener('change', aplicar);
  const limpar = () => {
    for (const campo of campos) campo.value = '';
    aplicar();
  };
  limparBotao.addEventListener('click', limpar);
  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    aplicar();
  });
  raiz.replaceChildren(formulario);
  return { aplicar, limpar };
}

/** Selo do sinal operacional em um item da lista (FR-028).
 *
 * O aviso de que isto não é avaliação clínica fica no `title` e num texto lido por leitor
 * de tela — não pode depender de o motivo caber visualmente na linha da lista. */
export function montarSinalCarteira(sinal: SinalCarteira): HTMLElement {
  const selo = document.createElement('span');
  selo.className = 'sinal-carteira';
  selo.dataset.estado = sinal.estado;
  selo.title = avisoSinalOperacional;
  const rotulo = document.createElement('strong');
  rotulo.textContent = rotulosEstadoSinal[sinal.estado];
  const motivos = document.createElement('span');
  motivos.className = 'sinal-carteira-motivos';
  motivos.textContent = sinal.motivos.join(' · ');
  const leitura = document.createElement('span');
  leitura.className = 'sr-only';
  leitura.textContent = avisoSinalOperacional;
  selo.append(rotulo, motivos, leitura);
  return selo;
}
