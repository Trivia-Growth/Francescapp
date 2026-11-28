/** Relatórios do cuidado e PDF gerado no servidor, em React (VIS-018).
 *
 *  Nada mudou no que é consultado ou emitido: a consulta usa registros persistidos e a
 *  audiência autorizada; o PDF leva só seletores e metadados (tipo, período, turno,
 *  destinatário e propósito), nunca conteúdo. A emissão guarda `exportacao_id` e chave numa
 *  tentativa; resultado incerto exige conferir, e repetir é repetir o MESMO envio.
 *  A família não recebe a exportação do caso, e localização não integra estes relatórios.
 *
 *  As classes `relatorios-turno*` e `list-status` continuam: são de `web/styles.css`, não
 *  do kit `web/ui/`, e mantêm o desenho que a tela já tinha. */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { RelatorioTurnoPublico } from '../packages/contracts/src/turno-execucao-http.ts';
import type { Turno } from '../packages/contracts/src/turno.ts';
import { resultadoIncerto } from './api.ts';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { ConsolidadoFicha, type FichaDoPlantao } from './consolidado-ficha-plantao.js';
import './estilos/tema.css';
import {
  criarServicoTurnoExecucaoHttp,
  type ServicoTurnoExecucao,
} from './servico-turno-execucao-http.ts';
import { Formulario, valorDe } from './telas/formulario.js';
import {
  CampoTurno,
  dataLocalTurno,
  instanteTurno,
  usarEntregaArquivoTurno,
  usarProtocoloTurno,
} from './turno-execucao-campos.js';
import { RelatorioTurno, dataTurno } from './turno-execucao-leitura.js';

type AnexoRelatorioPublico = NonNullable<RelatorioTurnoPublico['itens'][number]['anexos']>[number];
type TipoRelatorio = 'turno' | 'diario' | 'semanal' | 'caso';
type Consulta = Parameters<ServicoTurnoExecucao['relatorio']>[0];
type Tentativa = {
  entrada: Parameters<ServicoTurnoExecucao['pdf']>[0];
  chave: string;
  consultada: boolean;
};
type OpcoesRelatorios = {
  turno?: Turno | null;
  familia?: boolean;
  acessoPerdido(erro: unknown): void;
  alteracaoPendente?(valor: boolean): void;
  /** FR-080. Consulta autorizada da ficha de um plantão, usada só para rotular o
   * consolidado com período, papel declarado e conteúdo redigido do plantão. A audiência
   * dos registros continua sendo a de FR-062; quem não alcança a ficha vê o campo como
   * não disponível, sem que o teor seja revelado. */
  fichaDoPlantao?(turnoId: string): Promise<FichaDoPlantao | null>;
};
type Pagina = {
  relatorio: RelatorioTurnoPublico;
  fichas?: ReadonlyMap<string, FichaDoPlantao>;
};

const LIMITE_FOTO = 3 * 1024 * 1024;

function rotuloTurno(dados: { aberto_em: string; situacao: string }) {
  return `${dataTurno(dados.aberto_em)} · ${dados.situacao === 'aberto' ? 'Aberto' : 'Encerrado'}`;
}

function fimAutomatico(tipo: TipoRelatorio, inicio: string, fimAtual: string) {
  if ((tipo !== 'diario' && tipo !== 'semanal') || !inicio) return fimAtual;
  const data = new Date(inicio);
  if (!Number.isFinite(data.getTime())) return fimAtual;
  data.setDate(data.getDate() + (tipo === 'semanal' ? 7 : 1));
  return dataLocalTurno(data.toISOString());
}

