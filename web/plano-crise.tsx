/* Plano de crise (FR-020), reconstruído em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarPlanoCrise(raiz, pacienteId, servico,
 * acessoPerdido, alteracaoPendente) => desmontar`.
 *
 * O que a migração entrega:
 *
 * 1. VIS-012. A versão imperativa tinha SEIS `if (!ativa) return`. Não sobrou nenhum:
 *    `ilha()` desmonta a raiz React e os efeitos são cancelados por construção.
 * 2. A moldura deixa de sumir durante a consulta (VIS-014).
 * 3. Superfície plana do `DESIGN.md`.
 *
 * O que NÃO mudou, de propósito (VIS-018) — e aqui isso pesa mais do que em qualquer
 * outra seção da ficha, porque o plano de crise é o que alguém lê no pior momento:
 *
 * - **Os dois avisos do requisito continuam LITERAIS no código**, e continuam sempre
 *   visíveis, sem depender do que alguém digitou. `web/textos-obrigatorios-nao-
 *   configuraveis.test.ts` lê este arquivo e reprova se eles sumirem ou virarem
 *   configuração.
 * - **Aprovar continua ação separada de salvar**, e vale para a versão aprovada: editar
 *   cria versão nova, que nasce sem aprovação.
 * - **Quem pode aprovar continua sendo decidido no servidor.** A tela NÃO esconde o botão
 *   para fingir permissão: ela explica a recusa quando ela vem.
 * - **A distinção entre "sem habilitação" e "sessão caiu" continua.** As duas chegam como
 *   `sem_permissao` (403). No caminho da aprovação, e só nele, a recusa é tratada ANTES do
 *   descarte de sessão — sem isso, quem apenas não tem a marca seria expulso da ficha como
 *   se tivesse sido revogado. As demais chamadas desta tela seguem descartando em 403.
 * - O recado de salvamento e de aprovação continua indo para a linha de SITUAÇÃO, que é o
 *   primeiro `role="status"` da tela, e não para o aviso do rodapé.
 * - Nenhuma frase mudou de palavra.
 *
 * **O DOM continua dono do valor dos campos**, como na versão imperativa, e os ouvintes de
 * `input` e `change` são NATIVOS: a delegação do React não enxerga atribuição crua de
 * `.value`, porque o rastreador dele já considera o valor conhecido.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  salvarPlanoCriseSchema,
  type PlanoCrise,
  type PlanoCriseConteudo,
} from '../packages/contracts/src/plano-crise.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { Campo } from './componentes/ui/campo.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { Superficie } from './componentes/ui/superficie.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import { Formulario } from './telas/formulario.js';

export type ServicoPlanoCrise = {
  consultar(pacienteId: string): Promise<PlanoCrise | null>;
  salvar(
    pacienteId: string,
    versaoEsperada: number,
    conteudo: PlanoCriseConteudo,
  ): Promise<PlanoCrise>;
  aprovar(pacienteId: string, registroId: string, versao: number): Promise<PlanoCrise>;
};

/** As duas frases abaixo são exigência do requisito, não texto de apoio: ficam sempre
 * visíveis e não dependem do que alguém digitou no plano. */
const AVISO_DIARIO =
  'O diário não garante resposta imediata. Em emergência, procure os contatos de urgência listados aqui.';
const AVISO_COORDENACAO =
  'A case manager coordena o cuidado e não emite conduta clínica por assumir a coordenação.';

const formatadorInstante = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
const formatadorData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'UTC',
});

function instanteLegivel(iso: string): string | null {
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? null : formatadorInstante.format(instante);
}

function dataLegivel(data: string): string {
  const instante = new Date(`${data}T00:00:00Z`);
  return Number.isNaN(instante.getTime()) ? data : formatadorData.format(instante);
}

type Responsavel = PlanoCriseConteudo['responsaveis'][number];
type Contato = PlanoCriseConteudo['contatos'][number];

