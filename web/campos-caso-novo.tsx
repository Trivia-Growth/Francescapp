import { novoContatoSchema, type SituacaoCaso } from '../packages/contracts/src/index.js';
import { type ResponsavelOpcao, rotulosSituacao } from './acompanhamento-caso.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { definirValorNativo } from './componentes/ui/valor-nativo.js';
import { botao } from './ponte/botao-imperativo.js';
import { ilha, ilhaAtualizavel } from './ponte/ilha.js';

const LIMITE_CONTATOS = 10;

export type ContatoDigitado = { tipo: 'email' | 'telefone'; valor: string };

type Elementos = {
  contatos: HTMLElement;
  adicionar: HTMLButtonElement;
  erroContatos: HTMLElement;
  nascimento: HTMLElement;
  situacao: HTMLElement;
  responsavel: HTMLElement;
  estadoResponsavel: HTMLElement;
  tentarNovamente: HTMLButtonElement;
};

type Linha = {
  raiz: HTMLElement;
  tipo: HTMLSelectElement;
  valor: HTMLInputElement;
  desmontarTipo: () => void;
};

type CampoEstatico = 'birth-date' | 'case-status' | 'case-manager';

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
  let responsaveis: readonly ResponsavelOpcao[] = [];
  let carregando = false;
  const invalidos = new Set<CampoEstatico>();
  const hojeIso = new Date().toISOString().slice(0, 10);

  const desenharNascimento = () => (
    <CampoData
      id="birth-date"
      name="data_nascimento"
      max={hojeIso}
      aria-labelledby="birth-label"
      aria-describedby="birth-error"
      aria-invalid={invalidos.has('birth-date') || undefined}
    />
  );
  const desenharSituacao = () => (
    <SelecaoAprimorada
      id="case-status"
      name="situacao"
      aria-labelledby="status-label"
      aria-describedby="status-error"
      aria-invalid={invalidos.has('case-status') || undefined}
      defaultValue=""
    >
      <option value="">Selecione a situação</option>
      {Object.entries(rotulosSituacao).map(([valor, rotulo]) => (
        <option key={valor} value={valor}>
          {rotulo}
        </option>
      ))}
    </SelecaoAprimorada>
  );
  const desenharResponsavel = () => (
    <SelecaoAprimorada
      id="case-manager"
      name="responsavel_id"
      aria-labelledby="manager-label"
      aria-describedby="manager-error manager-state"
      aria-invalid={invalidos.has('case-manager') || undefined}
      aria-busy={carregando || undefined}
      disabled={!equipeDisponivel}
      defaultValue=""
    >
      <option value="">Selecione quem acompanha o caso</option>
      {responsaveis.map((opcao) => (
        <option key={opcao.usuario_id} value={opcao.usuario_id}>
          {opcao.rotulo}
        </option>
      ))}
    </SelecaoAprimorada>
  );
  const ilhaNascimento = ilhaAtualizavel(el.nascimento, desenharNascimento());
  const ilhaSituacao = ilhaAtualizavel(el.situacao, desenharSituacao());
  const ilhaResponsavel = ilhaAtualizavel(el.responsavel, desenharResponsavel());
  const nascimento = el.nascimento.querySelector<HTMLInputElement>('input[type="date"]');
  const situacao = el.situacao.querySelector('select');
  const responsavel = el.responsavel.querySelector('select');
  if (!nascimento || !situacao || !responsavel) {
    throw new Error('Campos do cadastro indisponíveis.');
  }

  const redesenhar = {
    'birth-date': () => ilhaNascimento.atualizar(desenharNascimento()),
    'case-status': () => ilhaSituacao.atualizar(desenharSituacao()),
    'case-manager': () => ilhaResponsavel.atualizar(desenharResponsavel()),
  };

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
    const lugarTipo = elemento('div');
    const desmontarTipo = ilha(
      lugarTipo,
      <SelecaoAprimorada id={rotuloTipo.htmlFor} aria-label={`Tipo do contato ${numero}`}>
        <option value="email">E-mail</option>
        <option value="telefone">Telefone</option>
      </SelecaoAprimorada>,
    );
    const tipo = lugarTipo.querySelector('select');
    if (!tipo) throw new Error('Tipo do contato indisponível.');
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
    const remover = botao({ rotulo: 'Remover', peso: 'secundario' });
    remover.classList.add('contact-remove');
    remover.setAttribute('aria-label', `Remover contato ${numero}`);
    const linha: Linha = { raiz, tipo, valor, desmontarTipo };
    remover.addEventListener('click', () => {
      linhas = linhas.filter((item) => item !== linha);
      desmontarTipo();
      raiz.remove();
      atualizarBotoes();
      (linhas[linhas.length - 1]?.valor ?? el.adicionar).focus();
    });
    raiz.append(rotuloTipo, lugarTipo, rotuloValor, valor, remover);
    el.contatos.append(raiz);
    linhas.push(linha);
    atualizarBotoes();
    return linha;
  };

  el.adicionar.addEventListener('click', () => adicionarLinha()?.valor.focus());

  const carregarResponsaveis = async () => {
    const minhaCarga = ++carga;
    equipeDisponivel = false;
    responsaveis = [];
    carregando = true;
    redesenhar['case-manager']();
    el.tentarNovamente.hidden = true;
    el.estadoResponsavel.textContent = 'Carregando equipe…';
    try {
      const opcoes = (await listarResponsaveis()).filter((opcao) => opcao.ativo);
      if (minhaCarga !== carga) return;
      responsaveis = opcoes;
      equipeDisponivel = opcoes.length > 0;
      el.estadoResponsavel.textContent = equipeDisponivel
        ? ''
        : 'Nenhuma pessoa ativa da equipe para indicar. O cadastro não pode ser enviado.';
    } catch {
      if (minhaCarga !== carga) return;
      el.estadoResponsavel.textContent =
        'Não foi possível carregar a equipe. O cadastro não pode ser enviado agora.';
      el.tentarNovamente.hidden = false;
    } finally {
      if (minhaCarga === carga) {
        carregando = false;
        redesenhar['case-manager']();
      }
    }
  };
  el.tentarNovamente.addEventListener('click', () => void carregarResponsaveis());

  /** Sem permissão para listar a equipe não há como indicar o responsável: o cadastro não é enviado. */
  const equipeIndisponivel = (mensagem: string) => {
    carga += 1;
    carregando = false;
    equipeDisponivel = false;
    responsaveis = [];
    redesenhar['case-manager']();
    el.tentarNovamente.hidden = true;
    el.estadoResponsavel.textContent = mensagem;
  };

  const reiniciar = () => {
    for (const linha of linhas) {
      linha.desmontarTipo();
      linha.raiz.remove();
    }
    linhas = [];
    proximoNumero = 1;
    adicionarLinha();
    for (const campo of [situacao, responsavel]) definirValorNativo(campo, '');
    el.erroContatos.textContent = '';
  };
  reiniciar();

  return {
    campos: { nascimento, situacao, responsavel },
    marcarInvalido(campo: CampoEstatico, invalido: boolean) {
      if (invalidos.has(campo) === invalido) return;
      if (invalido) invalidos.add(campo);
      else invalidos.delete(campo);
      redesenhar[campo]();
    },
    carregarResponsaveis,
    equipeIndisponivel,
    reiniciar,
    /** Descarta uma consulta de equipe em andamento, por exemplo ao encerrar a sessão. */
    cancelarCarga: () => equipeIndisponivel(''),
    /** Linhas com algo digitado; linhas vazias não contam como contato. */
    contatos: (): ContatoDigitado[] =>
      linhas
        .filter((linha) => linha.valor.value.trim() !== '')
        .map((linha) => ({
          tipo: linha.tipo.value as 'email' | 'telefone',
          valor: linha.valor.value,
        })),
    situacao: (): SituacaoCaso | undefined =>
      (situacao.value || undefined) as SituacaoCaso | undefined,
    responsavelId: () => responsavel.value || undefined,
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
