import { esqueletoCarregando, iniciarAcao } from './esqueleto.js';
import type {
  PainelSubstituicao,
  SubstituicaoCaseManager,
} from '../packages/contracts/src/substituicao-case-manager.ts';
import type { ResponsavelOpcao } from './acompanhamento-caso.ts';
import type { ServicoSubstituicaoCaseManager } from './servico-substituicao-cm-http.ts';

const formato = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function quando(valor: string): string {
  const instante = new Date(valor);
  return Number.isNaN(instante.getTime()) ? valor : formato.format(instante);
}

/** Campo datetime-local produz hora sem fuso; o contrato pede instante com deslocamento. */
function paraInstante(valor: string): string | null {
  if (!valor) return null;
  const instante = new Date(valor);
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}

/** FR-037 / DF-024: seção administrativa da substituição temporária da case manager.
 *
 * A tela diz as três coisas que o requisito exige mostrar — quem é o titular, quem
 * substitui e até quando — e repete em texto que substituir não concede acesso ao caso
 * nem alcança a carteira. Esconder controle não é autorização: o botão aparece e a recusa
 * do servidor é explicada. */
export function montarSubstituicaoCaseManager(
  raiz: HTMLElement,
  servico: ServicoSubstituicaoCaseManager,
  opcoes: { paciente_id: string; equipe?: readonly ResponsavelOpcao[] },
): () => void {
  let ativa = true;
  const equipe = opcoes.equipe ?? [];
  const nomear = (id: string | null) =>
    id === null
      ? 'a completar'
      : (equipe.find((pessoa) => pessoa.usuario_id === id)?.rotulo ?? 'Pessoa da equipe');

  const secao = document.createElement('section');
  secao.className = 'substituicao-cm';
  const titulo = document.createElement('h2');
  titulo.textContent = 'Substituição temporária da case manager';
  const explicacao = document.createElement('p');
  explicacao.className = 'substituicao-cm__explicacao';
  explicacao.textContent =
    'Durante o período registrado, a substituta responde como case manager atual deste caso. A substituição não vale para outros casos nem para a carteira, e não concede acesso ao conteúdo do caso.';
  const status = document.createElement('p');
  status.className = 'substituicao-cm__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const resumo = document.createElement('dl');
  resumo.className = 'substituicao-cm__resumo';
  const historico = document.createElement('div');
  historico.className = 'substituicao-cm__historico';

  const formulario = document.createElement('form');
  formulario.className = 'substituicao-cm__formulario';
  formulario.noValidate = true;
  const escolha = document.createElement('select');
  escolha.id = 'substituicao-cm-pessoa';
  escolha.required = true;
  const rotuloPessoa = document.createElement('label');
  rotuloPessoa.htmlFor = escolha.id;
  rotuloPessoa.textContent = 'Quem substitui';
  const inicio = document.createElement('input');
  inicio.type = 'datetime-local';
  inicio.id = 'substituicao-cm-inicio';
  inicio.required = true;
  const rotuloInicio = document.createElement('label');
  rotuloInicio.htmlFor = inicio.id;
  rotuloInicio.textContent = 'Início';
  const fim = document.createElement('input');
  fim.type = 'datetime-local';
  fim.id = 'substituicao-cm-fim';
  fim.required = true;
  const rotuloFim = document.createElement('label');
  rotuloFim.htmlFor = fim.id;
  rotuloFim.textContent = 'Fim';
  const registrar = document.createElement('button');
  registrar.type = 'submit';
  registrar.className = 'button-primary';
  registrar.textContent = 'Registrar substituição';
  const aviso = document.createElement('p');
  aviso.className = 'substituicao-cm__aviso';
  aviso.setAttribute('role', 'status');
  aviso.setAttribute('aria-live', 'polite');
  formulario.append(rotuloPessoa, escolha, rotuloInicio, inicio, rotuloFim, fim, registrar, aviso);

  const recarregar = document.createElement('button');
  recarregar.type = 'button';
  recarregar.className = 'button-secondary';
  recarregar.textContent = 'Recarregar';
  secao.append(titulo, explicacao, status, resumo, formulario, historico, recarregar);
  raiz.replaceChildren(secao);

  const mensagemDeErro = (erro: unknown): string => {
    const codigo = erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
    if (codigo === 'responsavel_invalido')
      return 'Período ou pessoa indisponível. A substituta precisa ter acesso ativo, ser diferente do titular e o período precisa terminar no futuro.';
    if (codigo === 'conflito')
      return 'Já existe substituição registrada para parte desse período. Encerre a atual ou escolha outro período.';
    if (codigo === 'sem_permissao') return 'Sua conta não pode registrar substituição neste caso.';
    return 'Não foi possível concluir. Tente de novo.';
  };

  const desenharResumo = (painel: PainelSubstituicao) => {
    resumo.replaceChildren();
    const linha = (termo: string, valor: string) => {
      const dt = document.createElement('dt');
      dt.textContent = termo;
      const dd = document.createElement('dd');
      dd.textContent = valor;
      resumo.append(dt, dd);
    };
    linha('Case manager titular', nomear(painel.titular_usuario_id));
    linha('Responde agora', nomear(painel.case_manager_atual_id));
    linha(
      'Substituição vigente',
      painel.vigente
        ? `${nomear(painel.vigente.substituto_usuario_id)} até ${quando(painel.vigente.fim)}`
        : 'Nenhuma. O titular responde pelo caso.',
    );
  };

  const desenharHistorico = (painel: PainelSubstituicao, aoEncerrar: (id: string) => void) => {
    historico.replaceChildren();
    if (painel.substituicoes.length === 0) {
      const vazio = document.createElement('p');
      vazio.className = 'substituicao-cm__vazio';
      vazio.textContent = 'Nenhuma substituição registrada neste caso.';
      historico.append(vazio);
      return;
    }
    const lista = document.createElement('ul');
    lista.className = 'substituicao-cm__lista';
    for (const item of painel.substituicoes) {
      lista.append(linhaDoHistorico(item, painel, aoEncerrar));
    }
    historico.append(lista);
  };

  const linhaDoHistorico = (
    item: SubstituicaoCaseManager,
    painel: PainelSubstituicao,
    aoEncerrar: (id: string) => void,
  ) => {
    const li = document.createElement('li');
    li.className = 'substituicao-cm__item';
    li.dataset.substituicao = item.id;
    const texto = document.createElement('p');
    texto.textContent = `${nomear(item.substituto_usuario_id)} — de ${quando(item.inicio)} até ${quando(item.fim)}`;
    const situacao = document.createElement('p');
    situacao.className = 'substituicao-cm__situacao';
    situacao.textContent = item.encerrada_em
      ? `Encerrada em ${quando(item.encerrada_em)}`
      : painel.vigente?.id === item.id
        ? 'Vigente agora'
        : 'Programada';
    li.append(texto, situacao);
    if (!item.encerrada_em) {
      const encerrar = document.createElement('button');
      encerrar.type = 'button';
      encerrar.className = 'button-secondary';
      encerrar.textContent = 'Encerrar agora';
      encerrar.addEventListener('click', () => aoEncerrar(item.id));
      li.append(encerrar);
    }
    return li;
  };

  const aplicar = (painel: PainelSubstituicao) => {
    desenharResumo(painel);
    desenharHistorico(painel, encerrarSubstituicao);
    escolha.replaceChildren();
    const vazio = document.createElement('option');
    vazio.value = '';
    vazio.textContent = 'Escolha a pessoa';
    escolha.append(vazio);
    for (const pessoa of equipe) {
      if (!pessoa.ativo || pessoa.usuario_id === painel.titular_usuario_id) continue;
      const opcao = document.createElement('option');
      opcao.value = pessoa.usuario_id;
      opcao.textContent = pessoa.rotulo;
      escolha.append(opcao);
    }
    registrar.disabled = painel.titular_usuario_id === null;
    status.textContent =
      painel.titular_usuario_id === null
        ? 'Este caso ainda não tem case manager titular. Indique o responsável antes de registrar substituição.'
        : painel.vigente
          ? `${nomear(painel.vigente.substituto_usuario_id)} responde até ${quando(painel.vigente.fim)}.`
          : 'Sem substituição vigente.';
  };

  const carregar = async (mensagemInicial = 'Carregando substituição…') => {
    status.textContent = mensagemInicial;
    recarregar.disabled = true;
    historico.setAttribute('aria-busy', 'true');
    if (!historico.hasChildNodes()) historico.append(esqueletoCarregando(2, true));
    const finalizar = iniciarAcao(recarregar);
    try {
      const painel = await servico.consultar(opcoes.paciente_id);
      if (!ativa) return;
      aplicar(painel);
    } catch (erro) {
      if (!ativa) return;
      historico.replaceChildren();
      status.textContent = 'Não foi possível carregar a substituição deste caso. Tente recarregar.';
      aviso.textContent = mensagemDeErro(erro);
    } finally {
      finalizar();
      historico.removeAttribute('aria-busy');
      if (ativa) recarregar.disabled = false;
    }
  };

  function encerrarSubstituicao(substituicaoId: string): void {
    aviso.textContent = 'Encerrando…';
    void servico
      .encerrar(opcoes.paciente_id, { substituicao_id: substituicaoId })
      .then((painel) => {
        if (!ativa) return;
        aplicar(painel);
        aviso.textContent = 'Substituição encerrada. O titular volta a responder.';
      })
      .catch((erro: unknown) => {
        if (!ativa) return;
        aviso.textContent = mensagemDeErro(erro);
      });
  }

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (registrar.disabled) return;
    const de = paraInstante(inicio.value);
    const ate = paraInstante(fim.value);
    if (!escolha.value || !de || !ate) {
      aviso.textContent = 'Escolha a pessoa e informe início e fim.';
      return;
    }
    if (Date.parse(ate) <= Date.parse(de)) {
      aviso.textContent = 'O fim precisa ser depois do início.';
      return;
    }
    registrar.disabled = true;
    aviso.textContent = 'Registrando…';
    const finalizar = iniciarAcao(registrar);
    void servico
      .registrar(opcoes.paciente_id, {
        substituto_usuario_id: escolha.value,
        inicio: de,
        fim: ate,
      })
      .then((painel) => {
        if (!ativa) return;
        aplicar(painel);
        aviso.textContent = 'Substituição registrada.';
        formulario.reset();
      })
      .catch((erro: unknown) => {
        if (!ativa) return;
        aviso.textContent = mensagemDeErro(erro);
      })
      .finally(() => {
        finalizar();
        if (ativa) registrar.disabled = false;
      });
  });

  recarregar.addEventListener('click', () => void carregar());
  void carregar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
