/* Passagem de turno — consultar a anterior, registrar ciência, publicar a própria síntese
 * e só então encerrar —, reconstruída em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarPassagemTurno(raiz, pacienteId, turno, servico,
 * opcoes)` devolve a desmontagem, e `opcoes.encerrar(registroId)` continua sendo quem
 * fecha o turno — esta tela nunca encerra sozinha.
 *
 * O que a migração entrega:
 *
 * 1. VIS-012. Sumiram os cinco `if (!ativa)`/`if (ativa)` que protegiam escrita em DOM já
 *    removido. Sobrou o sinal nos pontos que moram FORA da ilha, reunidos em `fora()`.
 * 2. A árvore de leitura — passagem anterior, autoria, ciência, recebimento — deixa de ser
 *    montada nó a nó e passa a ser descrita uma vez só.
 *
 * Os campos da síntese (`web/modelo-sintese.tsx`) são compostos nesta árvore desde
 * 27/11/2026. Antes eram montados à mão num contêiner com ref — DOM escrito por fora numa
 * árvore do React, a direção que produziu os `NotFoundError` desta migração. Os `id`, a
 * precedência dos valores e a remontagem a cada consulta continuam os mesmos.
 *
 * O que NÃO mudou, de propósito (VIS-018): consultar NÃO registra ciência; sem publicação
 * confirmada não há encerramento; o encerramento exige confirmação explícita em caixa; a
 * tentativa sem confirmação preserva dados, versão e MESMA CHAVE até ser repetida ou
 * descartada à mão; o descarte exige consulta posterior à recusa; e nenhuma mensagem
 * mudou de palavra.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { statusErroHttp } from '../packages/contracts/src/erros.js';
import type {
  PassagemTurno,
  PublicarPassagem,
  ReferenciaPassagem,
} from '../packages/contracts/src/turno-passagem.js';
import type { Turno } from '../packages/contracts/src/turno.js';
import { FalhaApi } from './api.js';
import { Botao } from './componentes/ui/botao.js';
import './estilos/tema.css';
import {
  CAMPOS_SINTESE,
  CamposSintese,
  type ValoresSintese,
  controleSintese,
  lerSintese,
} from './modelo-sintese.js';
import { ilha } from './ponte/ilha.js';
import type { ServicoTurnoHttp } from './servico-turno-http.js';
import { Formulario } from './telas/formulario.js';

type OpcoesPassagem = {
  acessoPerdido(): void;
  alteracaoPendente?(valor: boolean): void;
  encerrar(registroId: string): Promise<void>;
};

function Linha({ children }: { children: React.ReactNode }) {
  return <p className="m-0 max-w-[68ch] text-(length:--texto-2)">{children}</p>;
}

function data(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

function Referencia({
  valor,
  nome,
}: {
  valor: ReferenciaPassagem;
  nome: (id: string) => string;
}) {
  const campos: ReadonlyArray<[string, string | undefined]> = [
    ['Área', valor.conteudo.area],
    ['Data do atendimento', valor.conteudo.data],
    ['Atividade', valor.conteudo.atividade],
    ['Observações compartilháveis', valor.conteudo.observacoesCompartilhaveis],
    ['Progresso', valor.conteudo.progresso],
    ['Orientação', valor.conteudo.orientacao],
    ['Próximo passo', valor.conteudo.proximoPasso],
    ['Objetivo relacionado', valor.conteudo.objetivoRelacionado],
  ];
  return (
    <>
      <Linha>
        {`Turno iniciado em ${data(valor.turno_aberto_em)}${
          valor.turno_encerrado_em
            ? ` e encerrado em ${data(valor.turno_encerrado_em)}`
            : ' · Ainda aberto'
        }.`}
      </Linha>
      <Linha>
        {`Autor: ${nome(valor.autor_usuario_id)} · Publicada em ${data(valor.publicado_em)} · Versão de passagem ${valor.versao_passagem}`}
      </Linha>
      {campos.map(([rotulo, conteudo]) =>
        conteudo ? <Linha key={rotulo}>{`${rotulo}: ${conteudo}`}</Linha> : null,
      )}
    </>
  );
}

/** Caixa de confirmação do encerramento.
 *
 *  O `change` é ouvido no próprio nó, não pela delegação do React, pela mesma razão de
 *  `web/telas/formulario.tsx`: a prova de tela dispara `new Event('change')` sem
 *  `bubbles`, e o botão precisa destravar NA HORA para quem marca e clica em seguida. */
