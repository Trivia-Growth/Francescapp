/* "Meu turno" na ficha da equipe, reconstruído em React sobre a ilha
 * (`web/ponte/ilha.ts`). Autorização continua decidida no servidor e no banco.
 *
 * `montarTurnoProprio(raiz, pacienteId, servico, opcoes)` continua devolvendo a desmontagem.
 * Desde 27/11/2026 a execução chega como componente (`opcoes.renderizarExecucao`) e a
 * passagem é composta direto: antes as duas eram montadas por `useEffect` numa `div` de
 * ref — raízes alheias dentro de um contêiner que o React governa, a mesma direção que
 * produziu os `NotFoundError` desta migração. A remontagem a cada turno consultado, que os
 * efeitos faziam, continua: a chave troca com o objeto do turno.
 *
 * O que a migração entrega:
 *
 * 1. VIS-012. A versão imperativa tinha DEZESSEIS `if (!ativa)` espalhados pelo meio do
 *    protocolo de barreira — cada um protegendo uma escrita em DOM já removido, e cada
 *    esquecimento sendo um defeito que nenhuma ferramenta aponta. Sobraram apenas os que
 *    protegem o que mora FORA da ilha, reunidos em `fora()` e nos dois pontos em que o
 *    chamador imperativo entra aqui.
 * 2. A execução e a passagem deixam de ser desmontadas à mão em quatro lugares
 *    diferentes: são efeitos com limpeza, e a limpeza é do React.
 *
 * O que NÃO mudou, de propósito (VIS-018): o protocolo reservar → confirmar →
 * reconhecer, com a reserva por paciente e `geracao_reserva` sendo a época devolvida
 * pelo servidor; a reconciliação obrigatória antes de dar o encerramento por bom; a
 * recusa a reconhecer resultado confirmado antes da consulta real; a pendência de outro
 * caso que não consulta conteúdo; e todas as mensagens, palavra por palavra.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Turno } from '../packages/contracts/src/turno.js';
import { Botao } from './componentes/ui/botao.js';
import './estilos/tema.css';
import { PassagemTurnoTela } from './passagem-turno.js';
import { ilha } from './ponte/ilha.js';
import type { ServicoTurnoHttp } from './servico-turno-http.js';
import { Formulario } from './telas/formulario.js';
import type { DeclaracaoLocalizacao } from './turno-execucao-localizacao.js';

type OpcoesTurnoProprio = {
  acessoPerdido(): void;
  alteracaoPendente?(valor: boolean): void;
  /** A execução do cuidado, composta abaixo do turno. */
  renderizarExecucao?(turno: Turno | null, alteracaoPendente: (valor: boolean) => void): ReactNode;
  localizacao?: {
    coletar(): Promise<DeclaracaoLocalizacao>;
    registrar(
      turnoId: string,
      momento: 'abertura' | 'encerramento',
      dados: DeclaracaoLocalizacao,
    ): Promise<void>;
  };
};

/** O que a região de conteúdo apresenta. `nenhum` é o estado em que uma falha limpou a
 *  região sem inventar vazio — vazio confirmado e indisponível não são a mesma coisa. */
type Conteudo = { tipo: 'nenhum' } | { tipo: 'vazio' } | { tipo: 'turno'; turno: Turno };

function Dado({ nome, valor }: { nome: string; valor: string }) {
  return (
    <>
      <dt className="m-0 text-(length:--texto-1) text-texto-suave">{nome}</dt>
      <dd className="m-0 text-(length:--texto-2)">{valor}</dd>
    </>
  );
}

