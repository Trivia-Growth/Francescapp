/** Conversão de uma ocorrência do turno em tarefa de cuidado e evolução interna,
 *  reconstruída em React sobre a ilha (`web/ponte/ilha.ts`). VIS-018.
 *
 *  Contrato exportado inalterado: `montarConversaoOcorrenciaTurno(raiz, pacienteId,
 *  origem, servico, portas, opcoes)` devolve a desmontagem, e `turno-execucao.ts`
 *  continua chamando exatamente assim.
 *
 *  **O protocolo de barreira não mudou.** A máquina continua sendo a de
 *  `web/ciclo-tarefa-cuidado.ts`, criada por `portas.criarCiclo` e apenas consumida
 *  aqui. A sequência conferida antes de liberar o formulário é a mesma, na mesma ordem:
 *  consultar o recibo da ocorrência → reconhecer um resultado anterior quando houver →
 *  consultar a situação → encerrar → consultar de novo → recusar enquanto houver reserva
 *  → reconsultar o recibo antes de dar por não convertida → só então liberar. A gravação
 *  continua passando `reserva_id` e `geracao_reserva` com a época que a máquina devolve,
 *  nunca um valor local, e a ocorrência de origem continua íntegra, referenciada por
 *  `registro_id` e `origem_versao`. Nenhuma mensagem externa é enviada.
 *
 *  **O que a migração entrega (VIS-012).** A versão imperativa tinha quinze `if (!ativa)`
 *  no meio do protocolo, cada um protegendo uma escrita em DOM que podia já ter sido
 *  removido. Situação, visibilidade e trava de campo agora são estado, e estado de
 *  árvore desmontada não é defeito. Sobraram os que atravessam a fronteira da ilha —
 *  os avisos que saem para `opcoes`, reunidos em `fora()` — e as guardas do próprio
 *  protocolo, que continuam sendo regra de negócio e não desenho. */
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import type {
  RegistroExecucaoPublico,
  CandidatoTurnoPublico,
} from '../packages/contracts/src/turno-execucao-http.ts';
import type { criarCicloTarefaCuidado } from './ciclo-tarefa-cuidado.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FalhaApi, exigeNovoAcesso, mensagemFalha } from './api.ts';
import { Botao } from './componentes/ui/botao.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import { Formulario, valorDe } from './telas/formulario.js';
import { CampoTurno, EstadoTurno, SelecaoTurno } from './turno-execucao-campos.js';

type Ciclo = ReturnType<typeof criarCicloTarefaCuidado>;
type Gravar = Parameters<typeof criarCicloTarefaCuidado>[0]['gravar'];
export type PortasConversaoOcorrencia = {
  criarCiclo(gravar: Gravar): Ciclo;
  contexto(): Promise<{ escrita_disponivel: boolean; areas: readonly string[] }>;
  consultar(registroId: string): Promise<{ tarefa_id: string; evolucao_id: string } | null>;
};

type OpcoesConversao = {
  acessoPerdido(erro: unknown): void;
  alteracaoPendente(valor: boolean): void;
};

type Pedido = Omit<
  Parameters<ServicoTurnoExecucao['converterOcorrencia']>[0],
  'registro_id' | 'origem_versao' | 'tarefa_id' | 'reserva_id' | 'geracao_reserva'
>;

const PRIORIDADES = [
  { valor: 'baixa', rotulo: 'Baixa' },
  { valor: 'media', rotulo: 'Média' },
  { valor: 'alta', rotulo: 'Alta' },
] as const;

