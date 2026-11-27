/* Linha do tempo do caso (FR-007), reconstruída em React sobre a ilha
 * (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarLinhaTempo(raiz, pacienteId, servico,
 * acessoPerdido) => desmontar`.
 *
 * O que a migração entrega:
 *
 * 1. VIS-012. A versão imperativa tinha TRÊS guardas `vivo` — depois do sucesso da
 *    consulta, no início do `catch`, e no `finally` protegendo `mais.disabled` — cada uma
 *    defendendo uma escrita em DOM já desmontado. Não sobrou nenhuma: `ilha()` desmonta a
 *    raiz React e qualquer atualização de estado depois disso é descartada por
 *    construção. O que ficou é só a guarda de GERAÇÃO (`carga === cargaRef.current`), que
 *    é coisa diferente: ela impede que uma resposta mais lenta e mais antiga apague o
 *    estado "ocupado" que uma consulta mais nova acabou de terminar de desenhar.
 * 2. Uma única `Superficie` para o assunto, no lugar da `<section>` solta de antes
 *    (regra "superfície plana" do `DESIGN.md`).
 * 3. O "nada registrado ainda" passa a usar `EstadoVazio`, não mais texto solto no
 *    parágrafo de status.
 *
 * O que NÃO mudou, de propósito (VIS-018):
 *
 * - **Nenhuma frase mudou de palavra.**
 * - A tela nunca inventa data de acontecimento: registro sem data simplesmente não mostra
 *   a linha "Aconteceu em", em vez de a data de registro ocupar o lugar dela.
 * - A tela não anuncia o que foi filtrado por audiência: o que a pessoa não pode ver não
 *   chega aqui nem como contagem — isso é feito pelo servidor, antes da resposta.
 * - As áreas do seletor continuam vindo só do que já apareceu no acervo carregado, nunca
 *   de uma lista fixa: o vocabulário é configurado pela equipe.
 * - `exigeNovoAcesso` continua só avisando `acessoPerdido`, sem tocar no conteúdo da
 *   tela — exatamente como na versão imperativa, que também não limpava a lista nesse
 *   caminho.
 * - Trocar um filtro continua reiniciando a paginação (cursor descartado) e refazendo a
 *   consulta do zero.
 *
 * Os controles de filtro são NÃO controlados — o valor mora no `<select>`/`<input>` do
 * navegador, e os manipuladores de `onChange` só leem `evento.currentTarget.value` para
 * decidir o próximo filtro. Isso dispensa os ouvintes nativos que a anamnese precisou:
 * aqui não há prova nenhuma atribuindo `.value` cru e despachando evento à mão, e os
 * filtros não têm texto de rascunho para perder com um "repaint" perdido.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type {
  FiltrosLinhaTempo,
  ItemLinhaTempo,
  LinhaTempo,
} from '../packages/contracts/src/linha-tempo.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { Botao } from './componentes/ui/botao.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { Superficie } from './componentes/ui/superficie.js';
import { dataDeInstante } from './datas.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';

export type ServicoLinhaTempo = {
  consultar(pacienteId: string, filtros?: FiltrosLinhaTempo): Promise<LinhaTempo>;
};

const ROTULOS_FONTE: Record<ItemLinhaTempo['fonte'], string> = {
  diario: 'Diário',
  documento: 'Documento',
  anamnese: 'Anamnese',
  saude: 'Saúde',
  contexto: 'Rotina e recursos',
  rede: 'Rede de cuidado',
  situacao: 'Situação do caso',
  objetivo: 'Objetivo',
  tarefa: 'Tarefa',
  encaminhamento: 'Encaminhamento',
  orientacao: 'Orientação',
  pendencia: 'Pendência',
};

/** FR-007 manda distinguir acontecimento, registro e retificação. Rascunho aparece só para
 * o autor e é rotulado como tal para não se confundir com publicação. */
const ROTULOS_EVENTO: Record<ItemLinhaTempo['tipo_evento'], string> = {
  registro: 'Registrado',
  atualizacao: 'Atualizado',
  retificacao: 'Retificado',
  rascunho: 'Rascunho',
};

