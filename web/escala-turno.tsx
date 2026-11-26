/* Escala do caso — turno previsto, cobertura e substituição —, reconstruída em React
 * sobre a ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarEscalaTurno(raiz, pacienteId, servico, opcoes)`
 * devolve a desmontagem. Quem chama não sabe que aqui dentro é React.
 *
 * O que a migração entrega:
 *
 * 1. VIS-012. A versão imperativa tinha SETE `if (!ativa)`/`if (ativa)` protegendo
 *    escrita em DOM já removido. `ilha()` desmonta a raiz React e escrever estado depois
 *    disso não faz nada. Sobrou um único ponto de guarda, anotado em `fora()`: as duas
 *    funções de `opcoes` moram FORA da ilha, e por isso continuam precisando de sinal.
 * 2. O rascunho do formulário deixa de ser copiado para um `Map` a cada consulta e
 *    restaurado por índice de `querySelectorAll`. O nó do formulário é o mesmo entre
 *    consultas, então o texto não digitado permanece por construção; uma alteração
 *    CONFIRMADA troca a chave do formulário e o remonta vazio, que é o que
 *    `rascunhos.clear()` fazia.
 *
 * O que NÃO mudou, de propósito (VIS-018): a operação pendente continua guardada inteira
 * — mesma entrada e MESMA CHAVE — até ser confirmada ou descartada à mão; o descarte
 * continua exigindo consulta posterior à recusa; `versao_esperada` continua vindo da
 * versão vigente consultada; e nenhuma mensagem mudou de palavra.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { statusErroHttp } from '../packages/contracts/src/erros.js';
import type { EscalaCaso, EscalaVersao } from '../packages/contracts/src/turno-passagem.js';
import { FalhaApi } from './api.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import type { ServicoTurnoHttp } from './servico-turno-http.js';
import { Formulario, valorDe } from './telas/formulario.js';

type OpcoesEscala = {
  acessoPerdido(): void;
  alteracaoPendente?(valor: boolean): void;
};

const rotulosTipo: Record<EscalaVersao['tipo'], string> = {
  previsto: 'Previsão original',
  cobertura: 'Cobertura de ausência',
  substituicao: 'Substituição',
};

function instante(valor: string) {
  return new Date(valor).toLocaleString('pt-BR');
}

/** Linha de leitura: Raleway, nunca a serifa — é dado procurado, não prosa. */
function Linha({ children }: { children: React.ReactNode }) {
  return <p className="m-0 max-w-[68ch] text-(length:--texto-2)">{children}</p>;
}

function Historico({
  versoes,
  nome,
}: { versoes: EscalaVersao[]; nome: (id: string | null) => string }) {
  return (
    <details className="min-w-0 rounded-campo border border-borda px-4 py-3">
      <summary className="cursor-pointer text-(length:--texto-2) font-semibold text-primaria">
        Consultar histórico da escala
      </summary>
      <div className="mt-3 grid gap-3">
        {[...versoes].reverse().map((versao) => (
          <div key={versao.versao} className="grid min-w-0 gap-1">
            <Linha>{`Versão ${versao.versao}: ${rotulosTipo[versao.tipo]}.`}</Linha>
            <Linha>{`Previsto: ${nome(versao.profissional_previsto_usuario_id)}. Assumiu: ${nome(versao.profissional_assumiu_usuario_id)}.`}</Linha>
            {versao.motivo ? <Linha>{`Motivo: ${versao.motivo}`}</Linha> : null}
            <Linha>{`Registrado por ${nome(versao.autor_usuario_id)} em ${instante(versao.registrado_em)}.`}</Linha>
          </div>
        ))}
      </div>
    </details>
  );
}

