/** Localização declarada — consulta e PDF restritos da coordenação, em React (VIS-018).
 *
 *  A autorização continua sendo do servidor: a superfície só abre o corpo depois de
 *  `candidatosMedicacao` devolver `pode_gerir`, e cada consulta e emissão é reautorizada lá.
 *  A emissão do PDF guarda `exportacao_id` e chave numa tentativa; resultado incerto exige
 *  conferir antes de repetir, e a repetição é do MESMO envio. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { resultadoIncerto } from './api.ts';
import { Botao } from './componentes/ui/botao.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import './estilos/tema.css';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import { Formulario, valorDe } from './telas/formulario.js';
import {
  CampoTurno,
  EstadoTurno,
  dataLocalTurno,
  instanteTurno,
  usarEntregaArquivoTurno,
  usarProtocoloTurno,
} from './turno-execucao-campos.js';
import { dataTurno } from './turno-execucao-leitura.js';

type Opcoes = { acessoPerdido(erro: unknown): void; alteracaoPendente?(valor: boolean): void };
type Tentativa = {
  entrada: Parameters<ServicoTurnoExecucao['exportarLocalizacao']>[0];
  chave: string;
  consultada: boolean;
};
type Cursor = Awaited<ReturnType<ServicoTurnoExecucao['relatorio']>>['proximo_cursor'];
type Localizacao = Awaited<ReturnType<ServicoTurnoExecucao['consultarLocalizacao']>>;

const classeGrupo = 'm-0 grid min-w-0 gap-2 rounded-cartao border border-borda p-4';
const classeLegenda = 'px-1 text-(length:--texto-2) font-semibold';

function periodoDeHoje() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  return { inicio: dataLocalTurno(hoje.toISOString()), fim: dataLocalTurno(amanha.toISOString()) };
}

export function LocalizacaoCoordenacao({
  servico,
  acessoPerdido,
  alteracaoPendente,
}: Opcoes & { servico: ServicoTurnoExecucao }) {
  const { viva, ocupadaRef, ocupada, definirOcupada, perdida, falha, status, definirStatus } =
    usarProtocoloTurno('Consultando permissão de coordenação…', acessoPerdido);
  const entrega = usarEntregaArquivoTurno();
  const pendente = useRef(alteracaoPendente);
  pendente.current = alteracaoPendente;
  const [periodo] = useState(periodoDeHoje);
  const [permitida, definirPermitida] = useState(false);
  const permitidaRef = useRef(false);
  const [turnos, definirTurnos] = useState<{ valor: string; rotulo: string }[]>([]);
  const [turno, definirTurno] = useState('');
  const turnoRef = useRef('');
  const [resultado, definirResultado] = useState<Localizacao | null>(null);
  const turnosRef = useRef<{ valor: string; rotulo: string }[]>([]);
  /** O período fica preso ao envio: a página seguinte continua a MESMA consulta. */
  const consultaRef = useRef<{ id?: string; proximo: Cursor; inicio?: string; fim?: string }>({
    proximo: null,
  });
  const [temMais, definirTemMais] = useState(false);
  const tentativaRef = useRef<Tentativa | null>(null);
  const [tentativa, espelharTentativa] = useState<Tentativa | null>(null);

  const definirTentativa = useCallback((valor: Tentativa | null) => {
    tentativaRef.current = valor;
    espelharTentativa(valor ? { ...valor } : null);
  }, []);
  const escolherTurno = useCallback((valor: string) => {
    turnoRef.current = valor;
    definirTurno(valor);
  }, []);

  useEffect(() => {
    void servico
      .candidatosMedicacao({})
      .then((pagina) => {
        if (!viva()) return;
        permitidaRef.current = pagina.pode_gerir;
        definirPermitida(pagina.pode_gerir);
        definirStatus(
          pagina.pode_gerir
            ? 'Operação restrita disponível; consulte os turnos do período.'
            : 'Este acesso não possui permissão vigente para consultar localização.',
        );
      })
      .catch(falha);
  }, [servico, viva, definirStatus, falha]);

  async function carregarTurnos(acrescentar: boolean, formulario?: HTMLFormElement) {
    if (!viva() || ocupadaRef.current || !permitidaRef.current) return;
    definirOcupada(true);
    try {
      if (formulario)
        consultaRef.current = {
          proximo: null,
          inicio: instanteTurno(valorDe(formulario, 'inicio')),
          fim: instanteTurno(valorDe(formulario, 'fim')),
        };
      const { id, proximo, inicio, fim } = consultaRef.current;
      if (!inicio || !fim) return;
      const pagina = await servico.relatorio({
        tipo: 'caso',
        inicio,
        fim,
        limite: 25,
        ...(acrescentar && id ? { consulta_id: id } : {}),
        ...(acrescentar && proximo
          ? {
              cursor_instante: proximo.instante,
              cursor_id: proximo.id,
              cursor_versao: proximo.versao,
              cursor_classe: proximo.classe,
            }
          : {}),
      });
      if (!viva()) return;
      const lista = acrescentar ? [...turnosRef.current] : [];
      for (const evento of pagina.itens)
        if ('aberto_em' in evento.dados) {
          const dados = evento.dados;
          if (lista.some((item) => item.valor === dados.turno_id)) continue;
          lista.push({
            valor: dados.turno_id,
            rotulo: `${dataTurno(dados.aberto_em)} · ${dados.situacao === 'aberto' ? 'Aberto' : 'Encerrado'}`,
          });
        }
      turnosRef.current = lista;
      definirTurnos(lista);
      if (!acrescentar) {
        escolherTurno('');
        definirResultado(null);
      }
      consultaRef.current = {
        ...consultaRef.current,
        id: pagina.consulta_id,
        proximo: pagina.proximo_cursor,
      };
      definirTemMais(pagina.proximo_cursor !== null);
      definirStatus(
        lista.length > 0
          ? 'Turnos consultados. Selecione um para acessar a operação restrita.'
          : 'Nenhum turno encontrado nesta página. Confira o período ou a próxima página.',
      );
    } catch (erro) {
      falha(erro);
    } finally {
      definirOcupada(false);
    }
  }

  async function carregarLocalizacao() {
    const escolhido = turnoRef.current;
    if (!viva() || ocupadaRef.current || !escolhido || !permitidaRef.current) return;
    definirOcupada(true);
    try {
      const resposta = await servico.consultarLocalizacao({ turno_id: escolhido });
      if (!viva()) return;
      definirResultado(resposta);
      definirStatus('Consulta restrita concluída.');
    } catch (erro) {
      falha(erro);
    } finally {
      definirOcupada(false);
    }
  }

  async function enviarPdf() {
    const atual = tentativaRef.current;
    if (!viva() || ocupadaRef.current || !atual) return;
    definirOcupada(true);
    definirTentativa({ ...atual, consultada: false });
    try {
      const arquivo = await servico.exportarLocalizacao(atual.entrada, atual.chave);
      if (!viva()) return;
      entrega.entregar(arquivo);
      definirTentativa(null);
      pendente.current?.(false);
      definirStatus('PDF restrito confirmado e entregue para download.');
    } catch (erro) {
      if (!resultadoIncerto(erro)) definirTentativa(null);
      falha(erro);
    } finally {
      definirOcupada(false);
    }
  }

  async function conferirPdf() {
    const atual = tentativaRef.current;
    if (!viva() || ocupadaRef.current || !atual) return;
    definirOcupada(true);
    try {
      const recibo = await servico.consultarPdfLocalizacao({
        turno_id: atual.entrada.turno_id,
        exportacao_id: atual.entrada.exportacao_id,
      });
      if (!viva() || !tentativaRef.current) return;
      if (recibo) {
        definirTentativa(null);
        pendente.current?.(false);
        definirStatus(
          'Emissão restrita anterior confirmada. Para obter outro arquivo, solicite nova emissão explicitamente.',
        );
      } else {
        definirTentativa({ ...atual, consultada: true });
        definirStatus('Emissão ainda sem confirmação. Repita somente o mesmo envio.');
      }
    } catch (erro) {
      falha(erro);
    } finally {
      definirOcupada(false);
    }
  }

  function emitir(formulario: HTMLFormElement) {
    const destinatario = valorDe(formulario, 'destinatario').trim();
    const proposito = valorDe(formulario, 'proposito').trim();
    if (ocupadaRef.current || tentativaRef.current || !turnoRef.current) return;
    if (!destinatario || !proposito) return;
    definirTentativa({
      entrada: {
        turno_id: turnoRef.current,
        exportacao_id: crypto.randomUUID(),
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

  return (
    <section className="turno-execucao grid min-w-0 gap-4">
      <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
        Localização declarada — coordenação
      </h3>
      <p className="m-0 max-w-[68ch] text-(length:--texto-2) text-texto-suave">
        Consulta segregada para Administrador e case manager atual. Coordenadas não comprovam
        presença; ausência não impede o cuidado. Retenção de 90 dias, sem rastreamento contínuo.
      </p>
      <EstadoTurno>{status}</EstadoTurno>
      <div hidden={!permitida} className="grid min-w-0 gap-4">
        <Formulario
          className="grid min-w-0 gap-3"
          aoEnviar={(formulario) => void carregarTurnos(false, formulario)}
        >
          <fieldset disabled={ocupada || !permitida} className={classeGrupo}>
            <legend className={classeLegenda}>Turnos para consultar localização</legend>
            <CampoTurno
              rotulo="Início do período"
              nome="inicio"
              tipo="datetime-local"
              valor={periodo.inicio}
            />
            <CampoTurno
              rotulo="Fim do período"
              nome="fim"
              tipo="datetime-local"
              valor={periodo.fim}
            />
            <div className="flex min-w-0 flex-wrap gap-3">
              <Botao tipo="submit" peso="principal">
                Consultar turnos autorizados
              </Botao>
            </div>
          </fieldset>
        </Formulario>
        <fieldset disabled={ocupada || !permitida} className={classeGrupo}>
          <SelecaoAprimorada
            id="turno-coordenacao-turno"
            name="turno"
            rotulo="Turno autorizado"
            required
            value={turno}
            onChange={(evento) => {
              escolherTurno(evento.currentTarget.value);
              definirResultado(null);
            }}
          >
            <option value="">{turnos.length ? 'Selecione um turno' : 'Selecione'}</option>
            {turnos.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </SelecaoAprimorada>
          <div className="flex min-w-0 flex-wrap gap-3">
            <Botao hidden={!temMais} aoAtivar={() => void carregarTurnos(true)}>
              Mais turnos do período
            </Botao>
            <Botao aoAtivar={() => void carregarLocalizacao()}>
              Consultar localização declarada
            </Botao>
          </div>
        </fieldset>
        {resultado ? <ResultadoLocalizacao resposta={resultado} /> : null}
        <Formulario
          className="grid min-w-0 gap-3"
          aoEnviar={emitir}
          onInput={() => pendente.current?.(true)}
        >
          <fieldset disabled={ocupada || !turno || tentativa !== null} className={classeGrupo}>
            <legend className={classeLegenda}>Exportar localização separadamente</legend>
            <CampoTurno rotulo="Destinatário" nome="destinatario" />
            <CampoTurno rotulo="Propósito" nome="proposito" longo />
            <div className="flex min-w-0 flex-wrap gap-3">
              <Botao tipo="submit" peso="principal">
                Emitir PDF restrito de localização
              </Botao>
            </div>
          </fieldset>
        </Formulario>
        <div className="flex min-w-0 flex-wrap gap-3">
          <Botao hidden={tentativa === null} disabled={ocupada} aoAtivar={() => void conferirPdf()}>
            Conferir emissão restrita anterior
          </Botao>
          <Botao
            hidden={tentativa === null}
            disabled={ocupada || !tentativa?.consultada}
            aoAtivar={() => {
              if (tentativaRef.current?.consultada) void enviarPdf();
            }}
          >
            Repetir a mesma emissão restrita
          </Botao>
        </div>
      </div>
    </section>
  );
}

function ResultadoLocalizacao({ resposta }: { resposta: Localizacao }) {
  if (resposta.ausencia === 'retencao_expirada')
    return (
      <p className="m-0">
        Localização indisponível: retenção de 90 dias expirada. Os demais registros do turno
        permanecem íntegros.
      </p>
    );
  if (!resposta.itens.length)
    return <p className="m-0">Nenhuma declaração de localização disponível para este turno.</p>;
  return (
    <div className="grid min-w-0 gap-3">
      {resposta.itens.map((item) => (
        <article key={`${item.momento}-${item.versao}`} className="grid min-w-0 gap-1">
          <h4 className="m-0 text-(length:--texto-2) font-semibold">
            {`${item.momento === 'abertura' ? 'Abertura' : 'Encerramento'} · versão ${item.versao}`}
          </h4>
          <p className="m-0">{`Registrada em ${dataTurno(item.registrado_em)}. Dado declarado pelo aparelho.`}</p>
          {item.latitude !== null && item.longitude !== null && item.precisao_metros !== null ? (
            <p className="m-0">{`Latitude informada: ${item.latitude}. Longitude informada: ${item.longitude}. Precisão informada: ${item.precisao_metros} metros.`}</p>
          ) : (
            <p className="m-0">{`Localização não informada. Motivo registrado: ${item.motivo_ausencia ?? 'indisponível'}.`}</p>
          )}
        </article>
      ))}
    </div>
  );
}