function dataCivil(valor: string | null): string {
  if (!valor) return '';
  const [ano, mes, dia] = valor.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

/** O indicador de ação em curso que `iniciarAcao` acrescentava ao botão. A mensagem
 *  acessível continua no `aria-live` da tela; isto é só a pintura. */
function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

function TelaLinhaTempo({
  pacienteId,
  servico,
  acessoPerdido,
}: {
  pacienteId: string;
  servico: ServicoLinhaTempo;
  acessoPerdido: (erro: unknown) => void;
}) {
  const [itens, definirItens] = useState<readonly ItemLinhaTempo[]>([]);
  const [mensagem, definirMensagem] = useState('Carregando a linha do tempo…');
  const [ocupado, definirOcupado] = useState(true);
  const [carregandoMais, definirCarregandoMais] = useState(false);
  const [maisDisponivel, definirMaisDisponivel] = useState(false);
  const [falhou, definirFalhou] = useState(false);

  /* Fonte da verdade dos itens acumulados, para `carregar(true)` anexar sem depender do
     estado de um render que ainda não aconteceu — o mesmo papel do `acumulado` da versão
     imperativa. */
  const itensRef = useRef<readonly ItemLinhaTempo[]>([]);
  const filtrosRef = useRef<FiltrosLinhaTempo>({});
  const cargaRef = useRef(0);
  const vivoRef = useRef(true);
  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;

  useEffect(() => {
    vivoRef.current = true;
    return () => {
      vivoRef.current = false;
    };
  }, []);

  const carregar = useCallback(
    async (continuar: boolean): Promise<void> => {
      const carga = ++cargaRef.current;
      if (!continuar) itensRef.current = [];
      flushSync(() => {
        definirOcupado(true);
        definirMensagem('Carregando a linha do tempo…');
        if (continuar) definirCarregandoMais(true);
        else {
          definirItens([]);
          definirFalhou(false);
        }
      });
      try {
        const resposta = await servicoAtual.current.consultar(pacienteId, filtrosRef.current);
        if (!vivoRef.current) return;
        const novos = continuar ? [...itensRef.current, ...resposta.itens] : [...resposta.itens];
        itensRef.current = novos;
        let proximosFiltros = filtrosRef.current;
        let temMais: boolean;
        if (resposta.proximo_cursor) {
          proximosFiltros = {
            ...proximosFiltros,
            cursor_em: resposta.proximo_cursor.registrado_em,
            cursor_id: resposta.proximo_cursor.id,
          };
          temMais = true;
        } else {
          const { cursor_em: _em, cursor_id: _id, ...resto } = proximosFiltros;
          proximosFiltros = resto;
          temMais = false;
        }
        filtrosRef.current = proximosFiltros;
        flushSync(() => {
          definirItens(novos);
          definirMaisDisponivel(temMais);
          definirFalhou(false);
          definirMensagem(
            novos.length === 0 ? 'Nada registrado neste caso ainda.' : `${novos.length} registros.`,
          );
        });
      } catch (erro) {
        if (!vivoRef.current) return;
        if (exigeNovoAcesso(erro)) {
          avisarPerda.current(erro);
          return;
        }
        itensRef.current = [];
        flushSync(() => {
          definirItens([]);
          definirFalhou(true);
          definirMensagem(mensagemFalha(erro));
        });
      } finally {
        if (vivoRef.current && carga === cargaRef.current) {
          definirOcupado(false);
          definirCarregandoMais(false);
        }
      }
    },
    [pacienteId],
  );

  useEffect(() => {
    void carregar(false);
  }, [carregar]);

  function reiniciar(): void {
    const { cursor_em: _em, cursor_id: _id, ...resto } = filtrosRef.current;
    filtrosRef.current = resto;
    void carregar(false);
  }

  function aoTrocarFonte(escolha: string): void {
    const { fontes: _fontes, ...resto } = filtrosRef.current;
    filtrosRef.current = escolha
      ? { ...resto, fontes: [escolha as ItemLinhaTempo['fonte']] }
      : resto;
    reiniciar();
  }

  function aoTrocarArea(escolha: string): void {
    const { areas: _areas, ...resto } = filtrosRef.current;
    filtrosRef.current = escolha ? { ...resto, areas: [escolha] } : resto;
    reiniciar();
  }

  function aoTrocarDe(valor: string): void {
    const { de: _de, ...resto } = filtrosRef.current;
    filtrosRef.current = valor ? { ...resto, de: `${valor}T00:00:00Z` } : resto;
    reiniciar();
  }

  /** As áreas oferecidas saem do acervo já carregado. Enquanto nada apareceu, o campo
   *  fica escondido em vez de oferecer uma lista vazia que parece defeito. */
  const areas = useMemo(
    () =>
      [...new Set(itens.map((item) => item.area).filter((area): area is string => !!area))].sort(
        (a, b) => a.localeCompare(b, 'pt-BR'),
      ),
    [itens],
  );

  return (
    <Superficie titulo="Linha do tempo" className="min-w-0">
      <div className="grid min-w-0 gap-4">
        <output
          aria-live="polite"
          className="m-0 block text-(length:--texto-1) text-texto-suave empty:hidden"
        >
          {mensagem}
        </output>

        <div className="flex flex-wrap items-end gap-3">
          <SelecaoAprimorada
            id={`linha-tempo-fonte-${pacienteId}`}
            rotulo="Tipo de registro"
            onChange={(evento) => aoTrocarFonte(evento.currentTarget.value)}
          >
            <option value="">Todos</option>
            {Object.entries(ROTULOS_FONTE).map(([chave, rotulo]) => (
              <option key={chave} value={chave}>
                {rotulo}
              </option>
            ))}
          </SelecaoAprimorada>
          <div hidden={areas.length === 0}>
            <SelecaoAprimorada
              id={`linha-tempo-area-${pacienteId}`}
              rotulo="Área"
              onChange={(evento) => aoTrocarArea(evento.currentTarget.value)}
            >
              <option value="">Todas</option>
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </SelecaoAprimorada>
          </div>
          <CampoData
            id={`linha-tempo-de-${pacienteId}`}
            rotulo="A partir de"
            aoAlterar={aoTrocarDe}
          />
        </div>

        <Esqueleto ocupado={ocupado}>
          {itens.length > 0 ? (
            <ol className="m-0 grid min-w-0 list-none gap-3 p-0">
              {itens.map((item) => {
                const registrado = dataDeInstante(item.registrado_em);
                return (
                  <li
                    key={item.id}
                    className="grid min-w-0 gap-1.5 rounded-cartao border border-borda bg-superficie p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-(length:--texto-1) text-texto-suave">
                        {ROTULOS_FONTE[item.fonte]}
                      </span>
                      <span className="text-(length:--texto-2) font-semibold">
                        {ROTULOS_EVENTO[item.tipo_evento]}
                      </span>
                    </div>
                    <p className="m-0 text-(length:--texto-1) text-texto-suave">
                      {registrado ? `Registrado em ${registrado}` : 'Data de registro indisponível'}
                    </p>
                    {item.aconteceu_em ? (
                      <p className="m-0 text-(length:--texto-2) text-texto">
                        {`Aconteceu em ${dataCivil(item.aconteceu_em)}`}
                      </p>
                    ) : null}
                    {item.area ? (
                      <p className="m-0 text-(length:--texto-1) text-texto-suave">{item.area}</p>
                    ) : null}
                    {item.detalhe.estado === 'indisponivel' ? (
                      <p className="m-0 text-(length:--texto-1) text-texto-suave italic">
                        Conteúdo indisponível
                      </p>
                    ) : null}
                    {item.audiencia === 'equipe_e_familia' ? (
                      <MarcaEstado tom="suave" className="justify-self-start">
                        Visível também para a família
                      </MarcaEstado>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : !ocupado && !falhou ? (
            <EstadoVazio titulo="Nada registrado neste caso ainda." />
          ) : null}
        </Esqueleto>

        <Botao
          peso="secundario"
          hidden={!maisDisponivel}
          disabled={ocupado}
          aria-busy={carregandoMais || undefined}
          aoAtivar={() => void carregar(true)}
          className="justify-self-start"
        >
          Carregar mais
          {carregandoMais ? <Indicador /> : null}
        </Botao>
      </div>
    </Superficie>
  );
}

/** Linha do tempo do caso (FR-007). Ver cabeçalho do arquivo. */
export function montarLinhaTempo(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoLinhaTempo,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  return ilha(
    raiz,
    <TelaLinhaTempo pacienteId={pacienteId} servico={servico} acessoPerdido={acessoPerdido} />,
  );
}