export function RelatoriosTurno({
  servico,
  turno: turnoAtual,
  familia,
  acessoPerdido,
  alteracaoPendente,
  fichaDoPlantao,
}: OpcoesRelatorios & { servico: ServicoTurnoExecucao }) {
  const { viva, ocupadaRef, ocupada, definirOcupada, perdida, falha, status, definirStatus } =
    usarProtocoloTurno('', acessoPerdido);
  const entrega = usarEntregaArquivoTurno();
  const pendente = useRef(alteracaoPendente);
  pendente.current = alteracaoPendente;
  const [erro, definirErro] = useState(false);
  const [tipo, definirTipo] = useState<TipoRelatorio>('diario');
  const [inicio, definirInicio] = useState(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return dataLocalTurno(hoje.toISOString());
  });
  const [fim, definirFim] = useState(() => fimAutomatico('diario', inicio, ''));
  const [turnos, definirTurnos] = useState<{ valor: string; rotulo: string }[]>(() =>
    turnoAtual ? [{ valor: turnoAtual.turno_id, rotulo: rotuloTurno(turnoAtual) }] : [],
  );
  const [turnoEscolhido, definirTurnoEscolhido] = useState('');
  const [paginas, definirPaginas] = useState<Pagina[] | null>(null);
  const [consultando, definirConsultando] = useState(false);
  const consultaRef = useRef<Consulta | null>(null);
  const [consulta, espelharConsulta] = useState<Consulta | null>(null);
  const proximoRef = useRef<RelatorioTurnoPublico['proximo_cursor']>(null);
  const [temMais, definirTemMais] = useState(false);
  const tentativaRef = useRef<Tentativa | null>(null);
  const [tentativa, espelharTentativa] = useState<Tentativa | null>(null);

  const informar = useCallback(
    (texto: string, comoErro = false) => {
      definirErro(comoErro);
      definirStatus(texto);
    },
    [definirStatus],
  );
  const definirConsulta = useCallback((valor: Consulta | null) => {
    consultaRef.current = valor;
    espelharConsulta(valor);
  }, []);
  const definirTentativa = useCallback((valor: Tentativa | null) => {
    tentativaRef.current = valor;
    espelharTentativa(valor ? { ...valor } : null);
  }, []);
  /* A falha de acesso esvazia a superfície; a comum vira frase com o tom de erro. */
  const falhar = useCallback(
    (motivo: unknown) => {
      definirErro(true);
      falha(motivo);
    },
    [falha],
  );

  async function carregar(entrada: Consulta, acrescentar = false) {
    if (!viva() || ocupadaRef.current) return;
    if (!acrescentar) {
      definirConsulta(null);
      proximoRef.current = null;
      definirPaginas(null);
      definirTemMais(false);
    }
    definirOcupada(true);
    definirConsultando(!acrescentar);
    const pendenteAgora = tentativaRef.current;
    informar(
      pendenteAgora
        ? `Consultando registros. PDF anterior pendente: ${pendenteAgora.entrada.tipo}, ${pendenteAgora.entrada.inicio} até ${pendenteAgora.entrada.fim}.`
        : 'Consultando registros persistidos…',
    );
    try {
      const relatorio = await servico.relatorio(entrada);
      if (!viva()) return;
      let fichas: Map<string, FichaDoPlantao> | undefined;
      if (relatorio.tipo === 'diario' && fichaDoPlantao) {
        // FR-080: mesmo conteúdo da projeção autorizada, agrupado por plantão e rotulado
        // na ordem da ficha de papel. Nenhuma consulta nova de audiência.
        fichas = new Map();
        for (const evento of relatorio.itens)
          if ('aberto_em' in evento.dados && !fichas.has(evento.dados.turno_id)) {
            const ficha = await fichaDoPlantao(evento.dados.turno_id).catch(() => null);
            if (!viva()) return;
            if (ficha) fichas.set(evento.dados.turno_id, ficha);
          }
      }
      definirPaginas((atuais) => [
        ...(acrescentar ? (atuais ?? []) : []),
        { relatorio, ...(fichas ? { fichas } : {}) },
      ]);
      definirConsulta({
        consulta_id: relatorio.consulta_id,
        tipo: entrada.tipo,
        inicio: entrada.inicio,
        fim: entrada.fim,
        ...(entrada.turno_id ? { turno_id: entrada.turno_id } : {}),
        limite: 25,
      });
      proximoRef.current = relatorio.proximo_cursor;
      definirTemMais(relatorio.proximo_cursor !== null);
      definirTurnos((atuais) => {
        const lista = [...atuais];
        for (const evento of relatorio.itens)
          if (
            'aberto_em' in evento.dados &&
            !lista.some((item) => item.valor === evento.dados.turno_id)
          )
            lista.push({ valor: evento.dados.turno_id, rotulo: rotuloTurno(evento.dados) });
        return lista;
      });
      informar(
        relatorio.proximo_cursor
          ? 'Página consultada. Há mais registros no período.'
          : 'Consulta concluída.',
      );
    } catch (motivo) {
      falhar(motivo);
    } finally {
      definirConsultando(false);
      definirOcupada(false);
    }
  }

  function proximaPagina() {
    const atual = consultaRef.current;
    const proximo = proximoRef.current;
    if (!atual || !proximo) return;
    void carregar(
      {
        ...atual,
        cursor_instante: proximo.instante,
        cursor_id: proximo.id,
        cursor_versao: proximo.versao,
        cursor_classe: proximo.classe,
      },
      true,
    );
  }

  function baixarFoto(foto: AnexoRelatorioPublico) {
    if (ocupadaRef.current) return;
    if (foto.tamanho_bytes > LIMITE_FOTO) {
      informar('Foto indisponível: excede o limite de transferência.');
      return;
    }
    definirOcupada(true);
    void servico
      .baixarAnexo(foto.anexo_id)
      .then((arquivo) => {
        if (viva()) entrega.entregar(arquivo);
      })
      .catch(falhar)
      .finally(() => definirOcupada(false));
  }

  async function consultarPdf() {
    const atual = tentativaRef.current;
    if (!viva() || ocupadaRef.current || !atual) return;
    definirOcupada(true);
    definirErro(false);
    try {
      const recibo = await servico.consultarPdf({ exportacao_id: atual.entrada.exportacao_id });
      if (!viva() || !tentativaRef.current) return;
      if (recibo) {
        definirTentativa(null);
        pendente.current?.(false);
        informar(
          'A emissão anterior foi confirmada, mas o arquivo não foi recebido nesta tela. Para obter outro arquivo, solicite uma nova emissão explicitamente.',
        );
      } else {
        definirTentativa({ ...atual, consultada: true });
        informar(
          'Ainda sem confirmação. Você pode repetir exatamente a mesma emissão, com o mesmo identificador.',
        );
      }
    } catch (motivo) {
      falhar(motivo);
    } finally {
      definirOcupada(false);
    }
  }

  async function enviarPdf() {
    const atual = tentativaRef.current;
    if (ocupadaRef.current || !viva() || !atual) return;
    definirOcupada(true);
    definirTentativa({ ...atual, consultada: false });
    informar('Gerando PDF no servidor…');
    try {
      const arquivo = await servico.pdf(atual.entrada, atual.chave);
      if (!viva()) return;
      entrega.entregar(arquivo);
      definirTentativa(null);
      pendente.current?.(false);
      informar('PDF confirmado pelo servidor e entregue para download.');
    } catch (motivo) {
      if (!resultadoIncerto(motivo)) definirTentativa(null);
      falhar(motivo);
    } finally {
      definirOcupada(false);
    }
  }

  function consultar(formulario: HTMLFormElement) {
    if (ocupadaRef.current) return;
    try {
      if (!['turno', 'diario', 'semanal', 'caso'].includes(tipo) || (familia && tipo === 'caso'))
        throw new Error();
      const de = instanteTurno(valorDe(formulario, 'inicio'));
      const ate = instanteTurno(valorDe(formulario, 'fim'));
      const escolhido = valorDe(formulario, 'turno_id');
      if (Date.parse(ate) <= Date.parse(de) || (tipo === 'turno' && !escolhido)) throw new Error();
      void carregar({
        tipo,
        inicio: de,
        fim: ate,
        ...(tipo === 'turno' ? { turno_id: escolhido } : {}),
        limite: 25,
      });
    } catch {
      informar('Confira o tipo de relatório, o período e o turno selecionado.', true);
    }
  }

  function emitir(formulario: HTMLFormElement) {
    const atual = consultaRef.current;
    const destinatario = valorDe(formulario, 'destinatario').trim();
    const proposito = valorDe(formulario, 'proposito').trim();
    if (!atual || tentativaRef.current || ocupadaRef.current || !destinatario || !proposito) return;
    definirTentativa({
      entrada: {
        exportacao_id: crypto.randomUUID(),
        tipo: atual.tipo,
        inicio: atual.inicio,
        fim: atual.fim,
        ...(atual.turno_id ? { turno_id: atual.turno_id } : {}),
        destinatario,
        proposito,
      },
      chave: crypto.randomUUID(),
      consultada: false,
    });
    pendente.current?.(true);
    void enviarPdf();
  }

  if (perdida) return null;

  const porTurno = tipo === 'turno';
  const fimAutomaticoAtivo = tipo === 'diario' || tipo === 'semanal';
  const fotos = (paginas ?? []).flatMap(({ relatorio }) =>
    relatorio.itens.flatMap((evento) => evento.anexos ?? []),
  );
  const ultima = paginas?.at(-1)?.relatorio;

  return (
    <section className="turno-execucao relatorios-turno">
      <h3>Relatórios do cuidado</h3>
      <p className="relatorios-turno__intro">
        Consulta e PDF usam registros persistidos e a audiência autorizada. Nenhum dado de
        localização integra estes relatórios.
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas e `.list-status` já usam. */}
      <p
        role="status"
        aria-live="polite"
        className="list-status"
        data-tone={erro ? 'error' : undefined}
      >
        {status}
      </p>
      <Formulario aoEnviar={consultar}>
        <fieldset disabled={ocupada} className="relatorios-turno__painel">
          <legend>Período do relatório</legend>
          <SelecaoAprimorada
            id="relatorios-turno-tipo"
            name="tipo"
            rotulo="Relatório"
            required
            value={tipo}
            onChange={(evento) => {
              const novo = evento.currentTarget.value as TipoRelatorio;
              definirTipo(novo);
              definirFim((atual) => fimAutomatico(novo, inicio, atual));
            }}
          >
            <option value="">Selecione</option>
            <option value="turno">Relatório de um turno</option>
            <option value="diario">Consolidado diário</option>
            <option value="semanal">Consolidado de sete dias</option>
            {familia ? null : <option value="caso">Exportação do caso por período</option>}
          </SelecaoAprimorada>
          <CampoDeData
            id="relatorios-turno-inicio"
            nome="inicio"
            rotulo="Início do período"
            valor={inicio}
            aoMudar={(valor) => {
              definirInicio(valor);
              definirFim((atual) => fimAutomatico(tipo, valor, atual));
            }}
          />
          <CampoDeData
            id="relatorios-turno-fim"
            nome="fim"
            rotulo="Fim do período"
            valor={fim}
            somenteLeitura={fimAutomaticoAtivo}
            aoMudar={definirFim}
          />
          <div hidden={!porTurno}>
            <SelecaoAprimorada
              id="relatorios-turno-turno"
              name="turno_id"
              rotulo="Turno consultado"
              required={porTurno}
              value={turnoEscolhido}
              onChange={(evento) => definirTurnoEscolhido(evento.currentTarget.value)}
            >
              <option value="">Selecione</option>
              {turnos.map((item) => (
                <option key={item.valor} value={item.valor}>
                  {item.rotulo}
                </option>
              ))}
            </SelecaoAprimorada>
          </div>
          <p className="relatorios-turno__dica" hidden={!porTurno}>
            Para escolher um turno anterior, consulte primeiro o consolidado do período.
          </p>
          <Botao tipo="submit" peso="principal">
            Consultar relatório
          </Botao>
        </fieldset>
      </Formulario>
      <div className="relatorios-turno__resultados">
        {consultando ? (
          // O esqueleto só aparece depois de 300 ms (`.list-loading`) e nunca sobrevive à falha.
          <div className="list-loading">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {(paginas ?? []).map(({ relatorio, fichas }) =>
          relatorio.tipo === 'diario' ? (
            <ConsolidadoFicha
              key={`${relatorio.consulta_id}-${relatorio.itens[0]?.id ?? 'vazio'}`}
              relatorio={relatorio}
              fichas={fichas}
            />
          ) : (
            <RelatorioTurno
              key={`${relatorio.consulta_id}-${relatorio.itens[0]?.id ?? 'vazio'}`}
              relatorio={relatorio}
            />
          ),
        )}
        {fotos.map((foto) => (
          <div key={foto.anexo_id}>
            <Botao aoAtivar={() => baixarFoto(foto)}>Baixar foto autorizada da ocorrência</Botao>
          </div>
        ))}
        {ultima ? (
          <p className="relatorios-turno__corte">
            {`Corte dos registros: ${new Date(ultima.instante_corte).toLocaleString('pt-BR')}. Os rótulos de identidade são atuais e não comprovam o nome na época do registro.`}
          </p>
        ) : null}
      </div>
      <div>
        <Botao hidden={!temMais} disabled={ocupada} aoAtivar={proximaPagina}>
          Próxima página do relatório
        </Botao>
      </div>
      <Formulario aoEnviar={emitir} onInput={() => pendente.current?.(true)}>
        <fieldset
          disabled={ocupada || !consulta || tentativa !== null}
          className="relatorios-turno__painel"
        >
          <legend>PDF gerado no servidor</legend>
          <CampoTurno rotulo="Destinatário da exportação" nome="destinatario" />
          <CampoTurno rotulo="Propósito da exportação" nome="proposito" longo />
          <Botao tipo="submit" peso="secundario">
            Emitir PDF do período consultado
          </Botao>
        </fieldset>
      </Formulario>
      <p className="relatorios-turno__pendencia">
        {tentativa
          ? `Emissão pendente: ${tentativa.entrada.tipo}, ${new Date(tentativa.entrada.inicio).toLocaleString('pt-BR')} até ${new Date(tentativa.entrada.fim).toLocaleString('pt-BR')}. A conferência e a repetição referem-se a esse período.`
          : ''}
      </p>
      <div className="relatorios-turno__acoes">
        <Botao hidden={tentativa === null} disabled={ocupada} aoAtivar={() => void consultarPdf()}>
          Conferir emissão anterior de PDF
        </Botao>
        <Botao
          hidden={tentativa === null}
          disabled={ocupada || !tentativa?.consultada}
          aoAtivar={() => {
            if (tentativaRef.current?.consultada) void enviarPdf();
          }}
        >
          Repetir a mesma emissão de PDF
        </Botao>
      </div>
      {familia ? (
        <p>
          A leitura familiar depende de fundamento de autorização vigente para o caso e para o
          período. Parentesco não concede esse acesso.
        </p>
      ) : null}
    </section>
  );
}

