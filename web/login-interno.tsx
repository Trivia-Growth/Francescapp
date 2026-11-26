import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ClienteFFCM } from './api.ts';
import { exigeNovoAcesso, mensagemFalha } from './api.ts';
import { ilha } from './ponte/ilha.js';
import { criarServicoConfirmacaoInterna } from './servico-acessos-http.js';
import { Formulario } from './telas/formulario.js';

type Sessao = Awaited<ReturnType<ClienteFFCM['entrarInterno']>>;
type Opcoes = { podeIniciar(): boolean; ocupacao(valor: boolean): void };

/** OTP comprova e-mail no servidor; só login com senha pode abrir sessão do produto.
 *
 * `raiz` é o `<details id="acesso-interno">` que já existe em `web/index.html`: esta tela
 * substitui só o CONTEÚDO dele (resumo, os dois formulários, os dois recados), nunca o
 * próprio elemento — é por isso que `aria-busy` é escrito nele diretamente no corpo do
 * componente, e não por uma `className` na árvore que esta função desenha.
 *
 * O contrato exportado não muda: `montarLoginInterno(raiz, api, aoEntrar, opcoes) =>
 * { limpar() }`. Nenhum fluxo de autorização muda — a senha some do controle antes mesmo de
 * a chamada partir, a confirmação de e-mail nunca abre sessão, e um `aoEntrar` que lança
 * cai no mesmo tratamento de erro da credencial. */
export function montarLoginInterno(
  raiz: HTMLElement,
  api: ClienteFFCM,
  aoEntrar: (sessao: Sessao) => Promise<void>,
  opcoes?: Opcoes,
): { limpar(): void } {
  let limparAtual: () => void = () => {};
  ilha(
    raiz,
    <TelaLoginInterno
      raiz={raiz}
      api={api}
      aoEntrar={aoEntrar}
      opcoes={opcoes}
      expor={(exposta) => {
        limparAtual = exposta.limpar;
      }}
    />,
  );
  return { limpar: () => limparAtual() };
}