function TelaConversao({
  pacienteId,
  origem,
  servico,
  portas,
  opcoes,
}: {
  pacienteId: string;
  origem: RegistroExecucaoPublico;
  servico: ServicoTurnoExecucao;
  portas: PortasConversaoOcorrencia;
  opcoes: OpcoesConversao;
}) {
  const [status, definirStatus] = useState('');
  const [formVisivel, definirFormVisivel] = useState(false);
  const [conferirVisivel, definirConferirVisivel] = useState(true);
  const [rotuloConferir, definirRotuloConferir] = useState('Conferir e liberar conversão');
  const [areas, definirAreas] = useState<readonly string[]>([]);
  const [candidatos, definirCandidatos] = useState<CandidatoTurnoPublico[]>([]);
  const [temMais, definirTemMais] = useState(false);
  const [perdido, definirPerdido] = useState(false);
  /* Responsável e área são CONTROLADOS, ao contrário do resto do formulário: a lista de
     opções dos dois é recarregada do servidor no meio do fluxo, e a versão imperativa
     guardava e repunha o valor à mão depois de repovoar o `<select>`. Em React, deixá-los
     ao DOM devolveria a seleção ao vazio quando as opções trocassem. */
  const [responsavel, definirResponsavel] = useState('');
  const [area, definirArea] = useState('');

  /* Decisão síncrona no meio de fluxo assíncrono mora em ref e é espelhada para a
     renderização; ler o `useState` ali devolveria o valor do render anterior. */
  const ocupadaRef = useRef(false);
  const [ocupada, marcarOcupada] = useState(false);
  const liberadaRef = useRef(false);
  const [liberada, marcarLiberada] = useState(false);
  const confirmadaRef = useRef(false);
  const reconhecerRef = useRef(false);
  const pedidoRef = useRef<Pedido | null>(null);
  const candidatosRef = useRef<CandidatoTurnoPublico[]>([]);
  const proximoRef = useRef<string | null>(null);

  const controladorRef = useRef<AbortController | null>(null);
  controladorRef.current ??= new AbortController();
  const abortado = useCallback(() => controladorRef.current?.signal.aborted === true, []);

  /** O que mora FORA da ilha — as funções de `opcoes` — continua precisando do sinal:
   *  desmontar a raiz React não alcança o chamador (VIS-012). */
  const fora = useCallback(
    (acao: (destino: OpcoesConversao) => void) => {
      if (!abortado()) acao(opcoes);
    },
    [abortado, opcoes],
  );

  const definirOcupada = useCallback((valor: boolean) => {
    ocupadaRef.current = valor;
    marcarOcupada(valor);
  }, []);
  const definirLiberada = useCallback((valor: boolean) => {
    liberadaRef.current = valor;
    marcarLiberada(valor);
  }, []);

  const darPorConvertida = useCallback(
    (frase: string) => {
      confirmadaRef.current = true;
      pedidoRef.current = null;
      definirLiberada(false);
      definirFormVisivel(false);
      definirConferirVisivel(false);
      definirStatus(frase);
      fora((destino) => destino.alteracaoPendente(false));
    },
    [definirLiberada, fora],
  );

  const cicloRef = useRef<Ciclo | null>(null);
  cicloRef.current ??= portas.criarCiclo(async (entrada) => {
    const pedido = pedidoRef.current;
    if (abortado() || !pedido) throw new Error('Conversão indisponível.');
    await servico.converterOcorrencia(
      {
        ...pedido,
        registro_id: origem.registro_id,
        origem_versao: origem.versao,
        tarefa_id: entrada.tarefa_id,
        reserva_id: entrada.reserva_id,
        // Geração é a época devolvida pela máquina de barreira, nunca um valor local.
        geracao_reserva: entrada.epoca,
      },
      entrada.chave,
    );
    darPorConvertida('Conversão confirmada: tarefa e evolução interna registradas.');
  });
  const ciclo = cicloRef.current;

  const executar = useCallback(
    async (acao: () => Promise<void>) => {
      if (abortado() || ocupadaRef.current) return;
      definirOcupada(true);
      try {
        await acao();
      } catch (erro) {
        definirLiberada(false);
        if (
          exigeNovoAcesso(erro) &&
          !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
        ) {
          pedidoRef.current = null;
          controladorRef.current?.abort();
          definirPerdido(true);
          opcoes.acessoPerdido(erro);
          return;
        }
        definirStatus(
          `${mensagemFalha(erro)} Confira o resultado anterior antes de tentar novamente.`,
        );
      } finally {
        definirOcupada(false);
      }
    },
    [abortado, definirLiberada, definirOcupada, opcoes],
  );

  const carregarCandidatos = useCallback(
    async (cursor?: string) => {
      const pagina = await servico.candidatosMedicacao(cursor ? { cursor_id: cursor } : {});
      candidatosRef.current = cursor ? [...candidatosRef.current, ...pagina.itens] : pagina.itens;
      proximoRef.current = pagina.proximo_cursor;
      definirCandidatos(candidatosRef.current);
      definirTemMais(pagina.proximo_cursor !== null);
    },
    [servico],
  );

  const verificar = useCallback(async () => {
    definirLiberada(false);
    const recibo = await portas.consultar(origem.registro_id);
    /* As guardas que sobram neste fluxo NÃO são desenho: elas impedem que o protocolo
       continue — encerrando barreira, consultando contexto, gravando — depois de a tela
       ter sido desmontada. Estão exatamente onde a versão imperativa as tinha. */
    if (abortado()) return;
    if (recibo) {
      darPorConvertida('Esta ocorrência já foi convertida em tarefa e evolução interna.');
      return;
    }
    if (reconhecerRef.current) {
      await ciclo.reconhecer();
      reconhecerRef.current = false;
    }
    let situacao = await ciclo.consultar();
    if (situacao.resultado_pendente) {
      reconhecerRef.current = true;
      definirStatus(
        'Há resultado anterior aguardando ciência. Confira a seção Tarefas e clique para reconhecer e consultar novamente.',
      );
      definirRotuloConferir('Entendi, reconhecer e conferir novamente');
      return;
    }
    await ciclo.encerrar();
    situacao = await ciclo.consultar();
    if (abortado()) return;
    if (situacao.resultado_pendente) {
      reconhecerRef.current = true;
      definirStatus(
        'Operação anterior resolvida. Confira a seção Tarefas e reconheça antes de liberar uma nova conversão.',
      );
      return;
    }
    if (situacao.reserva) throw new Error('Reserva ainda pendente.');
    const confirmado = await portas.consultar(origem.registro_id);
    if (abortado()) return;
    if (confirmado) {
      darPorConvertida('Conversão anterior confirmada; nenhum novo registro foi criado.');
      return;
    }
    const contexto = await portas.contexto();
    if (abortado()) return;
    if (!contexto.escrita_disponivel || !contexto.areas.length) {
      definirStatus(
        'Conversão indisponível: confira as permissões de tarefa e a configuração de áreas do diário.',
      );
      return;
    }
    definirAreas(contexto.areas);
    definirArea((escolhida) => (contexto.areas.includes(escolhida) ? escolhida : ''));
    await carregarCandidatos();
    if (abortado()) return;
    ciclo.liberar();
    definirLiberada(true);
    pedidoRef.current = null;
    definirFormVisivel(true);
    definirStatus('Confira os campos humanos para converter esta ocorrência.');
    definirRotuloConferir('Conferir conversão');
  }, [
    abortado,
    ciclo,
    portas,
    origem.registro_id,
    carregarCandidatos,
    definirLiberada,
    darPorConvertida,
  ]);

  useEffect(() => {
    const controlador = controladorRef.current;
    return () => controlador?.abort();
  }, []);

  if (perdido) return null;

  function enviar(formulario: HTMLFormElement) {
    if (!liberadaRef.current || ocupadaRef.current || confirmadaRef.current) return;
    const pessoa = candidatosRef.current.find(
      (item) => item.usuario_id === responsavel && item.nome?.trim(),
    );
    const motivo = valorDe(formulario, 'motivo').trim();
    const encaminhamento = valorDe(formulario, 'encaminhamento').trim();
    const dataAtencao = valorDe(formulario, 'data_atencao');
    const prazo = valorDe(formulario, 'prazo');
    const prioridade = valorDe(formulario, 'prioridade');
    if (
      !pessoa ||
      !motivo ||
      !encaminhamento ||
      !dataAtencao ||
      !prazo ||
      !area ||
      !['baixa', 'media', 'alta'].includes(prioridade)
    ) {
      definirStatus('Preencha atenção, ação, responsável, prazo, prioridade e área.');
      return;
    }
    pedidoRef.current = {
      motivo,
      data_atencao: dataAtencao,
      encaminhamento,
      responsavel: pessoa.nome ?? '',
      prazo,
      prioridade: prioridade as 'baixa' | 'media' | 'alta',
      area,
    };
    definirLiberada(false);
    fora((destino) => destino.alteracaoPendente(true));
    void executar(async () => {
      const existente = await portas.consultar(origem.registro_id);
      if (abortado()) return;
      if (existente) {
        darPorConvertida('Ocorrência já convertida.');
        return;
      }
      const pedido = pedidoRef.current;
      if (!pedido) throw new Error('Pedido ausente.');
      await ciclo.gravar(pacienteId, crypto.randomUUID(), 0, {
        descricao: pedido.encaminhamento,
        responsavel: pedido.responsavel,
        prazo: pedido.prazo,
        prioridade: pedido.prioridade,
        estado: 'pendente',
      });
    });
  }

  const elegiveis = candidatos.filter((item) => item.nome?.trim());

  return (
    <section className="grid min-w-0 gap-4">
      <h4 className="m-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
        Ação a partir desta ocorrência
      </h4>
      <p className="m-0 max-w-[68ch] text-(length:--texto-2) text-texto-suave">
        A ocorrência original permanece íntegra. A conversão registra atenção humana, tarefa e
        evolução interna numa única transação; nenhuma mensagem externa é enviada.
      </p>
      <EstadoTurno>{status}</EstadoTurno>
      <div className="flex min-w-0 flex-wrap gap-3">
        <Botao
          hidden={!conferirVisivel}
          disabled={ocupada}
          aoAtivar={() => void executar(verificar)}
        >
          {rotuloConferir}
        </Botao>
      </div>
      <Formulario
        hidden={!formVisivel}
        className="grid min-w-0 gap-4"
        aoEnviar={enviar}
        onInput={() => fora((destino) => destino.alteracaoPendente(true))}
      >
        <fieldset
          disabled={ocupada || !liberada}
          className="m-0 grid min-w-0 gap-2 rounded-cartao border border-borda p-4"
        >
          <legend className="px-1 text-(length:--texto-2) font-semibold">
            Converter ocorrência em ação e evolução interna
          </legend>
          <CampoTurno rotulo="Motivo da atenção" nome="motivo" longo />
          <CampoTurno rotulo="Data da atenção" nome="data_atencao" tipo="date" />
          <CampoTurno rotulo="Encaminhamento / ação acordada" nome="encaminhamento" longo />
          <SelecaoSimples
            id="turno-conversao-responsavel"
            name="responsavel"
            rotulo="Responsável pela ação"
            required
            value={responsavel}
            onChange={(evento) => definirResponsavel(evento.currentTarget.value)}
          >
            <option value="">Selecione</option>
            {elegiveis.map((pessoa) => (
              <option key={pessoa.usuario_id} value={pessoa.usuario_id}>
                {pessoa.nome ?? ''}
              </option>
            ))}
          </SelecaoSimples>
          <div className="flex min-w-0 flex-wrap gap-3">
            <Botao
              hidden={!temMais}
              aoAtivar={() =>
                void executar(() => carregarCandidatos(proximoRef.current ?? undefined))
              }
            >
              Mais responsáveis elegíveis
            </Botao>
          </div>
          <CampoTurno rotulo="Prazo da ação" nome="prazo" tipo="date" />
          <SelecaoTurno rotulo="Prioridade informada" nome="prioridade" opcoes={PRIORIDADES} />
          <SelecaoSimples
            id="turno-conversao-area"
            name="area"
            rotulo="Área configurada do diário"
            required
            value={area}
            onChange={(evento) => definirArea(evento.currentTarget.value)}
          >
            <option value="">Selecione</option>
            {areas.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </SelecaoSimples>
          <div className="flex min-w-0 flex-wrap gap-3">
            <Botao peso="principal" tipo="submit">
              Criar tarefa e evolução interna atomicamente
            </Botao>
          </div>
        </fieldset>
      </Formulario>
    </section>
  );
}

export function montarConversaoOcorrenciaTurno(
  raiz: HTMLElement,
  pacienteId: string,
  origem: RegistroExecucaoPublico,
  servico: ServicoTurnoExecucao,
  portas: PortasConversaoOcorrencia,
  opcoes: OpcoesConversao,
): () => void {
  return ilha(
    raiz,
    <TelaConversao
      pacienteId={pacienteId}
      origem={origem}
      servico={servico}
      portas={portas}
      opcoes={opcoes}
    />,
  );
}
