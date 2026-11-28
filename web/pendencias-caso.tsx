/* Pendências do caso (FR-027) e sinal operacional (FR-028) na ficha.
 *
 * O efeito de carregamento invalida a leitura anterior quando muda o caso.
 * O sinal e as pendências compartilham uma superfície com subseções em h3.
 *
 * O que NÃO mudou, de propósito (VIS-018):
 *
 * - **Nenhuma frase mudou de palavra.**
 * - O sinal nunca é lido como avaliação clínica: `avisoSinalOperacional` aparece junto do
 *   estado, nunca escondido.
 * - Resolver nunca apaga a origem: o registro resolvido continua listado, com "Reabrir".
 * - O editor de periodicidade só é montado quando `sinal.perfil_escrita_acordo` autoriza;
 *   esconder o formulário é conveniência de interface, a recusa real continua no banco.
 * - "Escritas no plantão" distingue três leituras: sem fonte (`listarPendenciasEscritas`
 *   não passada) não aparece nada; fonte que falhou (`null`) avisa que a leitura falhou
 *   sem dizer que não há pendência; fonte vazia (`[]`) também não desenha a seção — só
 *   quando há pelo menos um item escrito a seção aparece com conteúdo.
 *
 * **O DOM continua dono do valor dos campos do acordo.** Os campos são NÃO controlados,
 * como na versão imperativa, e a leitura é por `name` via `valorDe` de
 * `web/telas/formulario.tsx`. O `<select>` de "Atribuir a" ouve `change` NATIVO, ligado
 * direto ao próprio nó — não pela delegação do React —, pela mesma razão documentada em
 * `web/telas/formulario.tsx`: as provas de tela despacham `new Event('change')` sem
 * `bubbles`, que não alcança a raiz onde o React escuta. O `<form>` do acordo usa o
 * próprio `Formulario`, que já resolve o mesmo problema para `submit`.
 *
 * Por que o formulário do acordo carrega `key={versão do acordo}`: a versão imperativa
 * reconstruía o `<form>` inteiro a cada desenho, e um acordo salvo com sucesso aparecia
 * com os valores que o servidor confirmou. Os campos aqui são não controlados — sem
 * remontar, o React preservaria o que a pessoa digitou por cima da confirmação do
 * servidor. A troca de `key` força a remontagem só quando a versão do acordo muda. Pela
 * mesma razão, cada item de pendência carrega `chave_origem` e `estado` na própria chave:
 * o `<select>` de atribuição é ação, não leitura, e deve voltar a "Escolha uma pessoa"
 * depois que o servidor confirma a mudança de estado.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { PendenciaPlantaoHttp } from '../packages/contracts/src/ficha-plantao-http.js';
import {
  avisoSinalOperacional,
  rotulosEstadoPendencia,
  rotulosEstadoSinal,
  rotulosTipoPendencia,
  type AcaoPendencia,
  type Pendencia,
  type SalvarAcordo,
  type SinalOperacional,
  type TratarPendencia,
} from '../packages/contracts/src/pendencia.js';
import type { ResponsavelOpcao } from './acompanhamento-caso.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { Botao } from './componentes/ui/botao.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { Campo } from './componentes/ui/campo.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { Superficie } from './componentes/ui/superficie.js';
import { dataDeInstante } from './datas.js';
import './estilos/tema.css';
import { Formulario, valorDe } from './telas/formulario.js';

export type ServicoPendencias = {
  consultar(pacienteId: string): Promise<SinalOperacional>;
  acordar(pacienteId: string, acordo: SalvarAcordo): Promise<SinalOperacional>;
  tratar(pacienteId: string, tratativa: TratarPendencia): Promise<SinalOperacional>;
};

function dataCivil(valor: string | null | undefined): string {
  if (!valor) return '';
  const [ano, mes, dia] = valor.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

/** Ações oferecidas por estado. Nenhuma delas apaga a origem: todas gravam um evento
 *  novo contra a mesma chave de origem (FR-027). "Reabrir" existe para desfazer uma
 *  resolução sem apagar o registro de que ela aconteceu. */