function ConfirmacaoEncerramento({ aoMudar }: { aoMudar: (marcado: boolean) => void }) {
  const caixa = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controle = caixa.current;
    if (!controle) return;
    const ouvir = () => flushSync(() => aoMudar(controle.checked));
    controle.addEventListener('change', ouvir);
    return () => controle.removeEventListener('change', ouvir);
  }, [aoMudar]);
  return (
    <div className="flex min-h-controle-md items-center gap-2">
      <input
        id="passagem-confirmar-encerramento"
        type="checkbox"
        ref={caixa}
        className="h-5 w-5 flex-none accent-primaria"
      />
      <label
        htmlFor="passagem-confirmar-encerramento"
        className="m-0 cursor-pointer text-(length:--texto-2) leading-[1.4]"
      >
        Confirmo o encerramento com esta síntese publicada.
      </label>
    </div>
  );
}

function TelaPassagemTurno({
  raiz,
  pacienteId,
  turno,
  servico,
  opcoes,
}: {
  raiz: HTMLElement;
  pacienteId: string;
  turno: Turno;
  servico: ServicoTurnoHttp;
  opcoes: OpcoesPassagem;
}) {
  const [status, definirStatus] = useState('Consultando passagem…');
  const [passagem, definirPassagem] = useState<PassagemTurno | null>(null);
  const passagemRef = useRef<PassagemTurno | null>(null);
  const [perdido, definirPerdido] = useState(false);

  const [ocupada, marcarOcupada] = useState(false);
  const ocupadaRef = useRef(false);
  const definirOcupada = useCallback((valor: boolean) => {
    ocupadaRef.current = valor;
    marcarOcupada(valor);
  }, []);

  /* Os botões do conteúdo ficam inertes enquanto a operação corre, e voltam quando uma
     consulta bem-sucedida redesenha — exatamente o que a versão imperativa fazia
     percorrendo `conteudo.querySelectorAll('button')`. */
  const [travado, definirTravado] = useState(false);
  const [confirmado, definirConfirmado] = useState(false);

  /** A tentativa sem confirmação: mesma entrada, MESMA CHAVE, até confirmar ou descartar. */
  const publicacaoRef = useRef<{ entrada: PublicarPassagem; chave: string } | null>(null);
  const rascunhoRef = useRef<PublicarPassagem['conteudo'] | null>(null);
  const camposRascunhoRef = useRef<Record<string, string> | null>(null);
  const novaVersaoRef = useRef(false);
  const recusaDefinitivaRef = useRef(false);
  const consultaAposRecusaRef = useRef(false);
  const [podeDescartar, definirPodeDescartar] = useState(false);
  const chaveCienciaRef = useRef(crypto.randomUUID());

  /** Troca a chave do editor e o remonta: cada consulta reconstrói os campos, como antes. */
  const [carga, definirCarga] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);

  const controladorRef = useRef<AbortController | null>(null);
  controladorRef.current ??= new AbortController();

  /** O que mora FORA da ilha continua precisando do sinal (VIS-012). */
  const fora = useCallback(
    <T,>(acao: (destino: OpcoesPassagem) => T): T | undefined =>
      controladorRef.current?.signal.aborted ? undefined : acao(opcoes),
    [opcoes],
  );

  /** O antigo `capturarEditor()`: guarda o que está digitado antes de o editor ser
   *  remontado pela consulta seguinte. */
  const capturarEditor = useCallback(() => {
    const destino = editorRef.current;
    if (!destino) return;
    camposRascunhoRef.current = Object.fromEntries(
      [
        ...destino.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          'input,textarea,select',
        ),
      ].map((controle) => [controle.id, controle.value]),
    );
  }, []);

  const falhou = useCallback(
    (erro: unknown) => {
      const codigo =
        erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
      if (codigo === 'sem_permissao' || codigo === 'nao_autenticado') {
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
          ? 'A síntese ou o vínculo mudou. Consulte a passagem e publique nova versão explicitamente se necessário. O turno não foi tratado como encerrado.'
          : 'Resultado não confirmado. Consulte a passagem antes de repetir; nenhuma ciência ou publicação foi presumida.',
      );
    },
    [fora],
  );

  const carregar = useCallback(async () => {
    if (!publicacaoRef.current) capturarEditor();
    definirStatus('Consultando passagem…');
    const consultada = await servico.consultarPassagem(pacienteId, turno.turno_id);
    if (publicacaoRef.current && recusaDefinitivaRef.current) consultaAposRecusaRef.current = true;
    const pendente = publicacaoRef.current;
    if (
      consultada.propria &&
      pendente &&
      consultada.propria.versao_passagem === pendente.entrada.versao_esperada + 1 &&
      JSON.stringify(consultada.propria.conteudo) === JSON.stringify(pendente.entrada.conteudo)
    ) {
      publicacaoRef.current = null;
      rascunhoRef.current = null;
      camposRascunhoRef.current = null;
      novaVersaoRef.current = false;
      fora((destino) => destino.alteracaoPendente?.(false));
    }
    passagemRef.current = consultada;
    definirPassagem(consultada);
    definirCarga((valor) => valor + 1);
    definirTravado(false);
    definirStatus('Passagem consultada. Ciência exige confirmação própria.');
  }, [capturarEditor, fora, pacienteId, servico, turno.turno_id]);

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
        definirPodeDescartar(
          Boolean(publicacaoRef.current) &&
            recusaDefinitivaRef.current &&
            consultaAposRecusaRef.current,
        );
      }
    },
    [definirOcupada, falhou],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: é a montagem da tela, e só ela. As funções são estáveis por caso, e listá-las aqui só criaria releitura a cada repintura.
  useEffect(() => {
    const controlador = controladorRef.current;
    void executar(carregar);
    return () => controlador?.abort();
  }, []);

  useEffect(() => {
    raiz.setAttribute('aria-busy', String(ocupada));
  }, [raiz, ocupada]);

  const areaPassagem = passagem?.area_passagem ?? null;
  const mostraEditor =
    passagem !== null &&
    (!passagem.propria || novaVersaoRef.current || publicacaoRef.current !== null) &&
    turno.situacao === 'aberto' &&
    areaPassagem !== null;
  const prefixoSintese = `passagem-${turno.turno_id}`;
  /* Os campos nascem de novo a cada consulta (a chave é `carga`), preenchidos pela mesma
     ordem de precedência de antes: a tentativa pendente, depois o rascunho descartado,
     depois o que estava digitado. A área não vem do rascunho: é a configurada agora, e um
     valor guardado só vale se ainda for uma das opções. */
  function valoresIniciais(): ValoresSintese {
    const pendente = publicacaoRef.current;
    const valores = pendente?.entrada.conteudo ?? rascunhoRef.current;
    const iniciais: ValoresSintese = valores
      ? {
          data: valores.data,
          atividade: valores.atividade ?? '',
          observacoes: valores.observacoesCompartilhaveis ?? '',
          progresso: valores.progresso ?? '',
          orientacao: valores.orientacao ?? '',
          proximo: valores.proximoPasso ?? '',
          objetivo: valores.objetivoRelacionado ?? '',
        }
      : {};
    const guardado = camposRascunhoRef.current;
    if (!pendente && guardado)
      for (const campo of CAMPOS_SINTESE) {
        const valor = guardado[`${prefixoSintese}-${campo}`];
        if (valor !== undefined) iniciais[campo] = valor;
      }
    return iniciais;
  }

  if (perdido) return null;

  const nome = (id: string) =>
    passagem?.identidades.find((p) => p.usuario_id === id)?.rotulo ??
    'Identidade histórica indisponível';

  const pendente = publicacaoRef.current;
  const valoresPendentes = pendente?.entrada.conteudo ?? rascunhoRef.current;
  const avisoArea =
    valoresPendentes && areaPassagem !== null && valoresPendentes.area !== areaPassagem
      ? `Área anterior: ${valoresPendentes.area}. Confira a área atual antes de enviar nova tentativa.`
      : null;
  const versaoDivergente = Boolean(
    pendente &&
      passagem?.propria &&
      passagem.propria.versao_passagem !== pendente.entrada.versao_esperada,
  );
  const semModelo =
    passagem !== null &&
    (!passagem.propria || novaVersaoRef.current || pendente !== null) &&
    areaPassagem === null;

  function registrarCiencia() {
    void executar(async () => {
      await servico.registrarCiencia(pacienteId, turno.turno_id, chaveCienciaRef.current);
      chaveCienciaRef.current = crypto.randomUUID();
      await carregar();
    });
  }

  function publicar() {
    if (ocupadaRef.current) return;
    const valor = lerSintese(editorRef.current, prefixoSintese);
    if (!publicacaoRef.current && (!valor || !valor.atividade)) {
      definirStatus('Informe data, área e atividade para publicar.');
      controleSintese(editorRef.current, prefixoSintese, 'atividade')?.focus();
      return;
    }
    if (!publicacaoRef.current && valor) {
      recusaDefinitivaRef.current = false;
      consultaAposRecusaRef.current = false;
      publicacaoRef.current = {
        entrada: {
          conteudo: valor,
          versao_esperada: passagemRef.current?.propria?.versao_passagem ?? 0,
        },
        chave: crypto.randomUUID(),
      };
    }
    const comando = publicacaoRef.current;
    if (!comando) return;
    void executar(async () => {
      await servico.publicarPassagem(pacienteId, turno.turno_id, comando.entrada, comando.chave);
      await carregar();
    });
  }

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
        {passagem === null ? null : (
          <>
            <Linha>
              Identificação exibida conforme cadastro disponível; não comprova o nome usado na época
              do registro.
            </Linha>
            {passagem.anterior ? (
              <section className="grid min-w-0 gap-2">
                <h4 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
                  Passagem do turno anterior
                </h4>
                <Referencia valor={passagem.anterior.referencia} nome={nome} />
                {passagem.anterior.ciencia ? (
                  <Linha>
                    {`Ciência registrada por ${nome(passagem.anterior.ciencia.usuario_id)} em ${data(
                      passagem.anterior.ciencia.registrada_em,
                    )}.`}
                  </Linha>
                ) : (
                  <>
                    <Linha>
                      Passagem consultada. Ciência ainda pendente; ler esta tela não registra
                      ciência.
                    </Linha>
                    <div>
                      <Botao peso="principal" disabled={travado} aoAtivar={registrarCiencia}>
                        Registrar minha ciência
                      </Botao>
                    </div>
                  </>
                )}
              </section>
            ) : (
              <Linha>Nenhuma passagem anterior destinada a este turno.</Linha>
            )}
            <h4 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
              Minha síntese de passagem
            </h4>
            {passagem.propria ? (
              <div className="grid min-w-0 gap-2">
                <Referencia valor={passagem.propria} nome={nome} />
                {passagem.recebimento ? (
                  <Linha>{`Destinatário: ${nome(passagem.recebimento.usuario_id)}.`}</Linha>
                ) : null}
                <Linha>
                  {!passagem.recebimento
                    ? 'Aguardando o próximo turno.'
                    : passagem.recebimento.ciencia
                      ? `Consultada${passagem.recebimento.consultado_em ? ` em ${data(passagem.recebimento.consultado_em)}` : ''}. Ciência registrada por ${nome(passagem.recebimento.ciencia.usuario_id)} em ${data(passagem.recebimento.ciencia.registrada_em)}.`
                      : passagem.recebimento.consultado_em
                        ? `Consultada em ${data(passagem.recebimento.consultado_em)}. Ciência ainda não registrada.`
                        : `Enviada a ${nome(passagem.recebimento.usuario_id)} no turno seguinte; ainda não consultada.`}
                </Linha>
                {turno.situacao === 'aberto' && !novaVersaoRef.current && pendente === null ? (
                  <div className="grid min-w-0 justify-items-start gap-3">
                    <Botao
                      disabled={travado}
                      aoAtivar={() => {
                        novaVersaoRef.current = true;
                        void executar(carregar);
                      }}
                    >
                      Publicar nova versão de passagem
                    </Botao>
                    <ConfirmacaoEncerramento aoMudar={definirConfirmado} />
                    <Botao
                      peso="principal"
                      disabled={!confirmado || travado}
                      aoAtivar={() => {
                        const registroId = passagem.propria?.registro_id;
                        if (!confirmado || !registroId) return;
                        void executar(
                          () =>
                            fora((destino) => destino.encerrar(registroId)) ?? Promise.resolve(),
                        );
                      }}
                    >
                      Encerrar meu turno
                    </Botao>
                  </div>
                ) : null}
              </div>
            ) : null}
            {semModelo ? (
              <Linha>
                O modelo por área de passagem ainda não foi configurado pela equipe. Publicação e
                encerramento indisponíveis.
              </Linha>
            ) : null}
            {mostraEditor ? (
              <Formulario
                noValidate
                className="grid min-w-0 gap-4"
                onInput={() => fora((destino) => destino.alteracaoPendente?.(true))}
                aoEnviar={publicar}
              >
                <div ref={editorRef} className="grid min-w-0 gap-4">
                  {areaPassagem !== null ? (
                    <CamposSintese
                      key={carga}
                      areas={[areaPassagem]}
                      prefixo={prefixoSintese}
                      iniciais={valoresIniciais()}
                      desabilitado={pendente !== null}
                    />
                  ) : null}
                </div>
                {avisoArea ? <Linha>{avisoArea}</Linha> : null}
                <Linha>
                  A síntese será publicada no Diário para a equipe e vinculada a este turno na mesma
                  operação.
                </Linha>
                {pendente ? (
                  <Linha>
                    Publicação anterior sem confirmação. A repetição usa os mesmos dados e a mesma
                    chave; consulte antes de repetir.
                  </Linha>
                ) : null}
                {versaoDivergente ? (
                  <Linha>
                    Outra versão está vigente. A tentativa pendente não será reapresentada com
                    versão alterada automaticamente.
                  </Linha>
                ) : null}
                <div>
                  <Botao peso="principal" tipo="submit" disabled={versaoDivergente || travado}>
                    {pendente ? 'Repetir publicação pendente' : 'Publicar síntese de passagem'}
                  </Botao>
                </div>
              </Formulario>
            ) : null}
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap gap-3">
        <Botao disabled={ocupada} aoAtivar={() => void executar(carregar)}>
          Consultar passagem
        </Botao>
        <Botao
          hidden={!podeDescartar}
          disabled={ocupada}
          aoAtivar={() => {
            if (
              ocupadaRef.current ||
              !publicacaoRef.current ||
              !recusaDefinitivaRef.current ||
              !consultaAposRecusaRef.current
            )
              return;
            rascunhoRef.current = publicacaoRef.current.entrada.conteudo;
            camposRascunhoRef.current = null;
            publicacaoRef.current = null;
            novaVersaoRef.current = true;
            definirPodeDescartar(false);
            void executar(carregar);
          }}
        >
          Descartar tentativa e editar síntese
        </Botao>
      </div>
    </div>
  );
}

export function montarPassagemTurno(
  raiz: HTMLElement,
  pacienteId: string,
  turno: Turno,
  servico: ServicoTurnoHttp,
  opcoes: OpcoesPassagem,
): () => void {
  const desmontar = ilha(
    raiz,
    <TelaPassagemTurno
      raiz={raiz}
      pacienteId={pacienteId}
      turno={turno}
      servico={servico}
      opcoes={opcoes}
    />,
  );
  return () => {
    desmontar();
    raiz.removeAttribute('aria-busy');
  };
}