function SelecaoProfissionais({
  id,
  rotulo,
  escala,
  desabilitado,
}: {
  id: string;
  rotulo: string;
  escala: EscalaCaso;
  desabilitado: boolean;
}) {
  return (
    <SelecaoSimples
      id={id}
      name="profissional"
      rotulo={rotulo}
      required
      disabled={desabilitado}
      defaultValue=""
      classeEnvelope="max-w-[420px]"
    >
      <option value="">Selecione profissional</option>
      {escala.profissionais.map((pessoa) => (
        <option key={pessoa.usuario_id} value={pessoa.usuario_id}>
          {pessoa.rotulo}
        </option>
      ))}
    </SelecaoSimples>
  );
}

function TelaEscalaTurno({
  raiz,
  pacienteId,
  servico,
  opcoes,
}: {
  raiz: HTMLElement;
  pacienteId: string;
  servico: ServicoTurnoHttp;
  opcoes: OpcoesEscala;
}) {
  const [status, definirStatus] = useState('Consultando escala…');
  const [pagina, definirPagina] = useState<EscalaCaso | null>(null);
  const paginaRef = useRef<EscalaCaso | null>(null);
  const [perdido, definirPerdido] = useState(false);

  /* Estado lido em decisão SÍNCRONA no meio de fluxo assíncrono mora em ref e é
     espelhado para a renderização: ler o `useState` ali devolveria o render anterior. */
  const [ocupada, marcarOcupada] = useState(false);
  const ocupadaRef = useRef(false);
  const definirOcupada = useCallback((valor: boolean) => {
    ocupadaRef.current = valor;
    marcarOcupada(valor);
  }, []);

  /** A operação sem confirmação, guardada inteira para ser repetida com a MESMA chave. */
  const repetirRef = useRef<(() => Promise<unknown>) | null>(null);
  const [temRepetir, marcarRepetir] = useState(false);
  const recusaDefinitivaRef = useRef(false);
  const consultaAposRecusaRef = useRef(false);
  const [podeDescartar, definirPodeDescartar] = useState(false);

  /* `travado` reproduz o que a versão imperativa fazia percorrendo
     `conteudo.querySelectorAll('input,textarea,select,button')`: os controles do conteúdo
     ficam inertes enquanto a operação corre e enquanto houver operação sem confirmação,
     e só voltam quando uma consulta bem-sucedida redesenha ou o descarte os libera. */
  const [travado, definirTravado] = useState(false);

  /** Troca a chave dos formulários e os remonta vazios: o antigo `rascunhos.clear()`. */
  const [geracao, definirGeracao] = useState(0);

  const controladorRef = useRef<AbortController | null>(null);
  controladorRef.current ??= new AbortController();

  /** As duas funções de `opcoes` moram FORA da ilha — desmontar a raiz React não as
   *  alcança. É o único ponto em que o ciclo de vida não basta, e por isso o sinal entra
   *  aqui, em vez de uma bandeira conferida antes de cada escrita (VIS-012). */
  const fora = useCallback(
    <T,>(acao: (destino: OpcoesEscala) => T): T | undefined => {
      if (controladorRef.current?.signal.aborted) return undefined;
      return acao(opcoes);
    },
    [opcoes],
  );

  const falhou = useCallback(
    (erro: unknown) => {
      const codigo =
        erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
      if (codigo === 'nao_autenticado' || codigo === 'sem_permissao') {
        definirPerdido(true);
        fora((destino) => destino.acessoPerdido());
        return;
      }
      recusaDefinitivaRef.current =
        erro instanceof FalhaApi &&
        !erro.exigeReautenticacao &&
        ((codigo === 'conflito_versao' && erro.status === statusErroHttp.conflito_versao) ||
          (codigo === 'entrada_invalida' && erro.status === statusErroHttp.entrada_invalida));
      consultaAposRecusaRef.current = false;
      definirStatus(
        codigo === 'conflito_versao'
          ? 'A escala mudou. Atualize o histórico antes de substituir; nenhuma versão foi sobrescrita.'
          : 'Resultado não confirmado. Atualize a escala; se necessário, repita a mesma operação pendente.',
      );
    },
    [fora],
  );

  const carregar = useCallback(
    async (adicionar = false) => {
      definirStatus('Consultando escala…');
      const escala = await servico.consultarEscala(
        pacienteId,
        adicionar ? (paginaRef.current?.proximo_cursor ?? undefined) : undefined,
      );
      if (repetirRef.current && recusaDefinitivaRef.current) consultaAposRecusaRef.current = true;
      const anterior = paginaRef.current;
      const junta =
        adicionar && anterior
          ? {
              ...escala,
              itens: [...anterior.itens, ...escala.itens],
              identidades: [
                ...new Map(
                  [...anterior.identidades, ...escala.identidades].map((p) => [p.usuario_id, p]),
                ).values(),
              ],
            }
          : escala;
      paginaRef.current = junta;
      definirPagina(junta);
      definirTravado(Boolean(repetirRef.current));
      definirStatus(
        repetirRef.current
          ? 'Escala consultada. Há operação sem confirmação; a repetição preserva dados e chave originais.'
          : 'Escala atualizada.',
      );
    },
    [pacienteId, servico],
  );

  const executar = useCallback(
    async (acao: () => Promise<void>) => {
      if (ocupadaRef.current) return;
      definirOcupada(true);
      definirTravado(true);
      try {
        await acao();
      } catch (erro) {
        falhou(erro);
      } finally {
        definirOcupada(false);
        marcarRepetir(Boolean(repetirRef.current));
        definirPodeDescartar(
          Boolean(repetirRef.current) &&
            recusaDefinitivaRef.current &&
            consultaAposRecusaRef.current,
        );
      }
    },
    [definirOcupada, falhou],
  );

  const gravar = useCallback(
    async (acao: () => Promise<unknown>) => {
      recusaDefinitivaRef.current = false;
      consultaAposRecusaRef.current = false;
      repetirRef.current = acao;
      fora((destino) => destino.alteracaoPendente?.(true));
      await acao();
      repetirRef.current = null;
      definirGeracao((valor) => valor + 1);
      fora((destino) => destino.alteracaoPendente?.(false));
      await carregar(false);
      definirStatus('Alteração confirmada. Histórico atualizado.');
    },
    [carregar, fora],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: é a montagem da tela, e só ela. As funções são estáveis por caso, e listá-las aqui só criaria releitura a cada repintura.
  useEffect(() => {
    const controlador = controladorRef.current;
    void executar(() => carregar());
    return () => controlador?.abort();
  }, []);

  useEffect(() => {
    raiz.setAttribute('aria-busy', String(ocupada));
  }, [raiz, ocupada]);

  if (perdido) return null;

  const nome = (id: string | null) =>
    id
      ? (pagina?.identidades.find((p) => p.usuario_id === id)?.rotulo ??
        'Identidade histórica indisponível')
      : 'Sem substituição';

  const grupos = new Map<string, EscalaVersao[]>();
  for (const item of pagina?.itens ?? []) {
    const grupo = grupos.get(item.escala_id) ?? [];
    grupo.push(item);
    grupos.set(item.escala_id, grupo);
  }

  function enviarAlteracao(formulario: HTMLFormElement, atual: EscalaVersao) {
    if (ocupadaRef.current || repetirRef.current) return;
    const assumiu = valorDe(formulario, 'profissional');
    const motivo = valorDe(formulario, 'motivo').trim();
    if (!assumiu || !motivo) {
      definirStatus('Selecione quem assumirá e informe o motivo.');
      return;
    }
    const entrada = {
      tipo:
        valorDe(formulario, 'tipo') === 'cobertura'
          ? ('cobertura' as const)
          : ('substituicao' as const),
      profissional_assumiu_usuario_id: assumiu,
      motivo,
      versao_esperada: atual.versao,
    };
    const chave = crypto.randomUUID();
    void executar(() =>
      gravar(() => servico.alterarEscala(pacienteId, atual.escala_id, entrada, chave)),
    );
  }

  function enviarCriacao(formulario: HTMLFormElement) {
    if (ocupadaRef.current || repetirRef.current) return;
    const previsto = valorDe(formulario, 'profissional');
    const inicio = new Date(valorDe(formulario, 'inicio'));
    const fim = new Date(valorDe(formulario, 'fim'));
    if (
      !previsto ||
      !Number.isFinite(inicio.getTime()) ||
      !Number.isFinite(fim.getTime()) ||
      fim <= inicio
    ) {
      definirStatus('Selecione profissional e informe fim posterior ao início.');
      return;
    }
    const entrada = {
      escala_id: crypto.randomUUID(),
      profissional_previsto_usuario_id: previsto,
      inicio_previsto: inicio.toISOString(),
      fim_previsto: fim.toISOString(),
    };
    const chave = crypto.randomUUID();
    void executar(() => gravar(() => servico.criarEscala(pacienteId, entrada, chave)));
  }

  const avisarPendencia = () => fora((destino) => destino.alteracaoPendente?.(true));

  return (
    <div className="grid min-w-0 gap-5">
      <p
        // biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o que as telas e as provas já usam; `<output>` muda a semântica de formulário e o gancho que as provas procuram.
        role="status"
        className="m-0 text-(length:--texto-1) text-texto-suave"
      >
        {status}
      </p>
      <div className="grid min-w-0 gap-5">
        {pagina === null ? null : (
          <>
            <Linha>
              Identificação exibida conforme cadastro disponível; não comprova o nome usado na época
              do registro.
            </Linha>
            {grupos.size === 0 ? (
              <EstadoVazio titulo="Nenhum turno previsto registrado neste caso." />
            ) : null}
            {[...grupos.values()].map((naoOrdenadas) => {
              const versoes = [...naoOrdenadas].sort((a, b) => b.versao - a.versao);
              const atual = versoes[0];
              if (!atual) return null;
              return (
                <article key={atual.escala_id} className="grid min-w-0 gap-3">
                  <h4 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
                    {`${instante(atual.inicio_previsto)} até ${instante(atual.fim_previsto)}`}
                  </h4>
                  <Linha>{`Previsto originalmente: ${nome(atual.profissional_previsto_usuario_id)}.`}</Linha>
                  <Linha>
                    {`${pagina.proximo_cursor ? 'Última versão carregada' : 'Responsável vigente'}: ${nome(
                      atual.profissional_assumiu_usuario_id ??
                        atual.profissional_previsto_usuario_id,
                    )}. Versão ${atual.versao}.`}
                  </Linha>
                  <Historico versoes={versoes} nome={nome} />
                  {pagina.pode_gerir && !pagina.proximo_cursor ? (
                    <Formulario
                      key={`${atual.escala_id}-${geracao}`}
                      className="grid min-w-0 gap-4"
                      onInput={avisarPendencia}
                      aoEnviar={(formulario) => enviarAlteracao(formulario, atual)}
                    >
                      <SelecaoSimples
                        id={`escala-tipo-${atual.escala_id}`}
                        name="tipo"
                        rotulo="Tipo de alteração"
                        disabled={travado}
                        defaultValue="substituicao"
                        classeEnvelope="max-w-[420px]"
                      >
                        <option value="substituicao">Substituição</option>
                        <option value="cobertura">Cobertura de ausência</option>
                      </SelecaoSimples>
                      <SelecaoProfissionais
                        id={`escala-pessoa-${atual.escala_id}`}
                        rotulo="Profissional que assumirá"
                        escala={pagina}
                        desabilitado={travado}
                      />
                      <AreaTexto
                        id={`escala-motivo-${atual.escala_id}`}
                        name="motivo"
                        rotulo="Motivo obrigatório"
                        required
                        maxLength={2000}
                        disabled={travado}
                        classeEnvelope="max-w-[560px]"
                      />
                      <div>
                        <Botao peso="principal" tipo="submit" disabled={travado}>
                          Registrar alteração
                        </Botao>
                      </div>
                    </Formulario>
                  ) : null}
                </article>
              );
            })}
            {pagina.pode_gerir ? (
              <Formulario
                key={`nova-${geracao}`}
                className="grid min-w-0 gap-4"
                onInput={avisarPendencia}
                aoEnviar={enviarCriacao}
              >
                <h4 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
                  Planejar turno
                </h4>
                <SelecaoProfissionais
                  id="escala-nova-pessoa"
                  rotulo="Profissional previsto"
                  escala={pagina}
                  desabilitado={travado}
                />
                <Campo
                  id="escala-nova-inicio"
                  name="inicio"
                  rotulo="Início previsto (horário deste aparelho)"
                  tipo="datetime-local"
                  required
                  disabled={travado}
                  classeEnvelope="max-w-[420px]"
                />
                <Campo
                  id="escala-nova-fim"
                  name="fim"
                  rotulo="Fim previsto (horário deste aparelho)"
                  tipo="datetime-local"
                  required
                  disabled={travado}
                  classeEnvelope="max-w-[420px]"
                />
                <div>
                  <Botao peso="principal" tipo="submit" disabled={travado}>
                    Registrar turno previsto
                  </Botao>
                </div>
              </Formulario>
            ) : (
              <Linha>
                Consulta da escala. Alterações dependem de autorização da coordenação no caso.
              </Linha>
            )}
            {pagina.proximo_cursor ? (
              <Linha>
                Há mais histórico disponível. Carregue as próximas páginas para conferir a versão
                vigente antes de alterar.
              </Linha>
            ) : null}
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap gap-3">
        <Botao disabled={ocupada} aoAtivar={() => void executar(() => carregar())}>
          Atualizar escala
        </Botao>
        <Botao
          hidden={!temRepetir}
          disabled={ocupada}
          aoAtivar={() => {
            const acao = repetirRef.current;
            if (acao) void executar(() => gravar(acao));
          }}
        >
          Repetir operação pendente
        </Botao>
        <Botao
          hidden={!podeDescartar}
          disabled={ocupada}
          aoAtivar={() => {
            if (
              ocupadaRef.current ||
              !repetirRef.current ||
              !recusaDefinitivaRef.current ||
              !consultaAposRecusaRef.current
            )
              return;
            repetirRef.current = null;
            /* `flushSync` pela mesma razão de `web/telas/formulario.tsx`: o descarte
               devolve a edição NA HORA. A versão imperativa reabilitava os controles
               dentro do próprio tratador, e quem clica espera poder digitar na linha
               seguinte — não depois da próxima repintura agendada. */
            flushSync(() => {
              marcarRepetir(false);
              definirPodeDescartar(false);
              definirTravado(false);
              definirStatus(
                'Tentativa recusada descartada; texto preservado para revisão. Uma nova operação exige seu envio explícito.',
              );
            });
          }}
        >
          Descartar tentativa e editar dados
        </Botao>
        <Botao
          hidden={!pagina?.proximo_cursor}
          disabled={ocupada}
          aoAtivar={() => void executar(() => carregar(true))}
        >
          Carregar mais histórico
        </Botao>
      </div>
    </div>
  );
}

export function montarEscalaTurno(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoTurnoHttp,
  opcoes: OpcoesEscala,
): () => void {
  raiz.classList.add('escala-turno');
  const desmontar = ilha(
    raiz,
    <TelaEscalaTurno raiz={raiz} pacienteId={pacienteId} servico={servico} opcoes={opcoes} />,
  );
  return () => {
    desmontar();
    raiz.classList.remove('escala-turno');
    raiz.removeAttribute('aria-busy');
  };
}