function acoesDisponiveis(estado: Pendencia['estado']): { acao: AcaoPendencia; rotulo: string }[] {
  if (estado === 'resolvida') return [{ acao: 'reaberta', rotulo: 'Reabrir' }];
  return [
    ...(estado === 'aberta' ? [{ acao: 'reconhecida' as const, rotulo: 'Reconhecer' }] : []),
    { acao: 'atribuida' as const, rotulo: 'Atribuir' },
    { acao: 'resolvida' as const, rotulo: 'Resolver' },
  ];
}

/** O indicador de ação em curso. A mensagem acessível continua no `role="status"` da
 *  tela; isto é só a pintura. */
function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

/** O `<select>` de "Atribuir a" ouve `change` DIRETO no próprio nó — não pela delegação
 *  do React — pela razão documentada no cabeçalho do arquivo. */
function SelecaoAtribuir({
  equipe,
  disabled,
  aoEscolher,
}: {
  equipe: readonly ResponsavelOpcao[];
  disabled: boolean;
  aoEscolher: (usuarioId: string) => void;
}) {
  const id = useId();
  const referencia = useRef<HTMLSelectElement>(null);
  const escolher = useRef(aoEscolher);
  escolher.current = aoEscolher;
  useEffect(() => {
    const no = referencia.current;
    if (!no) return;
    const ouvir = () => {
      if (!no.value) return;
      escolher.current(no.value);
    };
    no.addEventListener('change', ouvir);
    return () => no.removeEventListener('change', ouvir);
  }, []);
  return (
    <label
      htmlFor={id}
      className="pendencia-atribuir grid min-w-0 gap-1 text-(length:--texto-1) font-semibold"
    >
      <span>Atribuir a</span>
      <SelecaoAprimorada
        id={id}
        aria-label="Atribuir a"
        ref={referencia}
        disabled={disabled}
        defaultValue=""
      >
        <option value="">Escolha uma pessoa</option>
        {equipe
          .filter((opcao) => opcao.ativo)
          .map((opcao) => (
            <option key={opcao.usuario_id} value={opcao.usuario_id}>
              {opcao.rotulo}
            </option>
          ))}
      </SelecaoAprimorada>
    </label>
  );
}

function PendenciaItem({
  pendencia,
  equipe,
  gravando,
  aoAplicar,
}: {
  pendencia: Pendencia;
  equipe: readonly ResponsavelOpcao[];
  gravando: boolean;
  aoAplicar: (tratativa: TratarPendencia) => void;
}) {
  const marcas = [`Situação: ${rotulosEstadoPendencia[pendencia.estado]}`];
  if (pendencia.desde) marcas.push(`Desde ${dataCivil(pendencia.desde)}`);
  if (pendencia.atribuido_usuario_id)
    marcas.push(
      `Atribuída a ${
        equipe.find((opcao) => opcao.usuario_id === pendencia.atribuido_usuario_id)?.rotulo ??
        'pessoa da equipe'
      }`,
    );
  if (pendencia.tratada_em && dataDeInstante(pendencia.tratada_em))
    marcas.push(`Última tratativa em ${dataDeInstante(pendencia.tratada_em)}`);

  const acoes = acoesDisponiveis(pendencia.estado).filter(
    ({ acao }) => acao !== 'atribuida' || equipe.some((opcao) => opcao.ativo),
  );

  return (
    <li
      data-tipo={pendencia.tipo}
      data-estado={pendencia.estado}
      className="pendencia-item grid min-w-0 gap-2 rounded-cartao border border-borda p-4"
    >
      <p className="pendencia-tipo m-0 font-semibold">{rotulosTipoPendencia[pendencia.tipo]}</p>
      <p className="pendencia-motivo m-0 max-w-[68ch]">{pendencia.motivo}</p>
      <p className="pendencia-marcas m-0 text-(length:--texto-1) text-texto-suave">
        {marcas.join(' · ')}
      </p>
      {acoes.length ? (
        <div className="pendencia-acoes flex flex-wrap items-end gap-3">
          {acoes.map(({ acao, rotulo }) =>
            acao === 'atribuida' ? (
              <SelecaoAtribuir
                key="atribuida"
                equipe={equipe}
                disabled={gravando}
                aoEscolher={(usuarioId) =>
                  aoAplicar({
                    tipo: pendencia.tipo,
                    chave_origem: pendencia.chave_origem,
                    acao: 'atribuida',
                    atribuido_usuario_id: usuarioId,
                  })
                }
              />
            ) : (
              <Botao
                key={acao}
                peso="discreto"
                disabled={gravando}
                aoAtivar={() =>
                  aoAplicar({
                    tipo: pendencia.tipo,
                    chave_origem: pendencia.chave_origem,
                    acao,
                    atribuido_usuario_id: null,
                  })
                }
              >
                {rotulo}
              </Botao>
            ),
          )}
        </div>
      ) : null}
    </li>
  );
}

