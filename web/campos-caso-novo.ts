import { novoContatoSchema, type SituacaoCaso } from '../packages/contracts/src/index.js';
import type { ResponsavelOpcao } from './acompanhamento-caso.js';

const LIMITE_CONTATOS = 10;

export type ContatoDigitado = { tipo: 'email' | 'telefone'; valor: string };

type Elementos = {
  contatos: HTMLElement;
  adicionar: HTMLButtonElement;
  erroContatos: HTMLElement;
  situacao: HTMLSelectElement;
  responsavel: HTMLSelectElement;
  estadoResponsavel: HTMLElement;
  tentarNovamente: HTMLButtonElement;
};

type Linha = { raiz: HTMLElement; tipo: HTMLSelectElement; valor: HTMLInputElement };

/** Campos do cadastro de caso novo que vão além dos três de texto: contatos (de 1 a 10),
 * situação e case manager. Nada vem preenchido; o responsável só aparece depois de a equipe
 * ser consultada de verdade, e sem equipe ativa o cadastro não pode ser enviado. */
export function montarCamposCasoNovo(
  el: Elementos,
  listarResponsaveis: () => Promise<ResponsavelOpcao[]>,
) {
  let linhas: Linha[] = [];
  let proximoNumero = 1;
  let equipeDisponivel = false;
  let carga = 0;

  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const novo = document.createElement(tipo);
    if (texto !== undefined) novo.textContent = texto;
    return novo;
  };

  const atualizarBotoes = () => {
    el.adicionar.disabled = linhas.length >= LIMITE_CONTATOS;
    linhas.forEach((linha, indice) => {
      const botao = linha.raiz.querySelector<HTMLButtonElement>('.contact-remove');
      if (botao) botao.hidden = indice === 0;
    });
  };

  const adicionarLinha = () => {
    if (linhas.length >= LIMITE_CONTATOS) return;
    const numero = proximoNumero++;
    const raiz = elemento('div');
    raiz.className = 'contact-row';
    const rotuloTipo = elemento('label', `Tipo do contato ${numero}`);
    rotuloTipo.className = 'sr-only';
    rotuloTipo.htmlFor = `contact-type-${numero}`;
    const tipo = elemento('select');
    tipo.id = `contact-type-${numero}`;
    tipo.append(new Option('E-mail', 'email'), new Option('Telefone', 'telefone'));
    const rotuloValor = elemento('label', `Contato ${numero}`);
    rotuloValor.className = 'sr-only';
    rotuloValor.htmlFor = `contact-value-${numero}`;
    const valor = elemento('input');
    valor.id = `contact-value-${numero}`;
    valor.maxLength = 254;
    valor.autocomplete = 'off';
    const ajustarTipo = () => {
      const email = tipo.value === 'email';
      valor.type = email ? 'email' : 'tel';
      valor.placeholder = email ? 'nome@exemplo.org' : '+55 11 90000-0000';
    };
    ajustarTipo();
    tipo.addEventListener('change', ajustarTipo);
    const remover = elemento('button', 'Remover');
    remover.type = 'button';
    remover.className = 'button-secondary contact-remove';
    remover.setAttribute('aria-label', `Remover contato ${numero}`);
    const linha: Linha = { raiz, tipo, valor };
    remover.addEventListener('click', () => {
      linhas = linhas.filter((item) => item !== linha);
      raiz.remove();
      atualizarBotoes();
      (linhas[linhas.length - 1]?.valor ?? el.adicionar).focus();
    });
    raiz.append(rotuloTipo, tipo, rotuloValor, valor, remover);
    el.contatos.append(raiz);
    linhas.push(linha);
    atualizarBotoes();
    return linha;
  };

  el.adicionar.addEventListener('click', () => adicionarLinha()?.valor.focus());

  const carregarResponsaveis = async () => {
    const minhaCarga = ++carga;
    equipeDisponivel = false;
    el.responsavel.replaceChildren(new Option('Selecione quem acompanha o caso', ''));
    el.responsavel.disabled = true;
    el.tentarNovamente.hidden = true;
    el.estadoResponsavel.textContent = 'Carregando equipe…';
    try {
      const opcoes = (await listarResponsaveis()).filter((opcao) => opcao.ativo);
      if (minhaCarga !== carga) return;
      for (const opcao of opcoes) el.responsavel.append(new Option(opcao.rotulo, opcao.usuario_id));
      equipeDisponivel = opcoes.length > 0;
      el.responsavel.disabled = !equipeDisponivel;
      el.estadoResponsavel.textContent = equipeDisponivel
        ? ''
        : 'Nenhuma pessoa ativa da equipe para indicar. O cadastro não pode ser enviado.';
    } catch {
      if (minhaCarga !== carga) return;
      el.estadoResponsavel.textContent =
        'Não foi possível carregar a equipe. O cadastro não pode ser enviado agora.';
      el.tentarNovamente.hidden = false;
    }
  };
  el.tentarNovamente.addEventListener('click', () => void carregarResponsaveis());

  /** Sem permissão para listar a equipe não há como indicar o responsável: o cadastro não é enviado. */
  const equipeIndisponivel = (mensagem: string) => {
    carga += 1;
    equipeDisponivel = false;
    el.responsavel.replaceChildren(new Option('Selecione quem acompanha o caso', ''));
    el.responsavel.disabled = true;
    el.tentarNovamente.hidden = true;
    el.estadoResponsavel.textContent = mensagem;
  };

  const reiniciar = () => {
    for (const linha of linhas) linha.raiz.remove();
    linhas = [];
    proximoNumero = 1;
    adicionarLinha();
    el.situacao.value = '';
    el.responsavel.value = '';
    el.erroContatos.textContent = '';
  };
  reiniciar();

  return {
    carregarResponsaveis,
    equipeIndisponivel,
    reiniciar,
    /** Descarta uma consulta de equipe em andamento, por exemplo ao encerrar a sessão. */
    cancelarCarga: () => {
      carga += 1;
      equipeDisponivel = false;
      // Os e-mails da equipe não ficam no formulário oculto depois da saída.
      el.responsavel.replaceChildren(new Option('Selecione quem acompanha o caso', ''));
      el.responsavel.disabled = true;
      el.estadoResponsavel.textContent = '';
      el.tentarNovamente.hidden = true;
    },
    /** Linhas com algo digitado; linhas vazias não contam como contato. */
    contatos: (): ContatoDigitado[] =>
      linhas
        .filter((linha) => linha.valor.value.trim() !== '')
        .map((linha) => ({
          tipo: linha.tipo.value as 'email' | 'telefone',
          valor: linha.valor.value,
        })),
    situacao: (): SituacaoCaso | undefined =>
      (el.situacao.value || undefined) as SituacaoCaso | undefined,
    responsavelId: () => el.responsavel.value || undefined,
    equipeDisponivel: () => equipeDisponivel,
    /** Marca as linhas inválidas (ou a primeira, se nenhuma foi preenchida) e devolve a primeira. */
    marcarContatos: (invalido: boolean): HTMLElement | undefined => {
      let primeira: HTMLElement | undefined;
      const preenchidas = linhas.filter((linha) => linha.valor.value.trim() !== '');
      for (const linha of linhas) {
        const vazia = linha.valor.value.trim() === '';
        const ruim =
          invalido &&
          (preenchidas.length === 0
            ? linha === linhas[0]
            : !vazia &&
              !novoContatoSchema.safeParse({ tipo: linha.tipo.value, valor: linha.valor.value })
                .success);
        if (ruim) {
          linha.valor.setAttribute('aria-invalid', 'true');
          primeira ??= linha.valor;
        } else linha.valor.removeAttribute('aria-invalid');
      }
      el.erroContatos.textContent = invalido
        ? 'Informe ao menos um contato válido, com e-mail ou telefone correto.'
        : '';
      return primeira;
    },
  };
}