/** Uma linha do rascunho: só o identificador e os valores INICIAIS. O valor corrente mora
 *  no DOM e é lido de lá na hora de gravar. */
type Linha<T> = { id: string; inicial: Partial<T> };

const ID_LIMITES = 'plano-crise-limites';
const ID_REVISAO = 'plano-crise-revisao';

/** Um controle da tela, pelo identificador. A busca parte do invólucro, e NÃO de
 *  `document`: as provas montam numa raiz destacada do documento, onde
 *  `document.getElementById` não enxerga nada. */
function controle(raiz: HTMLElement | null, id: string): HTMLElement | null {
  return raiz?.querySelector<HTMLElement>(`[id="${id}"]`) ?? null;
}

function leitura(raiz: HTMLElement | null, id: string): string {
  const no = controle(raiz, id);
  return no instanceof HTMLInputElement ||
    no instanceof HTMLSelectElement ||
    no instanceof HTMLTextAreaElement
    ? no.value
    : '';
}

/** O indicador de ação em curso que `iniciarAcao` acrescentava ao botão. A mensagem
 *  acessível continua no `role="status"` da tela; isto é só a pintura. */
function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

type Consulta = { fase: 'carregando' } | { fase: 'pronta' } | { fase: 'erro'; erro: unknown };

function TelaPlanoCrise({
  pacienteId,
  servico,
  acessoPerdido,
  alteracaoPendente,
}: {
  pacienteId: string;
  servico: ServicoPlanoCrise;
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
}) {
  const [consulta, definirConsulta] = useState<Consulta>({ fase: 'carregando' });
  const [tentativaConsulta, definirTentativaConsulta] = useState(0);
  const [descartada, definirDescartada] = useState(false);

  const [plano, definirPlano] = useState<PlanoCrise | null>(null);
  const [responsaveis, definirResponsaveis] = useState<Linha<Responsavel>[]>([]);
  const [contatos, definirContatos] = useState<Linha<Contato>[]>([]);
  const [prazo, definirPrazo] = useState('');
  const [aviso, definirAviso] = useState('');
  /** Recado que SUBSTITUI a linha de situação depois de salvar ou aprovar. É o primeiro
   *  `role="status"` da tela, e é onde a versão imperativa escrevia. */
  const [recado, definirRecado] = useState('');
  const [ocupado, definirOcupado] = useState(false);
  const [acaoEmCurso, definirAcaoEmCurso] = useState<'salvar' | 'confirmar' | 'aprovar' | null>(
    null,
  );
  const [retryVisivel, definirRetryVisivel] = useState(false);
  const [conflitoVersao, definirConflitoVersao] = useState(false);

  /* Decisões SÍNCRONAS no meio de fluxo assíncrono. */
  const versaoRef = useRef(0);
  const planoRef = useRef<PlanoCrise | null>(null);
  const pendenteRef = useRef<{ conteudo: PlanoCriseConteudo } | null>(null);
  const [temPendente, marcarPendente] = useState(false);
  const definirPendente = useCallback((valor: { conteudo: PlanoCriseConteudo } | null) => {
    pendenteRef.current = valor;
    marcarPendente(valor !== null);
  }, []);

  const envelope = useRef<HTMLDivElement>(null);
  const avisarPendente = useRef(alteracaoPendente);
  avisarPendente.current = alteracaoPendente;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;
  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;

  /** Revalidação de acesso: a raiz é esvaziada ANTES de avisar. */
  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    pendenteRef.current = null;
    flushSync(() => definirDescartada(true));
    avisarPerda.current(erro);
    return true;
  }, []);

  const calcularPrazo = useCallback((): string => {
    const valor = leitura(envelope.current, ID_REVISAO);
    if (!valor) return '';
    const hoje = new Date().toISOString().slice(0, 10);
    return valor < hoje
      ? `Revisão vencida em ${dataLegivel(valor)}.`
      : `Próxima revisão em ${dataLegivel(valor)}.`;
  }, []);

  /** Aplica um resultado do servidor: é a carga inicial e também o redesenho depois de
   *  salvar ou aprovar. */
  const aplicar = useCallback((resultado: PlanoCrise | null) => {
    versaoRef.current = resultado?.versao ?? 0;
    planoRef.current = resultado;
    definirPlano(resultado);
    definirResponsaveis(
      (resultado?.conteudo.responsaveis ?? []).map((valor) => ({
        id: valor.id ?? crypto.randomUUID(),
        inicial: valor,
      })),
    );
    definirContatos(
      (resultado?.conteudo.contatos ?? []).map((valor) => ({
        id: valor.id ?? crypto.randomUUID(),
        inicial: valor,
      })),
    );
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tentativaConsulta` não é lida no corpo de propósito — é o GATILHO de recarga que o botão "Tentar novamente" incrementa. Tirá-la daqui faria a nova tentativa não acontecer.
  useEffect(() => {
    let valida = true;
    definirConsulta({ fase: 'carregando' });
    servicoAtual.current
      .consultar(pacienteId)
      .then((resultado) => {
        if (!valida) return;
        flushSync(() => {
          aplicar(resultado);
          definirAviso('');
          definirRecado('');
          definirRetryVisivel(false);
          definirConflitoVersao(false);
          definirConsulta({ fase: 'pronta' });
        });
      })
      .catch((erro: unknown) => {
        if (!valida || descartarAcesso(erro)) return;
        flushSync(() => definirConsulta({ fase: 'erro', erro }));
      });
    return () => {
      valida = false;
    };
  }, [pacienteId, tentativaConsulta, aplicar, descartarAcesso]);

  /* O prazo é refeito depois de cada carga, a partir do campo já montado. */
  const prazoAgora = useRef(calcularPrazo);
  prazoAgora.current = calcularPrazo;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `consulta` não é lida no corpo — é o GATILHO: o prazo só pode ser calculado depois que o campo de data existe na árvore, isto é, depois da pintura que trouxe o resultado.
  useEffect(() => {
    definirPrazo(prazoAgora.current());
  }, [consulta]);

  /* Ouvintes NATIVOS no invólucro: alcançam qualquer controle da tela e não dependem da
     delegação do React, que não enxerga atribuição crua de `.value`. */
  useEffect(() => {
    const no = envelope.current;
    if (!no) return;
    const aoDigitar = () => avisarPendente.current(true);
    const aoTrocar = (evento: Event) => {
      avisarPendente.current(true);
      const alvo = evento.target;
      if (alvo instanceof HTMLInputElement && alvo.id === ID_REVISAO)
        flushSync(() => definirPrazo(prazoAgora.current()));
    };
    no.addEventListener('input', aoDigitar);
    no.addEventListener('change', aoTrocar);
    return () => {
      no.removeEventListener('input', aoDigitar);
      no.removeEventListener('change', aoTrocar);
    };
  }, []);

  function conteudoDaTela(): PlanoCriseConteudo {
    return {
      responsaveis: responsaveis.map((linha) => ({
        id: linha.id,
        nome: leitura(envelope.current, `plano-crise-nome-${linha.id}`),
        papel: leitura(envelope.current, `plano-crise-papel-${linha.id}`),
        contato: leitura(envelope.current, `plano-crise-contato-${linha.id}`),
      })),
      contatos: contatos.map((linha) => ({
        id: linha.id,
        descricao: leitura(envelope.current, `plano-crise-descricao-${linha.id}`),
        telefone: leitura(envelope.current, `plano-crise-telefone-${linha.id}`),
      })),
      limites_servico: leitura(envelope.current, ID_LIMITES),
      data_revisao: leitura(envelope.current, ID_REVISAO),
    } as PlanoCriseConteudo;
  }

  /* `flushSync` porque a versão imperativa acrescentava a linha NA HORA e punha o foco
     nela em seguida: sem isso o nó ainda não existiria para receber o foco. */
  function acrescentarResponsavel() {
    const nova: Linha<Responsavel> = { id: crypto.randomUUID(), inicial: {} };
    flushSync(() => {
      definirResponsaveis((atuais) => [...atuais, nova]);
      definirAviso('');
    });
    avisarPendente.current(true);
    controle(envelope.current, `plano-crise-nome-${nova.id}`)?.focus();
  }

  function acrescentarContato() {
    const nova: Linha<Contato> = { id: crypto.randomUUID(), inicial: {} };
    flushSync(() => {
      definirContatos((atuais) => [...atuais, nova]);
      definirAviso('');
    });
    avisarPendente.current(true);
    controle(envelope.current, `plano-crise-descricao-${nova.id}`)?.focus();
  }

  function removerResponsavel(id: string) {
    definirResponsaveis((atuais) => atuais.filter((linha) => linha.id !== id));
    avisarPendente.current(true);
    definirAviso('Responsável removido do rascunho. Salve para confirmar.');
  }

  function removerContato(id: string) {
    definirContatos((atuais) => atuais.filter((linha) => linha.id !== id));
    avisarPendente.current(true);
    definirAviso('Contato removido do rascunho. Salve para confirmar.');
  }

  const enviar = useCallback(async () => {
    const reservado = pendenteRef.current;
    if (!reservado) return;
    definirOcupado(true);
    definirAcaoEmCurso(retryVisivel ? 'confirmar' : 'salvar');
    definirAviso('Salvando plano de crise…');
    try {
      const salvo = await servicoAtual.current.salvar(
        pacienteId,
        versaoRef.current,
        reservado.conteudo,
      );
      definirPendente(null);
      avisarPendente.current(false);
      flushSync(() => {
        definirOcupado(false);
        definirAcaoEmCurso(null);
        aplicar(salvo);
        definirRetryVisivel(false);
        definirConflitoVersao(false);
        definirAviso('');
        definirRecado('Plano de crise salvo. Ainda falta aprovar.');
      });
    } catch (erro: unknown) {
      if (descartarAcesso(erro)) return;
      if (resultadoIncerto(erro)) {
        /* A reserva CONTINUA de pé: o envio pode ter sido gravado e a resposta se perdido.
           Confirmar reenvia o MESMO conteúdo reservado, sem passar pelo rascunho. */
        flushSync(() => {
          definirOcupado(false);
          definirAcaoEmCurso(null);
          definirRetryVisivel(true);
          definirAviso(
            'Não foi possível confirmar o salvamento. Tente confirmar antes de editar novamente.',
          );
        });
        return;
      }
      definirPendente(null);
      const conflito = erro instanceof FalhaApi && erro.codigo === 'conflito_versao';
      flushSync(() => {
        definirOcupado(false);
        definirAcaoEmCurso(null);
        definirConflitoVersao(conflito);
        definirRetryVisivel(false);
        definirAviso(
          conflito
            ? 'O plano foi alterado por outra pessoa. Copie seu rascunho antes de recarregar a página; suas alterações ainda não foram salvas.'
            : mensagemFalha(erro),
        );
      });
    }
  }, [pacienteId, retryVisivel, definirPendente, descartarAcesso, aplicar]);

  function enviarFormulario(_formulario: HTMLFormElement) {
    if (pendenteRef.current || conflitoVersao) return;
    const validada = salvarPlanoCriseSchema.safeParse({
      versao_esperada: versaoRef.current,
      conteudo: conteudoDaTela(),
    });
    if (!validada.success) {
      definirAviso(
        'Preencha nome, papel e contato de cada responsável, quando usar e telefone de cada contato, os limites do serviço e a data de revisão.',
      );
      const responsavelIncompleto = responsaveis.find(
        (linha) =>
          !leitura(envelope.current, `plano-crise-nome-${linha.id}`).trim() ||
          !leitura(envelope.current, `plano-crise-papel-${linha.id}`).trim() ||
          !leitura(envelope.current, `plano-crise-contato-${linha.id}`).trim(),
      );
      const contatoIncompleto = contatos.find(
        (linha) =>
          !leitura(envelope.current, `plano-crise-descricao-${linha.id}`).trim() ||
          !leitura(envelope.current, `plano-crise-telefone-${linha.id}`).trim(),
      );
      const alvo = responsavelIncompleto
        ? `plano-crise-nome-${responsavelIncompleto.id}`
        : contatoIncompleto
          ? `plano-crise-descricao-${contatoIncompleto.id}`
          : leitura(envelope.current, ID_LIMITES).trim()
            ? leitura(envelope.current, ID_REVISAO)
              ? 'plano-crise-salvar'
              : ID_REVISAO
            : ID_LIMITES;
      controle(envelope.current, alvo)?.focus();
      return;
    }
    definirPendente({ conteudo: validada.data.conteudo });
    avisarPendente.current(true);
    void enviar();
  }

  function aprovarVersao() {
    const atual = planoRef.current;
    if (!atual || pendenteRef.current) return;
    definirOcupado(true);
    definirAcaoEmCurso('aprovar');
    definirAviso('Registrando aprovação…');
    void servicoAtual.current
      .aprovar(pacienteId, atual.registro_id, atual.versao)
      .then((aprovado) => {
        avisarPendente.current(false);
        flushSync(() => {
          definirOcupado(false);
          definirAcaoEmCurso(null);
          aplicar(aprovado);
          definirAviso('');
          definirRecado('Plano de crise aprovado.');
        });
      })
      .catch((erro: unknown) => {
        /* Recusa por falta de habilitação chega como `sem_permissao` (403), o mesmo código
           de quem perdeu o acesso. Aqui ela é tratada ANTES do descarte de sessão: sem
           isso, quem apenas não tem a marca seria expulso da ficha como se tivesse sido
           revogado. As demais chamadas desta tela continuam descartando o acesso em 403. */
        const naoHabilitado = erro instanceof FalhaApi && erro.codigo === 'sem_permissao';
        if (!naoHabilitado && descartarAcesso(erro)) return;
        flushSync(() => {
          definirOcupado(false);
          definirAcaoEmCurso(null);
          definirAviso(
            naoHabilitado
              ? 'Aprovação exige ser o case manager atual deste caso, ter acesso ativo e habilitação registrada. Confira com a administração.'
              : erro instanceof FalhaApi && erro.codigo === 'conflito_versao'
                ? 'O plano mudou desde que esta tela carregou. Recarregue e confira o texto antes de aprovar.'
                : mensagemFalha(erro),
          );
        });
      });
  }

  if (descartada) return null;

  const aprovacao = plano?.aprovacao ?? null;
  const situacao =
    recado ||
    (!plano
      ? 'Nenhum plano de crise registrado ainda.'
      : !aprovacao
        ? `Versão ${plano.versao} ainda sem aprovação do case manager habilitado.`
        : (() => {
            const quando = instanteLegivel(aprovacao.aprovado_em);
            return quando
              ? `Versão ${plano.versao} aprovada em ${quando}.`
              : `Versão ${plano.versao} aprovada.`;
          })());
  const travado = temPendente || ocupado;

  /* Um invólucro SÓ, o mesmo nó nas três fases: os ouvintes nativos nascem nele na
     montagem, e trocar o nó ao sair do carregamento os deixaria pendurados num elemento
     que saiu da árvore. */
  const conteudo = () => {
    if (consulta.fase === 'carregando')
      return (
        <div className="grid min-w-0 gap-4">
          {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as telas e as provas já usam. */}
          <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
            Carregando plano de crise…
          </p>
          {/* Vazio de propósito: a regra global de `web/styles.css` desenha a forma do que
              vem para a região `[aria-busy] :empty`. */}
          <Esqueleto ocupado />
        </div>
      );

    if (consulta.fase === 'erro')
      return (
        <div className="grid min-w-0 justify-items-start gap-4">
          {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
          <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
            {mensagemFalha(consulta.erro)}
          </p>
          <Botao peso="secundario" aoAtivar={() => definirTentativaConsulta((valor) => valor + 1)}>
            Tentar novamente
          </Botao>
        </div>
      );

    return (
      <Superficie>
        <Formulario aoEnviar={enviarFormulario} noValidate className="grid min-w-0 gap-5">
          <header className="grid gap-2">
            <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
              Plano de crise
            </h2>
            <p className="m-0 max-w-[68ch] text-texto-suave">
              Combine antes quem procurar, em qual contato e até onde vai o serviço. Guarde também
              quando este plano precisa ser revisto.
            </p>
            {/* Os dois limites do requisito. Régua à esquerda, nunca caixa colorida, e
                nunca escondidos atrás de um "ver mais": são o que alguém lê no pior
                momento. */}
            {[AVISO_DIARIO, AVISO_COORDENACAO].map((texto) => (
              <p
                key={texto}
                className="m-0 max-w-[68ch] border-l-[3px] border-l-aviso-filete bg-aviso-superficie px-4 py-3 text-(length:--texto-2) text-aviso-texto"
              >
                {texto}
              </p>
            ))}
            {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas procuram, e é o PRIMEIRO da tela: é aqui que o recado de salvar e de aprovar aparece. */}
            <p
              role="status"
              aria-live="polite"
              className="m-0 text-(length:--texto-1) text-texto-suave empty:hidden"
            >
              {situacao}
            </p>
          </header>

          <section className="grid min-w-0 justify-items-start gap-4">
            <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
              Quem responde
            </h3>
            <div className="grid w-full min-w-0 gap-4">
              {responsaveis.map((linha) => (
                <fieldset
                  key={linha.id}
                  className="m-0 grid min-w-0 gap-4 rounded-cartao border border-borda p-4"
                >
                  <legend className="px-1">
                    <MarcaEstado tom="contorno">Responsável</MarcaEstado>
                  </legend>
                  <Campo
                    id={`plano-crise-nome-${linha.id}`}
                    rotulo="Nome"
                    maxLength={200}
                    defaultValue={linha.inicial.nome ?? ''}
                  />
                  <Campo
                    id={`plano-crise-papel-${linha.id}`}
                    rotulo="Papel"
                    maxLength={200}
                    placeholder="Mãe, psiquiatra, escola…"
                    defaultValue={linha.inicial.papel ?? ''}
                  />
                  <Campo
                    id={`plano-crise-contato-${linha.id}`}
                    rotulo="Como falar"
                    maxLength={200}
                    placeholder="Telefone, e-mail…"
                    defaultValue={linha.inicial.contato ?? ''}
                  />
                  <div>
                    <Botao peso="discreto" aoAtivar={() => removerResponsavel(linha.id)}>
                      Remover responsável
                    </Botao>
                  </div>
                </fieldset>
              ))}
            </div>
            <Botao peso="secundario" disabled={travado} aoAtivar={acrescentarResponsavel}>
              Adicionar responsável
            </Botao>
          </section>

          <section className="grid min-w-0 justify-items-start gap-4">
            <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
              Contatos de urgência
            </h3>
            <div className="grid w-full min-w-0 gap-4">
              {contatos.map((linha) => (
                <fieldset
                  key={linha.id}
                  className="m-0 grid min-w-0 gap-4 rounded-cartao border border-borda p-4"
                >
                  <legend className="px-1">
                    <MarcaEstado tom="contorno">Contato de urgência</MarcaEstado>
                  </legend>
                  <Campo
                    id={`plano-crise-descricao-${linha.id}`}
                    rotulo="Quando usar"
                    maxLength={200}
                    placeholder="Crise fora do horário, risco imediato…"
                    defaultValue={linha.inicial.descricao ?? ''}
                  />
                  <Campo
                    id={`plano-crise-telefone-${linha.id}`}
                    rotulo="Telefone"
                    tipo="tel"
                    maxLength={100}
                    defaultValue={linha.inicial.telefone ?? ''}
                  />
                  <div>
                    <Botao peso="discreto" aoAtivar={() => removerContato(linha.id)}>
                      Remover contato
                    </Botao>
                  </div>
                </fieldset>
              ))}
            </div>
            <Botao peso="secundario" disabled={travado} aoAtivar={acrescentarContato}>
              Adicionar contato de urgência
            </Botao>
          </section>

          <AreaTexto
            id={ID_LIMITES}
            rotulo="Limites do serviço"
            linhas={4}
            maxLength={4000}
            placeholder="O que este serviço faz e o que não faz em uma crise."
            defaultValue={plano?.conteudo.limites_servico ?? ''}
          />
          <CampoData
            id={ID_REVISAO}
            rotulo="Data de revisão"
            defaultValue={plano?.conteudo.data_revisao ?? ''}
          />
          <p className="m-0 text-(length:--texto-1) text-texto-suave empty:hidden">{prazo}</p>

          <div className="flex flex-wrap gap-3">
            <Botao
              id="plano-crise-salvar"
              peso="principal"
              tipo="submit"
              disabled={travado || conflitoVersao}
              aria-busy={acaoEmCurso === 'salvar' || undefined}
            >
              Salvar plano de crise
              {acaoEmCurso === 'salvar' ? <Indicador /> : null}
            </Botao>
            {retryVisivel ? (
              <Botao
                peso="secundario"
                disabled={ocupado}
                aria-busy={acaoEmCurso === 'confirmar' || undefined}
                aoAtivar={() => void enviar()}
              >
                Tentar confirmar salvamento
                {acaoEmCurso === 'confirmar' ? <Indicador /> : null}
              </Botao>
            ) : null}
            {/* O botão é MONTADO e apenas escondido quando não cabe aprovar. Esconder para
                fingir permissão seria o contrário do que o requisito pede: quem decide é o
                servidor, e a tela explica a recusa quando ela vem. */}
            <Botao
              peso="secundario"
              hidden={!plano || aprovacao !== null}
              disabled={travado}
              aria-busy={acaoEmCurso === 'aprovar' || undefined}
              aoAtivar={aprovarVersao}
            >
              Aprovar esta versão
              {acaoEmCurso === 'aprovar' ? <Indicador /> : null}
            </Botao>
          </div>

          <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
            Só o case manager atual deste caso, com habilitação registrada pela administração e
            acesso ativo, aprova o plano de crise.
          </p>

          {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já procuram. */}
          <p
            role="status"
            aria-live="polite"
            data-tone={conflitoVersao ? 'error' : undefined}
            className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave empty:hidden"
          >
            {aviso}
          </p>

          {plano && aprovacao ? (
            <p className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave">
              Salvar qualquer alteração cria uma nova versão, que precisará de aprovação de novo.
            </p>
          ) : null}
        </Formulario>
      </Superficie>
    );
  };

  return (
    <div ref={envelope} className="min-w-0">
      {conteudo()}
    </div>
  );
}

/** FR-020: plano de crise com responsáveis, contatos, limites do serviço e data de revisão.
 *
 * Aprovar é ação separada de salvar, e vale para a versão aprovada: editar o plano cria
 * versão nova, que nasce sem aprovação. Quem pode aprovar é decidido no servidor pela marca
 * de habilitação da concessão — a tela não esconde o botão para fingir permissão, ela explica
 * a recusa quando ela vem. */
export function montarPlanoCrise(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoPlanoCrise,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  return ilha(
    raiz,
    <TelaPlanoCrise
      pacienteId={pacienteId}
      servico={servico}
      acessoPerdido={acessoPerdido}
      alteracaoPendente={alteracaoPendente}
    />,
  );
}
