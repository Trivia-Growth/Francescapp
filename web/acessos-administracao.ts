import {
  criarAcessoSchema,
  type Acesso,
  type FuncaoConta,
} from '../packages/contracts/src/acessos.ts';
import { uuidSchema } from '../packages/contracts/src/comum.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi, exigeNovoAcesso } from './api.ts';
import { esqueletoCarregando } from './esqueleto.ts';
import type { ServicoAcessos } from './servico-acessos-http.ts';

const funcoes: Record<FuncaoConta, string> = {
  administrador: 'Administrador',
  case_manager: 'Case Manager',
  familia: 'Familiar',
  profissional: 'Profissional',
};
const estados: Record<Acesso['estado'], string> = {
  reservado: 'Criação ainda não confirmada',
  aguardando_confirmacao_email: 'Aguardando confirmação do e-mail',
  aguardando_google: 'Aguardando primeira entrada com Google',
  ativo: 'Acesso ativo',
  conflito: 'Conflito: conta existente não alterada',
  falha_confirmada:
    'Criação recusada; nenhuma conta criada. Confira a política da senha antes de cadastrar novamente',
};

/** Conta e método não atribuem caso. Só a operação opaca sobrevive a uma recarga. */
export function montarAcessosAdministracao(
  raiz: HTMLElement,
  servico: ServicoAcessos,
  opcoes: {
    identidadeAtual(): { usuario_id: string; session_id: string } | null;
    acessoPerdido(erro: unknown): void;
  },
) {
  let ativa = true;
  let ocupada = false;
  let cursor: string | null = null;
  const identidade = opcoes.identidadeAtual();
  const chaveRecuperacao = identidade
    ? `acesso-operacao:${identidade.usuario_id}:${identidade.session_id}`
    : null;
  let operacaoPendente: string | null = null;
  let recuperacaoDisponivel = true;
  let listaConfirmada = false;
  const el = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const elemento = document.createElement(tipo);
    if (texto) elemento.textContent = texto;
    return elemento;
  };
  const titulo = el('h2', 'Acessos ao sistema');
  const explicacao = el(
    'p',
    'Crie contas autorizadas. Cada pessoa terá uma função e um método de entrada. Casos e permissões clínicas continuam sendo concedidos separadamente.',
  );
  const status = el('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const lista = el('ul');
  lista.className = 'acessos-lista';
  const atualizar = el('button', 'Atualizar acessos');
  atualizar.type = 'button';
  atualizar.className = 'button-secondary';
  const mais = el('button', 'Carregar mais acessos');
  mais.type = 'button';
  mais.className = 'button-secondary';
  mais.hidden = true;
  const conferir = el('button', 'Conferir cadastro pendente');
  conferir.type = 'button';
  conferir.className = 'button-secondary';
  conferir.hidden = true;
  const formulario = el('form');
  formulario.method = 'post';
  formulario.noValidate = true;
  const campos = el('fieldset');
  campos.append(el('legend', 'Novo acesso'));
  const campo = <T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    rotulo: string,
    controle: T,
  ) => {
    const label = el('label', rotulo);
    controle.required = true;
    label.append(controle);
    campos.append(label);
    return controle;
  };
  const nome = campo('Nome', el('input'));
  nome.maxLength = 200;
  nome.autocomplete = 'name';
  const email = campo('E-mail usado para entrar', el('input'));
  email.type = 'email';
  email.maxLength = 254;
  email.autocomplete = 'off';
  email.autocapitalize = 'none';
  email.spellcheck = false;
  const funcao = campo('Função', el('select'));
  const vazia = el('option', 'Selecione a função');
  vazia.value = '';
  funcao.append(vazia);
  for (const [valor, texto] of Object.entries(funcoes)) {
    const opcao = el('option', texto);
    opcao.value = valor;
    funcao.append(opcao);
  }
  const metodo = campo('Como esta pessoa entrará', el('select'));
  for (const [valor, texto] of [
    ['', 'Selecione o método'],
    ['google_workspace', 'Google da organização'],
    ['interno', 'E-mail e senha'],
  ]) {
    const opcao = el('option', texto);
    opcao.value = valor ?? '';
    metodo.append(opcao);
  }
  const senha = campo('Senha inicial (pelo menos 12 caracteres)', el('input'));
  senha.type = 'password';
  senha.minLength = 12;
  senha.maxLength = 1024;
  senha.autocomplete = 'new-password';
  const senhaRotulo = senha.parentElement as HTMLLabelElement;
  senhaRotulo.hidden = true;
  senha.required = false;
  senha.disabled = true;
  const motivo = campo('Motivo da concessão', el('textarea'));
  motivo.maxLength = 500;
  const criar = el('button', 'Criar acesso');
  criar.type = 'submit';
  criar.className = 'button-primary';
  campos.append(criar);
  formulario.append(campos);
  raiz.classList.add('acessos-administracao');
  raiz.replaceChildren(titulo, explicacao, status, atualizar, conferir, lista, mais, formulario);
  const atual = () => {
    const sessao = opcoes.identidadeAtual();
    return (
      ativa &&
      identidade &&
      sessao?.usuario_id === identidade.usuario_id &&
      sessao.session_id === identidade.session_id
    );
  };
  const controles = () => {
    campos.disabled =
      ocupada || Boolean(operacaoPendente) || !recuperacaoDisponivel || !listaConfirmada;
    atualizar.disabled = mais.disabled = conferir.disabled = ocupada;
    conferir.hidden = !operacaoPendente;
    raiz.setAttribute('aria-busy', String(ocupada));
  };
  function guardarOperacao(id: string | null) {
    if (!chaveRecuperacao) throw new FalhaApi('nao_autenticado', 401);
    if (id) {
      sessionStorage.setItem(chaveRecuperacao, id);
      if (sessionStorage.getItem(chaveRecuperacao) !== id) throw new Error();
    } else sessionStorage.removeItem(chaveRecuperacao);
    operacaoPendente = id;
  }
  function mostrarItem(item: Acesso) {
    const linha = el('li');
    linha.dataset.operacao = item.operacao_id;
    linha.append(
      el('h3', item.nome),
      el('p', item.email),
      el(
        'p',
        `${funcoes[item.funcao]} · ${item.metodo === 'interno' ? 'E-mail e senha' : 'Google da organização'}`,
      ),
      el('p', estados[item.estado]),
      el('p', `Cadastrado em ${new Date(item.criado_em).toLocaleString('pt-BR')}`),
    );
    if (item.estado !== 'conflito' && item.estado !== 'falha_confirmada') {
      const consultar = el('button', 'Conferir situação');
      consultar.type = 'button';
      consultar.className = 'button-secondary';
      consultar.addEventListener(
        'click',
        () =>
          void executar(async () => {
            const confirmado = await servico.consultarOperacao(item.operacao_id);
            if (!atual()) return;
            if (!confirmado) {
              status.textContent = 'Não foi possível confirmar a situação deste cadastro.';
              return;
            }
            if (confirmado.operacao_id !== item.operacao_id) throw new Error();
            if (operacaoPendente === confirmado.operacao_id && confirmado.estado !== 'reservado') {
              guardarOperacao(null);
              formulario.reset();
              senha.value = '';
              senhaRotulo.hidden = true;
              senha.disabled = true;
              senha.required = false;
            }
            linha.replaceWith(mostrarItem(confirmado));
            status.textContent = `${estados[confirmado.estado]}.`;
          }),
      );
      linha.append(consultar);
    }
    return linha;
  }
  async function executar(acao: () => Promise<void>) {
    if (ocupada || !atual()) return;
    ocupada = true;
    controles();
    try {
      await acao();
    } catch (erro) {
      if (!atual()) return;
      if (exigeNovoAcesso(erro)) {
        senha.value = '';
        opcoes.acessoPerdido(erro);
        return;
      }
      status.textContent = operacaoPendente
        ? 'Cadastro sem confirmação. Confira a operação antes de criar outro acesso. A senha foi descartada e não será reenviada.'
        : 'Não foi possível consultar os acessos. Tente atualizar.';
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function carregar(adicionar = false) {
    listaConfirmada = false;
    status.textContent = 'Consultando acessos…';
    let carga: HTMLLIElement | undefined;
    if (!adicionar && !lista.hasChildNodes()) {
      carga = el('li');
      carga.append(esqueletoCarregando(3));
      lista.append(carga);
    }
    let pagina: Awaited<ReturnType<ServicoAcessos['listar']>>;
    try {
      pagina = await servico.listar(adicionar ? (cursor ?? undefined) : undefined);
    } finally {
      carga?.remove();
    }
    if (!atual()) return;
    listaConfirmada = true;
    if (!adicionar) lista.replaceChildren();
    for (const item of pagina.itens) lista.append(mostrarItem(item));
    cursor = pagina.proximo_cursor;
    mais.hidden = !cursor;
    status.textContent =
      pagina.itens.length || adicionar
        ? 'Acessos consultados.'
        : 'Nenhum acesso criado por esta administração ainda. Preencha o novo acesso abaixo.';
    if (operacaoPendente) status.textContent += ' Há um cadastro pendente de conferência.';
    if (!recuperacaoDisponivel)
      status.textContent += ' Recuperação local indisponível. Criação bloqueada; reabra a sessão.';
  }
  async function recuperar() {
    if (!operacaoPendente) return;
    const item = await servico.consultarOperacao(operacaoPendente);
    if (!atual()) return;
    if (!item || item.estado === 'reservado') {
      status.textContent =
        'Resultado ainda não confirmado. A criação continua bloqueada; confira novamente mais tarde.';
      return;
    }
    if (item.operacao_id !== operacaoPendente) throw new Error();
    guardarOperacao(null);
    formulario.reset();
    senha.value = '';
    senhaRotulo.hidden = true;
    senha.disabled = true;
    senha.required = false;
    await carregar();
    if (atual()) status.textContent = `${estados[item.estado]}. Nenhuma senha foi reenviada.`;
  }
  metodo.addEventListener('change', () => {
    senha.value = '';
    const interno = metodo.value === 'interno';
    senhaRotulo.hidden = !interno;
    senha.disabled = !interno;
    senha.required = interno;
  });
  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (ocupada || operacaoPendente || !recuperacaoDisponivel || !listaConfirmada || !atual())
      return;
    const operacaoId = crypto.randomUUID();
    const dados = criarAcessoSchema.safeParse({
      operacao_id: operacaoId,
      nome: nome.value,
      email: email.value,
      funcao: funcao.value,
      metodo: metodo.value,
      motivo: motivo.value,
      ...(metodo.value === 'interno' ? { senha: senha.value } : {}),
    });
    if (!dados.success) {
      status.textContent =
        'Confira nome, e-mail, função, método e motivo. A senha interna precisa de pelo menos 12 caracteres.';
      nome.focus();
      return;
    }
    senha.value = '';
    void executar(async () => {
      guardarOperacao(operacaoId);
      status.textContent = 'Criando acesso… A senha não ficará disponível para consulta.';
      let resultado: Acesso;
      try {
        resultado = await servico.criar(dados.data, crypto.randomUUID());
      } catch (erro) {
        // Só negativa HTTP coerente garante que a criação foi recusada. Ausência
        // de operação após timeout não cerca uma requisição ainda em execução.
        if (
          atual() &&
          erro instanceof FalhaApi &&
          !erro.exigeReautenticacao &&
          ((erro.codigo === 'entrada_invalida' &&
            erro.status === statusErroHttp.entrada_invalida) ||
            (erro.codigo === 'conflito' && erro.status === statusErroHttp.conflito) ||
            (erro.codigo === 'conflito_idempotencia' &&
              erro.status === statusErroHttp.conflito_idempotencia))
        ) {
          guardarOperacao(null);
          status.textContent =
            'Cadastro recusado. Confira os dados ou use outro e-mail. Nenhuma conta existente foi alterada; informe a senha novamente apenas para um novo envio.';
          return;
        }
        throw erro;
      }
      if (!atual()) return;
      if (resultado.operacao_id !== operacaoId) throw new Error();
      if (resultado.estado === 'reservado') {
        status.textContent = 'Criação ainda não confirmada. Use Conferir cadastro pendente.';
        return;
      }
      guardarOperacao(null);
      formulario.reset();
      senhaRotulo.hidden = true;
      senha.disabled = true;
      senha.required = false;
      await carregar();
      if (atual()) status.textContent = `${estados[resultado.estado]}.`;
    });
  });
  atualizar.addEventListener('click', () => void executar(() => carregar()));
  mais.addEventListener('click', () => {
    if (cursor) void executar(() => carregar(true));
  });
  conferir.addEventListener('click', () => void executar(recuperar));
  try {
    const salvo = chaveRecuperacao ? sessionStorage.getItem(chaveRecuperacao) : null;
    if (salvo && uuidSchema.safeParse(salvo).success) operacaoPendente = salvo;
  } catch {
    recuperacaoDisponivel = false;
    status.textContent =
      'Armazenamento de recuperação indisponível. Reabra a sessão antes de criar acesso.';
  }
  controles();
  void executar(() => carregar());
  return () => {
    ativa = false;
    senha.value = '';
    formulario.reset();
    servico.desmontar();
    raiz.replaceChildren();
    raiz.classList.remove('acessos-administracao');
  };
}