type Fase =
  | { fase: 'carregando' }
  | {
      fase: 'pronta';
      sinal: SinalOperacional;
      equipe: readonly ResponsavelOpcao[];
      escritas: PendenciaPlantaoHttp[] | null;
    }
  | { fase: 'erro'; erro: unknown };

/** Interface das pendências do caso (FR-027) e do sinal operacional (FR-028).
 *
 * Duas coisas que a tela nunca faz, porque o requisito proíbe:
 * - não apresenta o sinal como leitura clínica. O aviso de FR-028 aparece junto do estado,
 *   não escondido num rodapé, e "em dia" sempre vem com o motivo que o sustenta;
 * - não esconde a origem de uma pendência resolvida. Resolver muda o estado; a origem
 *   continua listada com o motivo que a gerou e pode ser reaberta.
 *
 * O editor de periodicidade só aparece para quem o servidor autoriza a gravá-lo; esconder
 * o formulário é conveniência, a recusa real continua no banco. */
export function TelaPendenciasCaso({
  pacienteId,
  servico,
  acessoPerdido,
  listarResponsaveis,
  listarPendenciasEscritas,
}: {
  pacienteId: string;
  servico: ServicoPendencias;
  acessoPerdido: (erro: unknown) => void;
  listarResponsaveis?: () => Promise<ResponsavelOpcao[]>;
  listarPendenciasEscritas?: () => Promise<PendenciaPlantaoHttp[]>;
}) {
  const [descartada, definirDescartada] = useState(false);
  const [estado, definirEstado] = useState<Fase>({ fase: 'carregando' });
  const [aviso, definirAviso] = useState('');
  const [avisoTom, definirAvisoTom] = useState<'error' | undefined>(undefined);
  const [erroAcordo, definirErroAcordo] = useState('');

  /* Decisão SÍNCRONA lida no meio de fluxo assíncrono — reentrância de clique ou de
     "change" — mora em ref e é espelhada para a renderização, como nas demais telas
     migradas: ler o `useState` nessas posições devolveria o valor do render anterior. */
  const emCursoRef = useRef(false);
  const [emCurso, marcarEmCurso] = useState(false);
  const definirEmCurso = useCallback((valor: boolean) => {
    emCursoRef.current = valor;
    marcarEmCurso(valor);
  }, []);

  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;
  const listarResponsaveisAtual = useRef(listarResponsaveis);
  listarResponsaveisAtual.current = listarResponsaveis;
  const listarPendenciasEscritasAtual = useRef(listarPendenciasEscritas);
  listarPendenciasEscritasAtual.current = listarPendenciasEscritas;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;

  /** Revalidação de acesso: a raiz é esvaziada ANTES de avisar. */
  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    flushSync(() => definirDescartada(true));
    avisarPerda.current(erro);
    return true;
  }, []);

  /* As duas consultas saem juntas, e a lista da equipe nunca atrasa a pendência: ela só
     enriquece a atribuição. Em série, uma equipe lenta deixava a tela no esqueleto de
     carregamento sem nada para mostrar (smoke de 13/11/2026). */
  useEffect(() => {
    let valida = true;
    (async () => {
      try {
        const equipePedida = listarResponsaveisAtual.current
          ? listarResponsaveisAtual.current().catch((erro: unknown) => {
              // Sem a lista da equipe a atribuição fica indisponível, mas a pendência não se perde.
              if (exigeNovoAcesso(erro)) throw erro;
              return [] as ResponsavelOpcao[];
            })
          : Promise.resolve([] as ResponsavelOpcao[]);
        // A ficha de plantão tem interruptor próprio e pode estar desligada: a falha dela
        // não pode derrubar a carteira nem alterar as quatro derivadas. Falha de leitura
        // NÃO pode virar "ninguém escreveu pendência": `null` distingue "não deu para ler"
        // de "leu e não há nenhuma".
        const escritasPedidas: Promise<PendenciaPlantaoHttp[] | null> =
          listarPendenciasEscritasAtual.current
            ? listarPendenciasEscritasAtual.current().catch((erro: unknown) => {
                if (exigeNovoAcesso(erro)) throw erro;
                return null;
              })
            : Promise.resolve([] as PendenciaPlantaoHttp[]);
        const [sinal, equipe, escritas] = await Promise.all([
          servicoAtual.current.consultar(pacienteId),
          equipePedida,
          escritasPedidas,
        ]);
        if (!valida) return;
        flushSync(() => definirEstado({ fase: 'pronta', sinal, equipe, escritas }));
      } catch (erro) {
        if (!valida || descartarAcesso(erro)) return;
        flushSync(() => definirEstado({ fase: 'erro', erro }));
      }
    })();
    return () => {
      valida = false;
    };
  }, [pacienteId, descartarAcesso]);

  const aplicar = useCallback(
    (tratativa: TratarPendencia) => {
      if (emCursoRef.current) return;
      flushSync(() => {
        definirEmCurso(true);
        definirAviso('Registrando…');
        definirAvisoTom(undefined);
      });
      servicoAtual.current
        .tratar(pacienteId, tratativa)
        .then(
          (atualizado) => {
            flushSync(() => {
              definirEstado((atual) =>
                atual.fase === 'pronta' ? { ...atual, sinal: atualizado } : atual,
              );
              definirAviso('');
            });
          },
          (erro: unknown) => {
            if (descartarAcesso(erro)) return;
            flushSync(() => {
              definirAviso(mensagemFalha(erro));
              definirAvisoTom('error');
            });
          },
        )
        .finally(() => definirEmCurso(false));
    },
    [pacienteId, descartarAcesso, definirEmCurso],
  );

  const gravarAcordo = useCallback(
    (acordo: SalvarAcordo) => {
      if (emCursoRef.current) return;
      flushSync(() => {
        definirEmCurso(true);
        definirAviso('Salvando periodicidade…');
        definirAvisoTom(undefined);
      });
      servicoAtual.current
        .acordar(pacienteId, acordo)
        .then(
          (atualizado) => {
            flushSync(() => {
              definirEstado((atual) =>
                atual.fase === 'pronta' ? { ...atual, sinal: atualizado } : atual,
              );
              definirAviso('');
            });
          },
          (erro: unknown) => {
            if (descartarAcesso(erro)) return;
            flushSync(() => {
              definirAviso(mensagemFalha(erro));
              definirAvisoTom('error');
            });
          },
        )
        .finally(() => definirEmCurso(false));
    },
    [pacienteId, descartarAcesso, definirEmCurso],
  );

  function enviarAcordo(formulario: HTMLFormElement, sinalAtual: SinalOperacional) {
    const opcional = valorDe(formulario, 'dias_entre_atualizacoes').trim();
    const entre = opcional === '' ? null : Number(opcional);
    if (entre !== null && (!Number.isInteger(entre) || entre < 1 || entre > 365)) {
      definirErroAcordo('Informe de 1 a 365 dias, ou deixe em branco.');
      (
        formulario.elements.namedItem('dias_entre_atualizacoes') as HTMLInputElement | null
      )?.focus();
      return;
    }
    definirErroAcordo('');
    gravarAcordo({
      versao_esperada: sinalAtual.acordo?.versao ?? 0,
      dias_entre_atualizacoes: entre,
      dias_antecedencia_revisao: Number(valorDe(formulario, 'dias_antecedencia_revisao')),
      dias_retorno_encaminhamento: Number(valorDe(formulario, 'dias_retorno_encaminhamento')),
      proxima_revisao_em:
        valorDe(formulario, 'proxima_revisao_em') === ''
          ? null
          : valorDe(formulario, 'proxima_revisao_em'),
    });
  }

  if (descartada) return null;

  if (estado.fase === 'carregando')
    return (
      <div className="grid min-w-0 gap-4">
        <Esqueleto ocupado />
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas procuram. */}
        <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
          Carregando pendências…
        </p>
      </div>
    );

  if (estado.fase === 'erro')
    return (
      // biome-ignore lint/a11y/useSemanticElements: idem; o tom de erro fica no `data-tone`, o papel continua `status`, como na versão imperativa — aqui não havia recuperação própria.
      <p role="status" data-tone="error" className="m-0 text-(length:--texto-1) text-texto-suave">
        {mensagemFalha(estado.erro)}
      </p>
    );

  const { sinal, equipe, escritas } = estado;
  const abertas = sinal.pendencias.filter((item) => item.estado !== 'resolvida');
  const resolvidas = sinal.pendencias.filter((item) => item.estado === 'resolvida');
  const mostrarEscritas = escritas === null || escritas.length > 0;

  return (
    <div className="grid min-w-0 gap-5">
      <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
        Pendências e sinal do acompanhamento
      </h2>

      <Superficie>
        <div className="grid min-w-0 gap-6">
          <div data-estado={sinal.estado} className="grid min-w-0 gap-2">
            <MarcaEstado>{rotulosEstadoSinal[sinal.estado]}</MarcaEstado>
            <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
              {avisoSinalOperacional}
            </p>
            <p className="m-0 text-(length:--texto-1) text-texto-suave">
              {sinal.ultima_atualizacao_em && dataDeInstante(sinal.ultima_atualizacao_em)
                ? `Última atualização registrada no caso: ${dataDeInstante(sinal.ultima_atualizacao_em)}.`
                : 'Nenhuma atualização registrada neste caso até agora.'}
            </p>
          </div>

          {sinal.pendencias.length ? null : (
            <EstadoVazio
              titulo={
                sinal.estado === 'informacao_insuficiente'
                  ? 'Nenhuma pendência pode ser apurada enquanto a periodicidade do caso não for acordada.'
                  : 'Nenhuma pendência operacional neste caso.'
              }
            />
          )}

          {abertas.length ? (
            <div className="grid min-w-0 gap-3">
              <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
                Em aberto
              </h3>
              <ul className="pendencia-lista m-0 grid min-w-0 list-none gap-3 p-0">
                {abertas.map((pendencia) => (
                  <PendenciaItem
                    key={`${pendencia.chave_origem}:${pendencia.estado}`}
                    pendencia={pendencia}
                    equipe={equipe}
                    gravando={emCurso}
                    aoAplicar={aplicar}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {resolvidas.length ? (
            <div className="grid min-w-0 gap-3">
              <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
                Resolvidas
              </h3>
              <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
                Resolver não apaga a origem: o registro continua aqui e pode ser reaberto.
              </p>
              <ul className="pendencia-lista m-0 grid min-w-0 list-none gap-3 p-0">
                {resolvidas.map((pendencia) => (
                  <PendenciaItem
                    key={`${pendencia.chave_origem}:${pendencia.estado}`}
                    pendencia={pendencia}
                    equipe={equipe}
                    gravando={emCurso}
                    aoAplicar={aplicar}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {mostrarEscritas ? (
            <div className="grid min-w-0 gap-3">
              <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
                Escritas no plantão
              </h3>
              {escritas === null ? (
                <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
                  Não foi possível ler as pendências escritas no plantão agora. Isto não quer dizer
                  que não existam — quer dizer que a leitura falhou. As pendências calculadas acima
                  não dependem dessa consulta.
                </p>
              ) : (
                <>
                  <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
                    Origem: escrita por pessoa, não deduzida pelo sistema. Resolver é ato explícito,
                    na ficha do plantão.
                  </p>
                  <ul className="pendencia-lista m-0 grid min-w-0 list-none gap-3 p-0">
                    {escritas.map((item) => {
                      const marcasEscrita = [
                        `Situação: ${item.situacao === 'aberta' ? 'Aberta' : 'Resolvida'}`,
                        `Declarada por ${
                          equipe.find((opcao) => opcao.usuario_id === item.declarado_por_usuario_id)
                            ?.rotulo ?? 'profissional do plantão'
                        }`,
                        `Plantão ${item.turno_id}`,
                      ];
                      if (dataDeInstante(item.registrado_em))
                        marcasEscrita.push(`Registrada em ${dataDeInstante(item.registrado_em)}`);
                      if (item.resolvido_em && dataDeInstante(item.resolvido_em))
                        marcasEscrita.push(`Resolvida em ${dataDeInstante(item.resolvido_em)}`);
                      return (
                        <li
                          key={`${item.turno_id}:${item.origem}`}
                          data-origem={item.origem}
                          data-estado={item.situacao}
                          className="pendencia-item grid min-w-0 gap-2 rounded-cartao border border-borda p-4"
                        >
                          <p className="pendencia-tipo m-0 font-semibold">
                            Pendência escrita no plantão
                          </p>
                          <p className="pendencia-motivo m-0 max-w-[68ch]">{item.texto}</p>
                          <p className="pendencia-marcas m-0 text-(length:--texto-1) text-texto-suave">
                            {marcasEscrita.join(' · ')}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          ) : null}

          <div className="pendencia-acordo grid min-w-0 gap-3">
            <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
              Periodicidade acordada para este caso
            </h3>
            {!sinal.perfil_escrita_acordo ? (
              <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
                {sinal.acordo
                  ? `Atualizar o caso a cada ${sinal.acordo.dias_entre_atualizacoes ?? '—'} dias · Avisar ${sinal.acordo.dias_antecedencia_revisao} dias antes da revisão · Cobrar retorno de encaminhamento em ${sinal.acordo.dias_retorno_encaminhamento} dias${sinal.acordo.proxima_revisao_em ? ` · Próxima revisão em ${dataCivil(sinal.acordo.proxima_revisao_em)}` : ''}`
                  : 'Periodicidade ainda não acordada. A coordenação define esses prazos.'}
              </p>
            ) : (
              <Formulario
                key={sinal.acordo?.versao ?? 'sem-acordo'}
                aoEnviar={(formulario) => enviarAcordo(formulario, sinal)}
                noValidate
                className="grid min-w-0 max-w-[480px] gap-1"
              >
                <Campo
                  id="pendencia-dias-entre-atualizacoes"
                  name="dias_entre_atualizacoes"
                  rotulo="Atualizar o caso a cada (dias, em branco para não cobrar)"
                  tipo="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  defaultValue={sinal.acordo?.dias_entre_atualizacoes ?? ''}
                  erro={erroAcordo}
                />
                <Campo
                  id="pendencia-dias-antecedencia-revisao"
                  name="dias_antecedencia_revisao"
                  rotulo="Avisar antes da revisão (dias)"
                  tipo="number"
                  inputMode="numeric"
                  min={1}
                  max={180}
                  required
                  defaultValue={sinal.acordo?.dias_antecedencia_revisao ?? 14}
                />
                <Campo
                  id="pendencia-dias-retorno-encaminhamento"
                  name="dias_retorno_encaminhamento"
                  rotulo="Cobrar retorno de encaminhamento após (dias)"
                  tipo="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  required
                  defaultValue={sinal.acordo?.dias_retorno_encaminhamento ?? 21}
                />
                <CampoData
                  id="pendencia-proxima-revisao"
                  name="proxima_revisao_em"
                  rotulo="Próxima revisão"
                  defaultValue={sinal.acordo?.proxima_revisao_em ?? ''}
                />
                <div className="mt-3">
                  <Botao
                    peso="principal"
                    tipo="submit"
                    disabled={emCurso}
                    aria-busy={emCurso || undefined}
                  >
                    Salvar periodicidade
                    {emCurso ? <Indicador /> : null}
                  </Botao>
                </div>
              </Formulario>
            )}
          </div>

          {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as provas e os leitores de tela procuram. */}
          <p
            role="status"
            aria-live="polite"
            data-tone={avisoTom}
            className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave empty:hidden"
          >
            {aviso}
          </p>
        </div>
      </Superficie>
    </div>
  );
}
