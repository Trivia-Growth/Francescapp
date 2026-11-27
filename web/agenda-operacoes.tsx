/** Criar, alterar e cancelar compromisso na agenda Google, reconstruído em React sobre a
 *  ilha (`web/ponte/ilha.ts`).
 *
 *  O hospedeiro é `web/agenda-individual.tsx`, migrado na MESMA leva: o punho que este
 *  componente entrega (`registrar` → `{ editar, cancelar }`) segue o padrão já usado em
 *  `web/revogacao-vinculo.tsx` para expor uma ação disparada por um clique em outra parte
 *  da árvore (a lista de compromissos) sem duplicar o estado de "qual operação está
 *  aberta".
 *
 *  O bloqueio por operação pendente (`incerto`/`ocupado`) e o marcador de envio sem
 *  resposta por usuário (`localStorage`) continuam exatamente como na versão imperativa:
 *  não são efeito de montagem, são proteção contra operação duplicada contra o Google
 *  Calendar — por isso vivem em refs lidos por fluxos assíncronos, não só em estado.
 *
 *  VIS-012: a versão imperativa guardava `ativa` e testava `if (!ativa) return` em cada
 *  retomada de `await`. Aqui não sobra nenhuma: desmontar a ilha cancela os efeitos, e
 *  `setState` depois disso não produz tela nenhuma. */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';

type Evento = { id: string; inicio: string; fim: string; etag?: string };
type Acao = 'criar' | 'alterar' | 'cancelar';

function horarioSaoPaulo(valor: string): string {
  // Converte a hora civil usando as regras do fuso, inclusive eventuais mudanças futuras.
  const partes = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(valor);
  if (!partes) throw new Error();
  const civil = Date.UTC(
    Number(partes[1]),
    Number(partes[2]) - 1,
    Number(partes[3]),
    Number(partes[4]),
    Number(partes[5]),
  );
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  let instante = civil;
  for (let i = 0; i < 2; i += 1) {
    const campos = Object.fromEntries(
      formato.formatToParts(instante).map((parte) => [parte.type, parte.value]),
    );
    const observado = Date.UTC(
      Number(campos.year),
      Number(campos.month) - 1,
      Number(campos.day),
      Number(campos.hour),
      Number(campos.minute),
    );
    instante += civil - observado;
  }
  const campos = Object.fromEntries(
    formato.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  );
  if (`${campos.year}-${campos.month}-${campos.day}T${campos.hour}:${campos.minute}` !== valor)
    throw new Error();
  return new Date(instante).toISOString();
}