/** Data e hora controladas: o fim do período é recalculado a partir do início nos
 *  consolidados, e o controle precisa refletir o recálculo. */
function CampoDeData({
  id,
  nome,
  rotulo,
  valor,
  somenteLeitura,
  aoMudar,
}: {
  id: string;
  nome: string;
  rotulo: string;
  valor: string;
  somenteLeitura?: boolean;
  aoMudar(valor: string): void;
}) {
  return (
    <Campo
      id={id}
      name={nome}
      rotulo={rotulo}
      tipo="datetime-local"
      required
      readOnly={somenteLeitura}
      value={valor}
      onChange={(evento) => aoMudar(evento.currentTarget.value)}
    />
  );
}

export function RelatoriosTurnoFamilia({
  pacienteId,
  identidadeAtual,
  acessoPerdido,
  alteracaoPendente,
}: Pick<OpcoesRelatorios, 'acessoPerdido' | 'alteracaoPendente'> & {
  pacienteId: string;
  identidadeAtual: Parameters<typeof criarServicoTurnoExecucaoHttp>[1];
}) {
  const [servico, definirServico] = useState<ServicoTurnoExecucao | null>(null);

  useLayoutEffect(() => {
    const atual = criarServicoTurnoExecucaoHttp(pacienteId, identidadeAtual);
    definirServico(atual);
    return () => atual.desmontar();
  }, [pacienteId, identidadeAtual]);

  if (!servico) return null;
  return (
    <RelatoriosTurno
      servico={servico}
      familia
      acessoPerdido={acessoPerdido}
      alteracaoPendente={alteracaoPendente}
    />
  );
}
