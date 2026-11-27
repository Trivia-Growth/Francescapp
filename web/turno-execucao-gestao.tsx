/** Autorizações e configuração do turno, em React (VIS-018).
 *
 *  Controles de coordenação aparecem somente depois da capacidade recebida do servidor
 *  (`pode_gerir`); familiares e catálogo nem são consultados sem ela. Cada alteração —
 *  concessão de medicação, fundamento familiar, configuração do catálogo — é uma
 *  tentativa com chave própria: resultado incerto bloqueia novas alterações até conferir,
 *  e repetir é repetir exatamente o envio conferido.
 *
 *  Recarregar redesenha o conteúdo (a `geracao` troca a chave) e por isso descarta o que
 *  foi digitado: a confirmação de descarte continua antes de qualquer redesenho. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CandidatoTurnoPublico,
  CatalogoTurnoPublico,
} from '../packages/contracts/src/turno-execucao-http.ts';
import { resultadoIncerto } from './api.ts';
import { Botao } from './componentes/ui/botao.js';
import { definirValorNativo } from './componentes/ui/valor-nativo.js';
import { confirmarDescarte } from './confirmacao.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import { CaixaDeMarcacao } from './telas/caixa-de-marcacao.js';
import { Formulario, marcado, valorDe } from './telas/formulario.js';
import {
  CampoTurno,
  EstadoTurno,
  SelecaoTurno,
  dataLocalTurno,
  instanteTurno,
  usarMudancaNativa,
  usarProtocoloTurno,
} from './turno-execucao-campos.js';
import { rotuloSinal } from './turno-execucao-editor.js';

type Opcoes = {
  acessoPerdido(erro: unknown): void;
  alteracaoPendente?(valor: boolean): void;
  administrador: boolean;
};
type Tentativa = {
  descricao: string;
  executar(): Promise<unknown>;
  confirmar(): Promise<boolean>;
  consultada: boolean;
};
type Fundamento = Awaited<ReturnType<ServicoTurnoExecucao['consultarFundamento']>>;

const classeGrupo = 'm-0 grid min-w-0 gap-2 rounded-cartao border border-borda p-4';
const classeLegenda = 'px-1 text-(length:--texto-2) font-semibold';
const ID_FAMILIAR = 'turno-gestao-familiar';

export function GestaoExecucaoTurno({
  servico,
  acessoPerdido,
  alteracaoPendente,
  administrador,
}: Opcoes & { servico: ServicoTurnoExecucao }) {
  const { viva, ocupadaRef, ocupada, definirOcupada, perdida, falha, status, definirStatus } =
    usarProtocoloTurno('Consultando permissões de coordenação…', acessoPerdido);
  const pendente = useRef(alteracaoPendente);
  pendente.current = alteracaoPendente;
  const envolucroRef = useRef<HTMLElement>(null);
  const rascunhoRef = useRef(false);
  const tentativaRef = useRef<Tentativa | null>(null);
  const [tentativa, espelharTentativa] = useState<Tentativa | null>(null);
  const [carregado, definirCarregado] = useState(false);
  const [geracao, definirGeracao] = useState(0);
  const [podeGerir, definirPodeGerir] = useState(false);
  const [profissionais, definirProfissionais] = useState<CandidatoTurnoPublico[]>([]);
  const [familiares, definirFamiliares] = useState<CandidatoTurnoPublico[]>([]);
  const [cursorProfissional, definirCursorProfissional] = useState<string | null>(null);
  const [cursorFamiliar, definirCursorFamiliar] = useState<string | null>(null);
  const [catalogo, definirCatalogo] = useState<CatalogoTurnoPublico[]>([]);
  /** Familiar cujo fundamento está na tela. A gravação só vale contra ele. */
  const consultadoRef = useRef<{ id: string; versao: number } | null>(null);
  const [fundamento, definirFundamento] = useState<{ id: string; registro: Fundamento } | null>(
    null,
  );

  const definirTentativa = useCallback((valor: Tentativa | null) => {
    tentativaRef.current = valor;
    espelharTentativa(valor ? { ...valor } : null);
  }, []);
  const marcarRascunho = useCallback((valor: boolean) => {
    rascunhoRef.current = valor;
    pendente.current?.(valor);
  }, []);
  const redesenhar = useCallback(() => {
    consultadoRef.current = null;
    definirFundamento(null);
    definirGeracao((atual) => atual + 1);
  }, []);

  const podeRedesenhar = useCallback(async () => {
    if (!rascunhoRef.current) return true;
    if (!(await confirmarDescarte('as alterações de gestão ainda não enviadas'))) return false;
    marcarRascunho(false);
    return true;
  }, [marcarRascunho]);

  const carregar = useCallback(async () => {
    if (!viva() || ocupadaRef.current || tentativaRef.current || !(await podeRedesenhar())) return;
    definirOcupada(true);
    try {
      const pagina = await servico.candidatosMedicacao({});
      if (!viva()) return;
      let familia: Awaited<ReturnType<ServicoTurnoExecucao['familiares']>> | null = null;
      let tipos: CatalogoTurnoPublico[] = [];
      if (pagina.pode_gerir) {
        [familia, tipos] = await Promise.all([
          servico.familiares({}),
          administrador ? servico.catalogo() : Promise.resolve([]),
        ]);
        if (!viva()) return;
      }
      definirProfissionais(pagina.itens);
      definirCursorProfissional(pagina.proximo_cursor);
      definirPodeGerir(pagina.pode_gerir);
      if (familia) {
        definirFamiliares(familia.itens);
        definirCursorFamiliar(familia.proximo_cursor);
        definirCatalogo(tipos);
      }
      redesenhar();
      definirCarregado(true);
      definirStatus('Permissões e configuração consultadas.');
    } catch (erro) {
      falha(erro);
    } finally {
      definirOcupada(false);
    }
  }, [
    viva,
    ocupadaRef,
    podeRedesenhar,
    definirOcupada,
    servico,
    administrador,
    redesenhar,
    definirStatus,
    falha,
  ]);

  const enviar = useCallback(async () => {
    const atual = tentativaRef.current;
    if (!viva() || ocupadaRef.current || !atual) return;
    definirOcupada(true);
    definirTentativa({ ...atual, consultada: false });
    definirStatus(`Registrando ${atual.descricao}…`);
    try {
      await atual.executar();
      if (!viva()) return;
      definirTentativa(null);
      marcarRascunho(false);
      definirOcupada(false);
      await carregar();
    } catch (erro) {
      if (!resultadoIncerto(erro)) definirTentativa(null);
      falha(erro);
    } finally {
      definirOcupada(false);
    }
  }, [
    viva,
    ocupadaRef,
    definirOcupada,
    definirTentativa,
    definirStatus,
    marcarRascunho,
    carregar,
    falha,
  ]);

  async function recuperar() {
    const atual = tentativaRef.current;
    if (!viva() || ocupadaRef.current || !atual) return;
    definirOcupada(true);
    try {
      const confirmou = await atual.confirmar();
      if (!viva() || !tentativaRef.current) return;
      if (confirmou) {
        definirTentativa(null);
        marcarRascunho(false);
        definirOcupada(false);
        await carregar();
      } else {
        definirTentativa({ ...atual, consultada: true });
        definirStatus(
          'Resultado ainda sem confirmação. Novas alterações seguem bloqueadas; você pode repetir exatamente o envio anterior.',
        );
      }
    } catch (erro) {
      falha(erro);
    } finally {
      definirOcupada(false);
    }
  }

  function iniciar(
    descricao: string,
    executar: () => Promise<unknown>,
    confirmar: () => Promise<boolean>,
  ) {
    if (tentativaRef.current || ocupadaRef.current) return;
    definirTentativa({ descricao, executar, confirmar, consultada: false });
    pendente.current?.(true);
    void enviar();
  }

  async function consultarTodosProfissionaisPara(id: string) {
    let cursor: string | undefined;
    do {
      const pagina = await servico.candidatosMedicacao(cursor ? { cursor_id: cursor } : {});
      const alvo = pagina.itens.find((item) => item.usuario_id === id);
      if (alvo) return alvo;
      cursor = pagina.proximo_cursor ?? undefined;
    } while (cursor && viva());
    return undefined;
  }

  async function maisProfissionais(cursor: string) {
    if (!viva() || ocupadaRef.current || !(await podeRedesenhar())) return;
    definirOcupada(true);
    try {
      const pagina = await servico.candidatosMedicacao({ cursor_id: cursor });
      if (!viva()) return;
      definirProfissionais((atuais) => [...atuais, ...pagina.itens]);
      definirCursorProfissional(pagina.proximo_cursor);
      definirPodeGerir(pagina.pode_gerir);
      redesenhar();
    } catch (erro) {
      falha(erro);
    } finally {
      definirOcupada(false);
    }
  }

  async function maisFamiliares(cursor: string) {
    if (!viva() || ocupadaRef.current || !(await podeRedesenhar())) return;
    definirOcupada(true);
    try {
      const pagina = await servico.familiares({ cursor_id: cursor });
      if (!viva()) return;
      definirFamiliares((atuais) => [...atuais, ...pagina.itens]);
      definirCursorFamiliar(pagina.proximo_cursor);
      redesenhar();
    } catch (erro) {
      falha(erro);
    } finally {
      definirOcupada(false);
    }
  }

  const escolherFamiliar = useCallback(
    async (id: string) => {
      const seletor = envolucroRef.current?.querySelector<HTMLSelectElement>(`#${ID_FAMILIAR}`);
      if (ocupadaRef.current || tentativaRef.current || !id) return;
      if (!(await podeRedesenhar())) {
        definirValorNativo(seletor, consultadoRef.current?.id ?? '');
        return;
      }
      if (ocupadaRef.current || tentativaRef.current || seletor?.value !== id) return;
      consultadoRef.current = null;
      definirFundamento(null);
      definirOcupada(true);
      definirStatus('Consultando fundamento selecionado…');
      try {
        const registro = await servico.consultarFundamento({ familiar_usuario_id: id });
        if (!viva() || seletor?.value !== id) return;
        consultadoRef.current = { id, versao: registro?.versao ?? 0 };
        definirFundamento({ id, registro });
        definirStatus('Fundamento consultado.');
      } catch (erro) {
        falha(erro);
      } finally {
        definirOcupada(false);
      }
    },
    [ocupadaRef, podeRedesenhar, definirOcupada, definirStatus, servico, viva, falha],
  );
  usarMudancaNativa(
    envolucroRef,
    ID_FAMILIAR,
    (valor) => void escolherFamiliar(valor),
    `${carregado}-${podeGerir}-${geracao}`,
  );

  function gravarFundamento(formulario: HTMLFormElement) {
    const consultado = consultadoRef.current;
    if (
      ocupadaRef.current ||
      tentativaRef.current ||
      !consultado ||
      consultado.id !== valorDe(formulario, 'familiar')
    )
      return;
    try {
      const fim = valorDe(formulario, 'vigencia_fim');
      const entrada = {
        familiar_usuario_id: consultado.id,
        versao_esperada: consultado.versao,
        estado: valorDe(formulario, 'estado') as 'vigente' | 'revogado',
        fundamento: valorDe(formulario, 'fundamento').trim(),
        vigencia_inicio: instanteTurno(valorDe(formulario, 'vigencia_inicio')),
        vigencia_fim: fim ? instanteTurno(fim) : null,
      };
      if (!entrada.fundamento || !['vigente', 'revogado'].includes(entrada.estado))
        throw new Error();
      const chave = crypto.randomUUID();
      iniciar(
        'fundamento familiar',
        () => servico.gravarFundamento(entrada, chave),
        async () => {
          const salvo = await servico.consultarFundamento({
            familiar_usuario_id: entrada.familiar_usuario_id,
          });
          return (
            salvo?.versao === entrada.versao_esperada + 1 &&
            salvo.estado === entrada.estado &&
            salvo.fundamento === entrada.fundamento
          );
        },
      );
    } catch {
      definirStatus('Confira familiar, fundamento, estado e vigência.');
    }
  }

  function configurarTipo(campo: CatalogoTurnoPublico, formulario: HTMLFormElement) {
    if (ocupadaRef.current || tentativaRef.current) return;
    const entrada = {
      tipo: campo.tipo,
      ativo: marcado(formulario, 'ativo'),
      referencia_informativa: valorDe(formulario, 'referencia').trim() || null,
    };
    const chave = crypto.randomUUID();
    iniciar(
      'configuração do catálogo',
      () => servico.configurarCatalogo(entrada, chave),
      async () =>
        (await servico.catalogo()).some(
          (item) =>
            item.tipo === entrada.tipo &&
            item.ativo === entrada.ativo &&
            item.referencia_informativa === entrada.referencia_informativa,
        ),
    );
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: a primeira consulta é só na montagem.
  useEffect(() => {
    // Fora do efeito: `carregar` trava os controles com `flushSync`, que não roda dentro
    // de um ciclo de vida do React.
    queueMicrotask(() => void carregar());
  }, []);

  if (perdida) return null;

  const travado = ocupada || tentativa !== null;
  const nomeados = familiares.filter((item) => item.nome?.trim());
  const registro = fundamento?.registro ?? null;

  return (
    <section ref={envolucroRef} className="turno-execucao grid min-w-0 gap-4">
      <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
        Autorizações e configuração do turno
      </h3>
      <EstadoTurno>{status}</EstadoTurno>
      <div className="flex min-w-0 flex-wrap gap-3">
        <Botao hidden={tentativa === null} disabled={ocupada} aoAtivar={() => void recuperar()}>
          Conferir alteração pendente
        </Botao>
        <Botao
          hidden={tentativa === null}
          disabled={ocupada || !tentativa?.consultada}
          aoAtivar={() => {
            if (tentativaRef.current?.consultada) void enviar();
          }}
        >
          Repetir exatamente a alteração conferida
        </Botao>
        <Botao disabled={travado} aoAtivar={() => void carregar()}>
          Atualizar gestão do turno
        </Botao>
      </div>
      {!carregado ? null : !podeGerir ? (
        <p className="m-0">
          Gestão de fundamentos e concessões disponível ao Administrador ou case manager atual com
          vínculo no caso.
        </p>
      ) : (
        <div key={geracao} className="grid min-w-0 gap-4">
          <fieldset disabled={travado} className={classeGrupo}>
            <legend className={classeLegenda}>Concessão de registro de medicação</legend>
            <p className="m-0 max-w-[68ch]">
              A concessão não comprova habilitação profissional. O servidor confere vínculo e
              permissão vigentes em cada ato.
            </p>
            {profissionais.map((pessoa) => (
              <p key={pessoa.usuario_id} className="m-0 flex min-w-0 flex-wrap items-center gap-3">
                <span>
                  {`${pessoa.nome ?? 'Colaborador sem identificação disponível'} · ${pessoa.concedida ? 'Concedida' : 'Não concedida'}`}
                </span>
                <Botao
                  aoAtivar={() => {
                    const entrada = { usuario_id: pessoa.usuario_id, concedida: !pessoa.concedida };
                    const chave = crypto.randomUUID();
                    iniciar(
                      'concessão de medicação',
                      () => servico.concederMedicacao(entrada, chave),
                      async () =>
                        (await consultarTodosProfissionaisPara(pessoa.usuario_id))?.concedida ===
                        entrada.concedida,
                    );
                  }}
                >
                  {pessoa.concedida ? 'Revogar concessão' : 'Conceder registro'}
                </Botao>
              </p>
            ))}
            {profissionais.length ? null : (
              <p className="m-0">Nenhum profissional elegível nesta página.</p>
            )}
            {cursorProfissional ? (
              <div>
                <Botao aoAtivar={() => void maisProfissionais(cursorProfissional)}>
                  Mais profissionais
                </Botao>
              </div>
            ) : null}
          </fieldset>
          <Formulario
            className="grid min-w-0 gap-3"
            aoEnviar={gravarFundamento}
            onInput={(evento) => {
              if ((evento.target as HTMLElement).id !== ID_FAMILIAR) marcarRascunho(true);
            }}
          >
            <fieldset disabled={travado} className={classeGrupo}>
              <legend className={classeLegenda}>Fundamento de autorização familiar</legend>
              <p className="m-0 max-w-[68ch]">
                Registre a base específica de autorização do caso. Parentesco ou vínculo genérico
                não substituem este fundamento; a autorização pode ser revogada.
              </p>
              <SelecaoTurno
                id={ID_FAMILIAR}
                rotulo="Familiar com acesso ao caso"
                nome="familiar"
                opcoes={nomeados.map((item) => ({
                  valor: item.usuario_id,
                  rotulo: item.nome ?? '',
                }))}
              />
              {familiares.length ? null : (
                <p className="m-0">Nenhum familiar elegível nesta página.</p>
              )}
              {familiares.some((item) => !item.nome?.trim()) ? (
                <p className="m-0">
                  Há cadastro sem identificação disponível; regularize os dados antes de
                  selecioná-lo.
                </p>
              ) : null}
              {cursorFamiliar ? (
                <div>
                  <Botao aoAtivar={() => void maisFamiliares(cursorFamiliar)}>
                    Mais familiares
                  </Botao>
                </div>
              ) : null}
              {fundamento ? (
                <p className="m-0">
                  {registro
                    ? `Versão ${registro.versao} registrada em ${new Date(registro.registrado_em).toLocaleString('pt-BR')}.`
                    : 'Nenhum fundamento registrado.'}
                </p>
              ) : null}
              {/* A chave troca a cada fundamento consultado: os campos nascem com o valor
                  gravado, como a versão imperativa fazia ao reescrever cada controle. */}
              <div key={fundamento ? `${fundamento.id}-${registro?.versao ?? 0}` : 'vazio'}>
                <SelecaoTurno
                  rotulo="Estado do fundamento"
                  nome="estado"
                  opcoes={[
                    { valor: 'vigente', rotulo: 'Vigente' },
                    { valor: 'revogado', rotulo: 'Revogado' },
                  ]}
                  valor={registro?.estado}
                />
                <CampoTurno
                  rotulo="Fundamento registrado"
                  nome="fundamento"
                  longo
                  valor={registro?.fundamento ?? ''}
                />
                <CampoTurno
                  rotulo="Início da vigência"
                  nome="vigencia_inicio"
                  tipo="datetime-local"
                  valor={dataLocalTurno(registro?.vigencia_inicio)}
                />
                <CampoTurno
                  rotulo="Fim da vigência (opcional)"
                  nome="vigencia_fim"
                  tipo="datetime-local"
                  obrigatorio={false}
                  valor={dataLocalTurno(registro?.vigencia_fim ?? undefined)}
                />
              </div>
              <div className="flex min-w-0 flex-wrap gap-3">
                <Botao tipo="submit" peso="principal" disabled={!fundamento}>
                  Registrar nova versão do fundamento
                </Botao>
              </div>
            </fieldset>
          </Formulario>
          {administrador ? (
            <fieldset disabled={travado} className={classeGrupo}>
              <legend className={classeLegenda}>Catálogo de medidas e observações</legend>
              {catalogo.map((campo) => (
                <Formulario
                  key={campo.tipo}
                  className="grid min-w-0 gap-2"
                  aoEnviar={(formulario) => configurarTipo(campo, formulario)}
                  onInput={() => marcarRascunho(true)}
                >
                  <h4 className="m-0 text-(length:--texto-2) font-semibold">
                    {`${rotuloSinal(campo.tipo)}${campo.observacao ? ' — observação de rotina' : campo.unidade ? ` (${campo.unidade})` : ''}`}
                  </h4>
                  <CaixaDeMarcacao
                    id={`turno-gestao-ativo-${campo.tipo}`}
                    name="ativo"
                    rotulo="Disponível para novos registros"
                    defaultChecked={campo.ativo}
                  />
                  <CampoTurno
                    rotulo="Referência informativa (opcional)"
                    nome="referencia"
                    longo
                    obrigatorio={false}
                    maxLength={300}
                    valor={campo.referencia_informativa ?? ''}
                    ajuda="Texto informado pela equipe. Não gera alerta, interpretação ou classificação automática."
                  />
                  <div className="flex min-w-0 flex-wrap gap-3">
                    <Botao tipo="submit" peso="principal">
                      Salvar configuração do tipo
                    </Botao>
                  </div>
                </Formulario>
              ))}
            </fieldset>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function montarGestaoExecucaoTurno(
  raiz: HTMLElement,
  servico: ServicoTurnoExecucao,
  opcoes: Opcoes,
): () => void {
  return ilha(raiz, <GestaoExecucaoTurno servico={servico} {...opcoes} />);
}
