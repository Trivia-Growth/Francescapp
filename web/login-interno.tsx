import {
  type Ref,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import type { ClienteFFCM } from './api.ts';
import { exigeNovoAcesso, mensagemFalha } from './api.ts';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { criarServicoConfirmacaoInterna } from './servico-acessos-http.js';
import { Formulario } from './telas/formulario.js';

type Sessao = Awaited<ReturnType<ClienteFFCM['entrarInterno']>>;
type Opcoes = { podeIniciar(): boolean; ocupacao(valor: boolean): void };

export type ComandoLoginInterno = { limpar(): void };

/** A confirmação valida o e-mail. A sessão só pode ser aberta pelo login com senha. */
export function TelaLoginInterno({
  api,
  aoEntrar,
  opcoes,
  comando,
}: {
  api: ClienteFFCM;
  aoEntrar: (sessao: Sessao) => Promise<void>;
  opcoes?: Opcoes;
  comando: Ref<ComandoLoginInterno>;
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
    emailRef.current?.form?.reset();
    emailConfirmacaoRef.current?.form?.reset();
    flushSync(() => {
      definirFeedback('');
      definirConfirmFeedback('');
      bloquear(false);
    });
  }, [servicoOtp, bloquear]);

  useImperativeHandle(comando, () => ({ limpar }), [limpar]);
  useLayoutEffect(
    () => () => {
      geracaoRef.current += 1;
      if (ocupadaRef.current) opcoesRef.current?.ocupacao(false);
      servicoOtp.desmontar();
    },
    [servicoOtp],
  );

  return (
    <>
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
          <Campo
            ref={emailRef}
            id="interno-email"
            rotulo="E-mail"
            name="email"
            tipo="email"
            autoComplete="username"
            required
            maxLength={254}
            autoCapitalize="none"
            spellCheck={false}
          />
          <Campo
            ref={senhaRef}
            id="interno-senha"
            rotulo="Senha"
            name="senha"
            tipo="password"
            autoComplete="current-password"
            required
            maxLength={1024}
          />
          <Botao largo peso="principal" tipo="submit">
            Entrar com e-mail e senha
          </Botao>
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
          <Campo
            ref={emailConfirmacaoRef}
            id="interno-confirmacao-email"
            rotulo="E-mail da conta interna"
            tipo="email"
            required
            maxLength={254}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            disabled={ocupada}
          />
          <Botao
            id="interno-confirmacao-solicitar"
            peso="secundario"
            disabled={ocupada}
            aoAtivar={aoClicarSolicitar}
          >
            Enviar código de confirmação
          </Botao>
          <Campo
            ref={codigoRef}
            id="interno-confirmacao-codigo"
            rotulo="Código recebido por e-mail"
            inputMode="numeric"
            pattern="[0-9]{6,10}"
            minLength={6}
            maxLength={10}
            required
            autoComplete="one-time-code"
            spellCheck={false}
            disabled={ocupada}
          />
          <Botao
            id="interno-confirmacao-verificar"
            peso="secundario"
            tipo="submit"
            disabled={ocupada}
          >
            Verificar código
          </Botao>
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