function TelaLoginInterno({
  raiz,
  api,
  aoEntrar,
  opcoes,
  expor,
}: {
  raiz: HTMLElement;
  api: ClienteFFCM;
  aoEntrar: (sessao: Sessao) => Promise<void>;
  opcoes?: Opcoes;
  expor: (api: { limpar(): void }) => void;
}) {
  const [ocupada, definirOcupadaEstado] = useState(false);
  const [feedback, definirFeedback] = useState('');
  const [confirmFeedback, definirConfirmFeedback] = useState('');

  const [servicoOtp] = useState(() => criarServicoConfirmacaoInterna());

  const apiRef = useRef(api);
  apiRef.current = api;
  const aoEntrarRef = useRef(aoEntrar);
  aoEntrarRef.current = aoEntrar;
  const opcoesRef = useRef(opcoes);
  opcoesRef.current = opcoes;

  const geracaoRef = useRef(0);
  const ocupadaRef = useRef(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const senhaRef = useRef<HTMLInputElement>(null);
  const codigoRef = useRef<HTMLInputElement>(null);
  const emailConfirmacaoRef = useRef<HTMLInputElement>(null);

  const bloquear = useCallback((valor: boolean) => {
    opcoesRef.current?.ocupacao(valor);
    definirOcupadaEstado(valor);
  }, []);

  const aoEnviarLogin = useCallback(
    (_formulario: HTMLFormElement) => {
      if (ocupadaRef.current || opcoesRef.current?.podeIniciar() === false) return;
      const emailEl = emailRef.current;
      const senhaEl = senhaRef.current;
      if (!emailEl || !senhaEl) return;
      const alvo = emailEl.value.trim();
      let segredo = senhaEl.value;
      senhaEl.value = '';
      if (codigoRef.current) codigoRef.current.value = '';
      const versao = geracaoRef.current;
      ocupadaRef.current = true;
      bloquear(true);
      definirFeedback('Verificando credenciais e autorização…');
      void (async () => {
        try {
          const sessao = await apiRef.current.entrarInterno(alvo, segredo);
          segredo = '';
          if (versao !== geracaoRef.current) return;
          flushSync(() => definirFeedback(''));
          await aoEntrarRef.current(sessao);
        } catch (erro) {
          if (versao !== geracaoRef.current) return;
          flushSync(() =>
            definirFeedback(
              exigeNovoAcesso(erro)
                ? 'Entrada não autorizada. Confira as credenciais, a confirmação do e-mail e a liberação pela administração.'
                : mensagemFalha(erro),
            ),
          );
        } finally {
          segredo = '';
          if (versao === geracaoRef.current) {
            ocupadaRef.current = false;
            flushSync(() => bloquear(false));
          }
        }
      })();
    },
    [bloquear],
  );

  const executarConfirmacao = useCallback(
    async (acao: () => Promise<void>, mensagem: string) => {
      if (ocupadaRef.current || opcoesRef.current?.podeIniciar() === false) return;
      const versao = geracaoRef.current;
      ocupadaRef.current = true;
      flushSync(() => {
        bloquear(true);
        definirConfirmFeedback('Processando confirmação…');
      });
      try {
        await acao();
        if (versao === geracaoRef.current) flushSync(() => definirConfirmFeedback(mensagem));
      } catch {
        if (versao === geracaoRef.current)
          flushSync(() =>
            definirConfirmFeedback(
              'Não foi possível processar a confirmação agora. O serviço de e-mail pode estar indisponível. Tente novamente mais tarde.',
            ),
          );
      } finally {
        if (versao === geracaoRef.current) {
          ocupadaRef.current = false;
          flushSync(() => bloquear(false));
        }
      }
    },
    [bloquear],
  );

  const aoClicarSolicitar = useCallback(() => {
    const emailConfirmacaoEl = emailConfirmacaoRef.current;
    if (ocupadaRef.current || !emailConfirmacaoEl?.reportValidity()) return;
    if (senhaRef.current) senhaRef.current.value = '';
    if (codigoRef.current) codigoRef.current.value = '';
    const alvo = emailConfirmacaoEl.value.trim();
    void executarConfirmacao(
      () => servicoOtp.solicitar(alvo),
      'Se houver uma conta interna elegível, o código será enviado ao e-mail informado. Confira também o spam.',
    );
  }, [executarConfirmacao, servicoOtp]);

  const aoEnviarConfirmacao = useCallback(
    (_formulario: HTMLFormElement) => {
      const emailConfirmacaoEl = emailConfirmacaoRef.current;
      const codigoEl = codigoRef.current;
      if (
        ocupadaRef.current ||
        !emailConfirmacaoEl?.reportValidity() ||
        !codigoEl?.reportValidity()
      )
        return;
      const alvo = emailConfirmacaoEl.value.trim();
      let valor = codigoEl.value;
      codigoEl.value = '';
      if (senhaRef.current) senhaRef.current.value = '';
      void executarConfirmacao(async () => {
        try {
          await servicoOtp.verificar(alvo, valor);
        } finally {
          valor = '';
        }
      }, 'Código processado. Se for válido, você poderá entrar com e-mail e senha. A confirmação não abre uma sessão.');
    },
    [executarConfirmacao, servicoOtp],
  );

  const limpar = useCallback(() => {
    geracaoRef.current += 1;
    ocupadaRef.current = false;
    servicoOtp.cancelar();
    raiz.querySelector<HTMLFormElement>('#interno-login-form')?.reset();
    raiz.querySelector<HTMLFormElement>('#interno-confirmacao-form')?.reset();
    flushSync(() => {
      definirFeedback('');
      definirConfirmFeedback('');
      bloquear(false);
    });
  }, [raiz, servicoOtp, bloquear]);

  /* Fora de efeito, de propósito — mesma razão de `web/avisos.tsx`: `aria-busy` é atributo
   * do `<details>` que `main.ts` já segura (`raiz`), não um nó que esta árvore desenha; e
   * `expor` precisa estar pronto antes de `ilha()` devolver, porque `main.ts:1638` chama
   * `loginInterno.limpar()` a qualquer momento depois de montar, sem esperar efeito nenhum. */
  raiz.setAttribute('aria-busy', String(ocupada));
  expor({ limpar });

  return (
    <>
      <summary>Entrar com e-mail e senha</summary>
      <p>Para contas internas criadas pela administração.</p>
      <Formulario
        id="interno-login-form"
        method="post"
        autoComplete="on"
        aria-describedby="interno-feedback"
        aoEnviar={aoEnviarLogin}
      >
        <fieldset id="interno-login-fields" disabled={ocupada}>
          <legend className="sr-only">Credenciais da conta interna</legend>
          <div className="ui-campo">
            <label className="ui-campo__rotulo" htmlFor="interno-email">
              E-mail
            </label>
            <input
              ref={emailRef}
              className="ui-campo__controle"
              id="interno-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
          <div className="ui-campo">
            <label className="ui-campo__rotulo" htmlFor="interno-senha">
              Senha
            </label>
            <input
              ref={senhaRef}
              className="ui-campo__controle"
              id="interno-senha"
              name="senha"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
            />
          </div>
          <button className="ui-botao ui-botao--largo" data-peso="principal" type="submit">
            Entrar com e-mail e senha
          </button>
        </fieldset>
      </Formulario>

      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as provas já usam. */}
      <p
        role="status"
        id="interno-feedback"
        className="feedback"
        aria-live="polite"
        aria-atomic="true"
      >
        {feedback}
      </p>
      <details>
        <summary>Confirmar o e-mail da conta interna</summary>
        <p>
          Confirme o endereço antes da primeira entrada. Solicitar ou informar um código não abre
          uma sessão.
        </p>
        <Formulario
          id="interno-confirmacao-form"
          method="post"
          autoComplete="off"
          aria-describedby="interno-confirmacao-feedback"
          aoEnviar={aoEnviarConfirmacao}
        >
          <div className="ui-campo">
            <label className="ui-campo__rotulo" htmlFor="interno-confirmacao-email">
              E-mail da conta interna
            </label>
            <input
              ref={emailConfirmacaoRef}
              className="ui-campo__controle"
              id="interno-confirmacao-email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              disabled={ocupada}
            />
          </div>
          <button
            id="interno-confirmacao-solicitar"
            className="ui-botao"
            data-peso="secundario"
            type="button"
            disabled={ocupada}
            onClick={aoClicarSolicitar}
          >
            Enviar código de confirmação
          </button>
          <div className="ui-campo">
            <label className="ui-campo__rotulo" htmlFor="interno-confirmacao-codigo">
              Código recebido por e-mail
            </label>
            <input
              ref={codigoRef}
              className="ui-campo__controle"
              id="interno-confirmacao-codigo"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6,10}"
              minLength={6}
              maxLength={10}
              required
              autoComplete="one-time-code"
              spellCheck={false}
              disabled={ocupada}
            />
          </div>
          <button
            id="interno-confirmacao-verificar"
            className="ui-botao"
            data-peso="secundario"
            type="submit"
            disabled={ocupada}
          >
            Verificar código
          </button>
        </Formulario>

        {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
        <p
          role="status"
          id="interno-confirmacao-feedback"
          className="feedback"
          aria-live="polite"
          aria-atomic="true"
        >
          {confirmFeedback}
        </p>
      </details>
    </>
  );
}