function campoLocal(valor: string): string {
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(
    formato.formatToParts(new Date(valor)).map((parte) => [parte.type, parte.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export type PunhoOperacoes = {
  editar: (item: Evento) => void;
  cancelar: (item: Evento) => void;
};

type PropsOperacoesAgenda = {
  cabecalhos: () => Headers;
  atualizar: () => void;
  usuarioId: string;
  registrar: (punho: PunhoOperacoes) => void;
};

function lerEnvioSemResposta(usuarioId: string): { legado: boolean; semResposta: boolean } {
  const marcador = `ffcm-agenda-operacao-incerta:${usuarioId}`;
  const marcadorLegado = 'ffcm-agenda-operacao-incerta';
  try {
    // Marcador antigo não identifica usuário; nenhuma conta pode apagá-lo por inferência.
    const legado = localStorage.getItem(marcadorLegado) !== null;
    return { legado, semResposta: legado || localStorage.getItem(marcador) !== null };
  } catch {
    return { legado: false, semResposta: true };
  }
}

export function OperacoesAgenda({
  cabecalhos,
  atualizar,
  usuarioId,
  registrar,
}: PropsOperacoesAgenda) {
  const marcador = `ffcm-agenda-operacao-incerta:${usuarioId}`;
  const [{ legado: envioLegado, semResposta: envioInicial }] = useState(() =>
    lerEnvioSemResposta(usuarioId),
  );
  const envioSemRespostaRef = useRef(envioInicial);
  const incertoRef = useRef(true);

  const [incerto, definirIncertoEstado] = useState(true);
  const definirIncerto = useCallback((valor: boolean) => {
    incertoRef.current = valor;
    definirIncertoEstado(valor);
  }, []);
  const [ocupado, definirOcupado] = useState(false);
  const [resultado, definirResultado] = useState('');
  const [reconciliarOculto, definirReconciliarOculto] = useState(true);
  const [reconciliarDesligado, definirReconciliarDesligado] = useState(false);

  const [formAberto, definirFormAberto] = useState(false);
  const [acao, definirAcao] = useState<Acao>('criar');
  const [inicio, definirInicio] = useState('');
  const [fim, definirFim] = useState('');
  const [feedback, definirFeedback] = useState('');
  const [mostrarConfirmar, definirMostrarConfirmar] = useState(false);

  const eventoRef = useRef<Evento | undefined>(undefined);
  const pendenteRef = useRef<Record<string, unknown> | undefined>(undefined);
  const inicioFocoRef = useRef<HTMLInputElement | null>(null);
  const salvarFocoRef = useRef<HTMLButtonElement | null>(null);

  const verificarPendencia = useCallback(async (): Promise<void> => {
    definirIncerto(true);
    definirReconciliarDesligado(true);
    definirResultado('Verificando operações pendentes…');
    try {
      const resposta = await fetch('/api/agenda/google/pendencia', {
        headers: cabecalhos(),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const dados: unknown = await resposta.json();
      if (!dados || typeof dados !== 'object' || !('estado' in dados)) throw new Error();
      if (dados.estado === 'nenhuma' && !envioSemRespostaRef.current) {
        definirIncerto(false);
        definirOcupado(false);
        definirReconciliarOculto(true);
        definirFormAberto(false);
        definirResultado('');
      } else if (dados.estado === 'pendente') {
        definirReconciliarOculto(false);
        definirResultado(
          'Uma operação aguarda confirmação. Verifique sua situação no Google antes de fazer outra alteração.',
        );
      } else if (dados.estado === 'nenhuma') {
        definirReconciliarOculto(false);
        definirResultado(
          'A operação enviada ainda não pode ser localizada. Não repita a alteração; confira diretamente no Google e procure suporte.',
        );
      } else throw new Error();
    } catch {
      definirReconciliarOculto(false);
      definirResultado(
        'Não foi possível verificar operações pendentes. Tente novamente antes de alterar a agenda.',
      );
    } finally {
      definirReconciliarDesligado(false);
    }
  }, [cabecalhos, definirIncerto]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: é a montagem deste corpo, e só ela — mesmo gatilho de `void verificarPendencia()` ao final do construtor imperativo. `verificarPendencia` muda de identidade a cada render por causa de `cabecalhos`; repeti-la recriaria uma consulta que a versão imperativa nunca teve.
  useLayoutEffect(() => {
    void verificarPendencia();
  }, []);

  const exibir = useCallback(
    (novaAcao: Acao, item?: Evento) => {
      if (incertoRef.current || ocupado) return;
      definirResultado('');
      definirAcao(novaAcao);
      eventoRef.current = item;
      pendenteRef.current = undefined;
      definirMostrarConfirmar(false);
      definirFeedback(
        novaAcao === 'cancelar'
          ? 'Confirme o cancelamento deste compromisso no Google Calendar.'
          : '',
      );
      if (item && novaAcao === 'alterar') {
        definirInicio(campoLocal(item.inicio));
        definirFim(campoLocal(item.fim));
      } else {
        definirInicio('');
        definirFim('');
      }
      definirFormAberto(true);
    },
    [ocupado],
  );

  useLayoutEffect(() => {
    registrar({
      editar: (item) => exibir('alterar', item),
      cancelar: (item) => exibir('cancelar', item),
    });
  }, [registrar, exibir]);

  useLayoutEffect(() => {
    if (!formAberto) return;
    if (acao === 'cancelar') salvarFocoRef.current?.focus();
    else inicioFocoRef.current?.focus();
  }, [formAberto, acao]);

  async function enviar(dados: Record<string, unknown>): Promise<void> {
    definirOcupado(true);
    definirFeedback('Aguardando confirmação do Google…');
    try {
      localStorage.setItem(marcador, '1');
      envioSemRespostaRef.current = true;
      const headers = cabecalhos();
      headers.set('Content-Type', 'application/json');
      const resposta = await fetch('/api/agenda/google/operacoes', {
        method: 'POST',
        headers,
        body: JSON.stringify(dados),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      const corpo: unknown = await resposta.json();
      if (!corpo || typeof corpo !== 'object' || !('estado' in corpo)) throw new Error();
      if (
        ['confirmado', 'conflito_horario', 'conflito_versao', 'indisponivel'].includes(
          String(corpo.estado),
        )
      ) {
        localStorage.removeItem(marcador);
        envioSemRespostaRef.current = envioLegado;
      }
      if (corpo.estado === 'confirmado') {
        definirFormAberto(false);
        definirResultado('Operação confirmada no Google Calendar.');
        atualizar();
        return;
      }
      if (corpo.estado === 'conflito_horario') {
        pendenteRef.current = dados;
        definirMostrarConfirmar(true);
        definirFeedback('Há outro compromisso nesse horário. Confira e decida se deseja manter.');
        return;
      }
      if (corpo.estado === 'conflito_versao') {
        definirFeedback(
          'O compromisso mudou no Google. Atualize a agenda antes de tentar novamente.',
        );
        return;
      }
      if (corpo.estado === 'indisponivel') {
        definirFeedback(
          'Operação indisponível. Tente novamente quando o serviço estiver disponível.',
        );
        return;
      }
      throw new Error();
    } catch {
      definirIncerto(true);
      definirMostrarConfirmar(false);
      definirFeedback(
        'Não foi possível confirmar o resultado. Verifique a situação antes de outra alteração.',
      );
      definirFormAberto(false);
      void verificarPendencia();
    } finally {
      definirOcupado(false);
    }
  }

  function aoSubmeter(): void {
    try {
      const dados: Record<string, unknown> = { acao, operacao_id: crypto.randomUUID() };
      const evento = eventoRef.current;
      if (evento) {
        dados.evento_id = evento.id;
        dados.etag = evento.etag;
      }
      if (acao !== 'cancelar') {
        dados.inicio = horarioSaoPaulo(inicio);
        dados.fim = horarioSaoPaulo(fim);
        if (Date.parse(dados.inicio as string) >= Date.parse(dados.fim as string))
          throw new Error();
      }
      void enviar(dados);
    } catch {
      definirFeedback(
        'Confira os horários: o fim deve ser posterior ao início e ambos devem existir no fuso de São Paulo.',
      );
    }
  }

  async function aoReconciliar(): Promise<void> {
    definirReconciliarDesligado(true);
    definirResultado('Consultando o Google…');
    try {
      const headers = cabecalhos();
      headers.set('Content-Type', 'application/json');
      const resposta = await fetch('/api/agenda/google/reconciliar', {
        method: 'POST',
        headers,
        body: '{}',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(20000),
      });
      if (!resposta.ok) throw new Error();
      const dados: unknown = await resposta.json();
      if (!dados || typeof dados !== 'object' || !('estado' in dados)) throw new Error();
      if (dados.estado === 'confirmado') {
        localStorage.removeItem(marcador);
        envioSemRespostaRef.current = envioLegado;
        await verificarPendencia();
        if (!incertoRef.current) {
          definirResultado('Operação confirmada no Google Calendar.');
          atualizar();
        }
      } else if (dados.estado === 'pendente') {
        definirResultado(
          'A operação ainda não foi confirmada. Tente verificar novamente mais tarde.',
        );
      } else throw new Error();
    } catch {
      definirResultado('Não foi possível verificar a operação. Tente novamente mais tarde.');
    } finally {
      definirReconciliarDesligado(false);
    }
  }

  const abrirDesligado = incerto || ocupado;
  const titulo =
    acao === 'criar'
      ? 'Novo compromisso'
      : acao === 'alterar'
        ? 'Alterar compromisso'
        : 'Cancelar compromisso';
  const salvarRotulo = acao === 'cancelar' ? 'Confirmar cancelamento' : 'Salvar compromisso';

  return (
    <>
      <Botao peso="principal" disabled={abrirDesligado} aoAtivar={() => exibir('criar')}>
        Novo compromisso
      </Botao>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as telas e as provas já usam. */}
      <p role="status" aria-live="polite" className="m-0">
        {resultado}
      </p>
      {reconciliarOculto ? null : (
        <Botao
          peso="secundario"
          disabled={reconciliarDesligado}
          aoAtivar={() => void aoReconciliar()}
        >
          Verificar situação no Google
        </Botao>
      )}
      <form
        hidden={!formAberto}
        className="grid min-w-0 gap-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          aoSubmeter();
        }}
      >
        <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
          {titulo}
        </h3>
        <p className="m-0">
          Horários no fuso de São Paulo. O compromisso será registrado com título genérico.
        </p>
        {acao === 'cancelar' ? null : (
          <>
            <Campo
              ref={inicioFocoRef}
              id="agenda-inicio"
              rotulo="Início"
              tipo="datetime-local"
              required
              value={inicio}
              onChange={(evento) => definirInicio(evento.currentTarget.value)}
            />
            <Campo
              id="agenda-fim"
              rotulo="Fim"
              tipo="datetime-local"
              required
              value={fim}
              onChange={(evento) => definirFim(evento.currentTarget.value)}
            />
          </>
        )}
        <Botao
          ref={acao === 'cancelar' ? salvarFocoRef : undefined}
          tipo="submit"
          peso="principal"
          disabled={ocupado}
        >
          {salvarRotulo}
          {ocupado ? <span className="loading-indicator" aria-hidden="true" /> : null}
        </Botao>
        <Botao
          peso="secundario"
          disabled={ocupado || incerto}
          aoAtivar={() => definirFormAberto(false)}
        >
          Fechar
        </Botao>
        {mostrarConfirmar ? (
          <Botao
            peso="secundario"
            disabled={ocupado}
            aoAtivar={() => {
              if (pendenteRef.current)
                void enviar({ ...pendenteRef.current, confirmar_conflito: true });
            }}
          >
            Manter mesmo com conflito
          </Botao>
        ) : null}
        {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
        <p role="status" aria-live="polite" className="feedback m-0">
          {feedback}
        </p>
      </form>
    </>
  );
}
