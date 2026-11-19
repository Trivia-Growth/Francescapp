import type { ClienteFFCM } from './api.ts';
import { exigeNovoAcesso, mensagemFalha } from './api.ts';
import { criarServicoConfirmacaoInterna } from './servico-acessos-http.ts';

/** OTP comprova e-mail no servidor; só login com senha pode abrir sessão do produto. */
export function montarLoginInterno(
  raiz: HTMLElement,
  api: ClienteFFCM,
  aoEntrar: (sessao: Awaited<ReturnType<ClienteFFCM['entrarInterno']>>) => Promise<void>,
  opcoes?: { podeIniciar(): boolean; ocupacao(valor: boolean): void },
) {
  const obter = <T extends HTMLElement>(id: string) => {
    const elemento = raiz.querySelector<T>(`#${id}`);
    if (!elemento) throw new Error('Campo de acesso indisponível.');
    return elemento;
  };
  const form = obter<HTMLFormElement>('interno-login-form');
  const campos = obter<HTMLFieldSetElement>('interno-login-fields');
  const email = obter<HTMLInputElement>('interno-email');
  const senha = obter<HTMLInputElement>('interno-senha');
  const feedback = obter<HTMLElement>('interno-feedback');
  const confirmacao = obter<HTMLFormElement>('interno-confirmacao-form');
  const emailConfirmacao = obter<HTMLInputElement>('interno-confirmacao-email');
  const codigo = obter<HTMLInputElement>('interno-confirmacao-codigo');
  const solicitar = obter<HTMLButtonElement>('interno-confirmacao-solicitar');
  const verificar = obter<HTMLButtonElement>('interno-confirmacao-verificar');
  const statusConfirmacao = obter<HTMLElement>('interno-confirmacao-feedback');
  const servico = criarServicoConfirmacaoInterna();
  let geracao = 0;
  let ocupada = false;
  const bloquear = (valor: boolean) => {
    opcoes?.ocupacao(valor);
    campos.disabled = valor;
    solicitar.disabled = verificar.disabled = emailConfirmacao.disabled = codigo.disabled = valor;
    raiz.setAttribute('aria-busy', String(valor));
  };
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (ocupada || opcoes?.podeIniciar() === false) return;
    const alvo = email.value.trim();
    let segredo = senha.value;
    senha.value = '';
    codigo.value = '';
    const versao = geracao;
    ocupada = true;
    bloquear(true);
    feedback.textContent = 'Verificando credenciais e autorização…';
    try {
      const sessao = await api.entrarInterno(alvo, segredo);
      segredo = '';
      if (versao !== geracao) return;
      feedback.textContent = '';
      await aoEntrar(sessao);
    } catch (erro) {
      if (versao !== geracao) return;
      feedback.textContent = exigeNovoAcesso(erro)
        ? 'Entrada não autorizada. Confira as credenciais, a confirmação do e-mail e a liberação pela administração.'
        : mensagemFalha(erro);
    } finally {
      segredo = '';
      if (versao === geracao) {
        ocupada = false;
        bloquear(false);
      }
    }
  });
  async function executarConfirmacao(acao: () => Promise<void>, mensagem: string) {
    if (ocupada || opcoes?.podeIniciar() === false) return;
    const versao = geracao;
    ocupada = true;
    bloquear(true);
    statusConfirmacao.textContent = 'Processando confirmação…';
    try {
      await acao();
      if (versao === geracao) statusConfirmacao.textContent = mensagem;
    } catch {
      if (versao === geracao)
        statusConfirmacao.textContent =
          'Não foi possível processar a confirmação agora. O serviço de e-mail pode estar indisponível. Tente novamente mais tarde.';
    } finally {
      if (versao === geracao) {
        ocupada = false;
        bloquear(false);
      }
    }
  }
  solicitar.addEventListener('click', () => {
    if (ocupada || !emailConfirmacao.reportValidity()) return;
    senha.value = '';
    codigo.value = '';
    const alvo = emailConfirmacao.value.trim();
    void executarConfirmacao(
      () => servico.solicitar(alvo),
      'Se houver uma conta interna elegível, o código será enviado ao e-mail informado. Confira também o spam.',
    );
  });
  confirmacao.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (ocupada || !emailConfirmacao.reportValidity() || !codigo.reportValidity()) return;
    const alvo = emailConfirmacao.value.trim();
    let valor = codigo.value;
    codigo.value = '';
    senha.value = '';
    void executarConfirmacao(async () => {
      try {
        await servico.verificar(alvo, valor);
      } finally {
        valor = '';
      }
    }, 'Código processado. Se for válido, você poderá entrar com e-mail e senha. A confirmação não abre uma sessão.');
  });
  return {
    limpar() {
      geracao += 1;
      ocupada = false;
      servico.cancelar();
      form.reset();
      confirmacao.reset();
      feedback.textContent = statusConfirmacao.textContent = '';
      bloquear(false);
    },
  };
}