export function TelaTurnoProprio({
  pacienteId,
  servico,
  opcoes,
}: {
  pacienteId: string;
  servico: ServicoTurnoHttp;
  opcoes: OpcoesTurnoProprio;
}) {
  const [status, definirStatus] = useState('Consultando seu turno…');
  const [conteudo, definirConteudo] = useState<Conteudo>({ tipo: 'nenhum' });
  const [perdido, definirPerdido] = useState(false);

  /* Decisão síncrona no meio de fluxo assíncrono mora em ref e é espelhada para a
     renderização; ler o `useState` ali devolveria o valor do render anterior. */
  const ocupadaRef = useRef(false);
  const [ocupada, marcarOcupada] = useState(false);
  const permiteAbrirRef = useRef(false);
  const [permiteAbrir, marcarPermiteAbrir] = useState(false);
  const pendenteRef = useRef(false);
  const [pendente, marcarPendente] = useState(false);
  const [marcado, marcarConfirmacao] = useState(false);

  const execucaoPendenteRef = useRef(false);
  const localizacaoPendenteRef = useRef<{
    turnoId: string;
    momento: 'abertura' | 'encerramento';
  } | null>(null);
  const confirmacaoRef = useRef<HTMLInputElement>(null);

  /* A caixa é NÃO controlada e o `change` é ouvido no próprio nó, não pela delegação do
     React — a mesma decisão, e pelas mesmas duas razões, de `web/telas/formulario.tsx`:
     a prova de tela dispara `new Event('change')` sem `bubbles`, que nunca alcançaria a
     raiz da ilha; e o botão de abrir precisa destravar NA HORA, porque quem marca a
     caixa clica em seguida sem esperar repintura agendada. */
  useEffect(() => {
    const caixa = confirmacaoRef.current;
    if (!caixa) return;
    const ouvir = () => flushSync(() => marcarConfirmacao(caixa.checked));
    caixa.addEventListener('change', ouvir);
    return () => caixa.removeEventListener('change', ouvir);
  }, []);

  const controladorRef = useRef<AbortController | null>(null);
  controladorRef.current ??= new AbortController();

  /** Tudo que mora FORA da ilha — as funções de `opcoes` — continua precisando do sinal:
   *  desmontar a raiz React não alcança o chamador. É o único resto de `if (!ativa)`, e
   *  está reunido aqui em vez de repetido antes de cada escrita (VIS-012). */
  const fora = useCallback(
    <T,>(acao: (destino: OpcoesTurnoProprio) => T): T | undefined =>
      controladorRef.current?.signal.aborted ? undefined : acao(opcoes),
    [opcoes],
  );

  const definirOcupada = useCallback((valor: boolean) => {
    ocupadaRef.current = valor;
    marcarOcupada(valor);
  }, []);
  const definirPermiteAbrir = useCallback((valor: boolean) => {
    permiteAbrirRef.current = valor;
    marcarPermiteAbrir(valor);
  }, []);
  const definirPendente = useCallback((valor: boolean) => {
    pendenteRef.current = valor;
    marcarPendente(valor);
  }, []);

  const limparConfirmacao = useCallback(() => {
    if (confirmacaoRef.current) confirmacaoRef.current.checked = false;
    marcarConfirmacao(false);
  }, []);

  const mostrar = useCallback(
    (turno: Turno | null) => {
      definirPermiteAbrir(!turno || turno.situacao === 'encerrado');
      definirConteudo(turno ? { tipo: 'turno', turno } : { tipo: 'vazio' });
    },
    [definirPermiteAbrir],
  );

  const registrarLocalizacaoPendente = useCallback(async () => {
    const pendencia = localizacaoPendenteRef.current;
    const localizacao = opcoes.localizacao;
    if (!pendencia || !localizacao || controladorRef.current?.signal.aborted) return;
    localizacaoPendenteRef.current = null;
    // O cuidado já foi confirmado. Nem permissão pendente nem consulta de consentimento
    // bloqueiam a reconciliação clínica; ausência já existe atomicamente no servidor.
    void localizacao
      .coletar()
      .catch(() => ({ motivo_ausencia: 'falha' as const }))
      .then(async (dados) => {
        if (controladorRef.current?.signal.aborted) return;
        try {
          await localizacao.registrar(pendencia.turnoId, pendencia.momento, dados);
        } catch {
          /* componente próprio oferece recuperação */
        }
      });
  }, [opcoes.localizacao]);

  const falhou = useCallback(
    (erro: unknown) => {
      definirConteudo({ tipo: 'nenhum' });
      definirPermiteAbrir(false);
      limparConfirmacao();
      const codigo =
        erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
      if (codigo === 'nao_autenticado' || codigo === 'sem_permissao') {
        localizacaoPendenteRef.current = null;
        definirPerdido(true);
        fora((destino) => destino.acessoPerdido());
        return;
      }
      definirStatus(
        codigo === 'conflito_versao' || codigo === 'conflito_idempotencia'
          ? 'A abertura não foi confirmada. Atualize ou recupere a operação; você pode ter um turno aberto em outro caso.'
          : pendenteRef.current
            ? 'Não foi possível confirmar o resultado. Recupere a operação antes de abrir outro turno.'
            : 'Não foi possível consultar seu turno. O recurso pode estar indisponível. Tente atualizar.',
      );
    },
    [definirPermiteAbrir, fora, limparConfirmacao],
  );

  const carregar = useCallback(async () => {
    const barreira = await servico.consultarBarreira();
    definirPendente(Boolean(barreira.reserva || barreira.resultado_pendente));
    const atual = await servico.consultarAtual(pacienteId);
    const turno = atual ?? (await servico.consultarUltimo(pacienteId));
    mostrar(turno);
    definirStatus(
      pendenteRef.current
        ? 'Existe uma operação pendente. Recupere o resultado antes de abrir outro turno.'
        : 'Consulta atualizada.',
    );
  }, [servico, pacienteId, definirPendente, mostrar]);

  const reconciliar = useCallback(async () => {
    let barreira = await servico.consultarBarreira();
    if (barreira.reserva) {
      // Encerrar esta barreira resolve a operação; nunca encerra o turno clínico.
      const encerramento = await servico.encerrarBarreira({
        epoca: barreira.epoca,
        reserva_id: barreira.reserva.id,
        comando_id: crypto.randomUUID(),
      });
      if (encerramento.estado !== 'confirmada' && encerramento.estado !== 'cancelada')
        throw new Error('Barreira não reconciliada');
      barreira = await servico.consultarBarreira();
    }
    if (barreira.reserva) throw new Error('Operação ainda pendente');
    const resultado = barreira.resultado_pendente;
    if (resultado) {
      if (resultado.paciente_id.toLowerCase() !== pacienteId.toLowerCase()) {
        definirPendente(true);
        definirPermiteAbrir(false);
        definirConteudo({ tipo: 'nenhum' });
        definirStatus(
          'A operação pendente pertence a outro caso. Abra a ficha de origem e recupere por lá.',
        );
        return;
      }
      if (resultado.resultado === 'confirmada') {
        const turno = await servico.consultar(pacienteId, resultado.turno_id);
        if (!turno) throw new Error('Turno não confirmado');
        await registrarLocalizacaoPendente();
        // Não reconhecer antes de consultar: uma falha mantém IDs recuperáveis no servidor.
      }
      if (resultado.resultado === 'cancelada') localizacaoPendenteRef.current = null;
      const reconhecimento = await servico.reconhecer({ comando_id: resultado.recibo_id });
      if (reconhecimento.estado !== 'reconhecido') throw new Error('Resultado ainda pendente');
    }
    await carregar();
    if (!pendenteRef.current)
      definirStatus(
        resultado?.resultado === 'cancelada'
          ? 'A operação anterior foi cancelada sem abrir turno. Consulta atualizada.'
          : 'Resultado recuperado e consulta atualizada.',
      );
  }, [
    servico,
    pacienteId,
    carregar,
    definirPendente,
    definirPermiteAbrir,
    registrarLocalizacaoPendente,
  ]);

  const executar = useCallback(
    async (mensagem: string, acao: () => Promise<void>) => {
      if (ocupadaRef.current) return;
      definirOcupada(true);
      definirStatus(mensagem);
      try {
        await acao();
      } catch (erro) {
        falhou(erro);
      } finally {
        definirOcupada(false);
      }
    },
    [definirOcupada, falhou],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: é a montagem da tela, e só ela. As funções são estáveis por caso, e listá-las aqui só criaria releitura a cada repintura.
  useEffect(() => {
    const controlador = controladorRef.current;
    void executar('Consultando seu turno…', carregar);
    return () => controlador?.abort();
  }, []);

  const alteracaoExecucao = useCallback(
    (valor: boolean) => {
      execucaoPendenteRef.current = valor;
      fora((destino) => destino.alteracaoPendente?.(valor));
    },
    [fora],
  );

  const turnoVisivel = conteudo.tipo === 'turno' ? conteudo.turno : null;
  const mostraExecucao = conteudo.tipo !== 'nenhum';

  /** O encerramento é pedido pela passagem, que vive FORA desta ilha: é o segundo ponto
   *  em que o sinal ainda é necessário. A sequência é a mesma de antes — consultar a
   *  barreira, reservar por paciente com a época do servidor, encerrar, RECONCILIAR, e
   *  só então dar o turno por fechado. */
  const encerrarTurno = useCallback(
    async (turno: Turno, registroId: string) => {
      const sinal = controladorRef.current?.signal;
      if (sinal?.aborted || turno.situacao !== 'aberto') return;
      if (execucaoPendenteRef.current)
        throw new Error('Conclua ou recupere o registro de execução antes de encerrar.');
      const barreira = await servico.consultarBarreira();
      if (sinal?.aborted) return;
      if (barreira.reserva || barreira.resultado_pendente) {
        definirPendente(true);
        throw new Error('Recupere operação pendente');
      }
      definirPendente(true);
      fora((destino) => destino.alteracaoPendente?.(true));
      const reservaId = crypto.randomUUID();
      const reserva = await servico.reservar({
        epoca: barreira.epoca,
        reserva_id: reservaId,
        paciente_id: pacienteId,
        turno_id: turno.turno_id,
        versao_esperada: turno.versao,
      });
      if (sinal?.aborted) return;
      if (reserva.estado !== 'aberta') throw new Error('Reserva não confirmada');
      if (opcoes.localizacao)
        localizacaoPendenteRef.current = { turnoId: turno.turno_id, momento: 'encerramento' };
      const fechado = await servico.encerrar(
        pacienteId,
        {
          turno_id: turno.turno_id,
          reserva_id: reservaId,
          geracao_reserva: barreira.epoca,
          versao_esperada: turno.versao,
          sintese_registro_id: registroId,
        },
        crypto.randomUUID(),
      );
      if (sinal?.aborted) return;
      await reconciliar();
      if (sinal?.aborted) return;
      if (pendenteRef.current) throw new Error('Encerramento ainda exige reconciliação');
      await registrarLocalizacaoPendente();
      if (sinal?.aborted) return;
      /* `flushSync` porque quem chama é imperativo: a passagem lê a tela na linha
         seguinte ao `await`, e uma repintura agendada chegaria tarde demais. É a mesma
         razão pela qual `web/ponte/ilha.ts` é síncrona. */
      flushSync(() => {
        mostrar(fechado);
        definirStatus('Turno encerrado com síntese publicada.');
      });
      fora((destino) => destino.alteracaoPendente?.(false));
    },
    [
      servico,
      pacienteId,
      opcoes.localizacao,
      fora,
      definirPendente,
      reconciliar,
      registrarLocalizacaoPendente,
      mostrar,
    ],
  );

  /* Cada objeto de turno consultado ganha uma chave nova, e execução e passagem nascem de
     novo com ele — o que os efeitos com `turnoVisivel` nas dependências faziam. */
  const chaves = useRef(new WeakMap<Turno, number>());
  const proximaChave = useRef(0);
  const chaveTurno = (turno: Turno | null) => {
    if (!turno) return 'sem-turno';
    let chave = chaves.current.get(turno);
    if (chave === undefined) {
      proximaChave.current += 1;
      chave = proximaChave.current;
      chaves.current.set(turno, chave);
    }
    return `turno-${chave}`;
  };

  if (perdido) return null;

  const confirmacaoDesabilitada = ocupada || !permiteAbrir || pendente;
  const escondeAbertura = !permiteAbrir || pendente;
  const instante = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  function enviar() {
    if (
      confirmacaoDesabilitada ||
      !confirmacaoRef.current?.checked ||
      !permiteAbrirRef.current ||
      pendenteRef.current ||
      execucaoPendenteRef.current
    )
      return;
    void executar('Abrindo seu turno…', async () => {
      const barreira = await servico.consultarBarreira();
      if (barreira.reserva || barreira.resultado_pendente) {
        definirPendente(true);
        definirStatus('Existe uma operação pendente. Recupere antes de abrir outro turno.');
        return;
      }
      const turnoId = crypto.randomUUID();
      const reservaId = crypto.randomUUID();
      definirPendente(true);
      limparConfirmacao();
      const reserva = await servico.reservar({
        epoca: barreira.epoca,
        reserva_id: reservaId,
        paciente_id: pacienteId,
        turno_id: turnoId,
        versao_esperada: 0,
      });
      if (reserva.estado !== 'aberta') throw new Error('Reserva não confirmada');
      if (opcoes.localizacao) localizacaoPendenteRef.current = { turnoId, momento: 'abertura' };
      // Geração é a época recebida do servidor, conferida na reserva e no SQL de abertura.
      await servico.abrir(
        pacienteId,
        { turno_id: turnoId, reserva_id: reservaId, geracao_reserva: barreira.epoca },
        crypto.randomUUID(),
      );
      await reconciliar();
    });
  }

  return (
    <section className="turno-proprio grid min-w-0 gap-4" aria-busy={ocupada}>
      <h3 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
        Meu turno
      </h3>
      <p className="m-0 max-w-[68ch] text-(length:--texto-2) text-texto-suave">
        Consulte ou abra seu turno neste caso. O horário de abertura é registrado pelo sistema.
      </p>
      <p
        // biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o que as telas e as provas já usam; `<output>` muda a semântica de formulário e o gancho que as provas procuram.
        role="status"
        aria-live="polite"
        className="m-0 text-(length:--texto-1) text-texto-suave"
      >
        {status}
      </p>
      <div className="grid min-w-0 gap-4">
        {conteudo.tipo === 'vazio' ? (
          <p className="m-0 text-(length:--texto-2)">Você não tem turno aberto neste caso.</p>
        ) : null}
        {turnoVisivel ? (
          <dl className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)]">
            <Dado
              nome="Situação"
              valor={turnoVisivel.situacao === 'aberto' ? 'Aberto' : 'Encerrado'}
            />
            <Dado
              nome="Abertura registrada"
              valor={instante.format(new Date(turnoVisivel.aberto_em))}
            />
            <Dado
              nome="Duração prevista"
              valor={`${turnoVisivel.parametros.duracao_padrao_minutos} minutos`}
            />
            <Dado
              nome="Tolerância de atraso"
              valor={`${turnoVisivel.parametros.tolerancia_atraso_minutos} minutos`}
            />
          </dl>
        ) : null}
        {mostraExecucao ? (
          <div className="min-w-0" key={chaveTurno(turnoVisivel)}>
            {opcoes.renderizarExecucao?.(turnoVisivel, alteracaoExecucao)}
          </div>
        ) : null}
        {turnoVisivel ? (
          <div className="min-w-0">
            <PassagemTurnoTela
              key={chaveTurno(turnoVisivel)}
              pacienteId={pacienteId}
              turno={turnoVisivel}
              servico={servico}
              opcoes={{
                acessoPerdido: () => fora((alvo) => alvo.acessoPerdido()),
                alteracaoPendente: (valor) => fora((alvo) => alvo.alteracaoPendente?.(valor)),
                encerrar: (registroId) => encerrarTurno(turnoVisivel, registroId),
              }}
            />
          </div>
        ) : null}
      </div>
      <Formulario className="grid min-w-0 gap-4" aoEnviar={() => enviar()}>
        <div hidden={escondeAbertura} className="flex min-h-controle-md items-center gap-2">
          <input
            id="turno-proprio-confirmar"
            name="confirmar"
            type="checkbox"
            ref={confirmacaoRef}
            disabled={confirmacaoDesabilitada}
            defaultChecked={false}
            className="h-5 w-5 flex-none accent-primaria"
          />
          <label
            htmlFor="turno-proprio-confirmar"
            className="m-0 cursor-pointer text-(length:--texto-2) leading-[1.4]"
          >
            Confirmo que desejo abrir meu turno neste caso.
          </label>
        </div>
        <div className="flex min-w-0 flex-wrap gap-3">
          <Botao
            peso="principal"
            tipo="submit"
            hidden={escondeAbertura}
            disabled={confirmacaoDesabilitada || !marcado}
          >
            Abrir meu turno
          </Botao>
          <Botao
            disabled={ocupada}
            aoAtivar={() => {
              if (execucaoPendenteRef.current) {
                definirStatus(
                  'Conclua, cancele ou recupere a edição de execução antes de atualizar o turno.',
                );
                return;
              }
              void executar('Consultando seu turno…', carregar);
            }}
          >
            Atualizar turno
          </Botao>
          <Botao
            hidden={!pendente}
            disabled={ocupada || !pendente}
            aoAtivar={() => void executar('Recuperando resultado…', reconciliar)}
          >
            Recuperar operação pendente
          </Botao>
        </div>
      </Formulario>
      <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
        Encerrar exige síntese de passagem publicada e vinculada ao turno.
      </p>
    </section>
  );
}

/** Seção da ficha da equipe. Regras de autorização continuam no servidor e banco. */
export function montarTurnoProprio(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoTurnoHttp,
  opcoes: OpcoesTurnoProprio,
): () => void {
  return ilha(raiz, <TelaTurnoProprio pacienteId={pacienteId} servico={servico} opcoes={opcoes} />);
}
