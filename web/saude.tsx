/* Histórico de saúde (FR-004), reconstruído em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarSaude(raiz, pacienteId, servico, acessoPerdido,
 * alteracaoPendente) => desmontar`.
 *
 * O que a migração entrega:
 *
 * 1. VIS-012. A versão imperativa tinha QUATRO `if (!ativa) return` protegendo escritas em
 *    DOM já desmontado. Não sobrou nenhum: `ilha()` desmonta a raiz React e os efeitos são
 *    cancelados por construção.
 * 2. A moldura da tela deixa de sumir durante a consulta (VIS-014): `Esqueleto` indica a
 *    região que carrega em vez de trocar a área inteira por uma frase.
 * 3. Superfície plana do `DESIGN.md`: um assunto, uma superfície, filete e espaço.
 *
 * O que NÃO mudou, de propósito (VIS-018):
 *
 * - **Nenhuma frase mudou de palavra**, incluindo as três que carregam decisão de
 *   gravação: a de conflito de versão, a de resultado incerto e a de registro removido.
 * - O protocolo é idêntico: validação por `salvarSaudeSchema`, chave de idempotência por
 *   tentativa REAPROVEITADA no "Tentar confirmar salvamento", e trava do envio enquanto
 *   houver conflito de versão.
 * - `exigeNovoAcesso` continua esvaziando a raiz ANTES de chamar `acessoPerdido`.
 * - `alteracaoPendente` continua sendo avisada nos mesmos pontos: digitação, troca de
 *   seleção, acréscimo, remoção e envio.
 *
 * **O DOM continua dono do valor dos campos.** Os controles são NÃO controlados, como na
 * versão imperativa, e são lidos pelo `name` com `valorDe` de `web/telas/formulario.js` na
 * hora de gravar. Campo controlado quebraria as provas de tela, que atribuem `.value`
 * direto: o próximo render sobrescreveria o valor e o módulo nunca o veria. O React aqui é
 * dono da ESTRUTURA. A exceção são as três seleções, cujo valor é espelhado em estado
 * porque a legenda e o resumo dependem dele — e o espelho é alimentado lendo o DOM no
 * próprio evento, nunca o contrário.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  salvarSaudeSchema,
  type RegistroSaude,
  type Saude,
} from '../packages/contracts/src/saude.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { Campo } from './componentes/ui/campo.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { Superficie } from './componentes/ui/superficie.js';
import './estilos/tema.css';
import { Formulario, valorDe } from './telas/formulario.js';

export type ServicoSaude = {
  consultar(pacienteId: string): Promise<Saude | null>;
  salvar(
    pacienteId: string,
    versaoEsperada: number,
    registros: RegistroSaude[],
    chaveIdempotencia: string,
  ): Promise<Saude>;
};

const TIPOS = [
  ['historico', 'Histórico'],
  ['avaliacao', 'Avaliação'],
  ['diagnostico', 'Diagnóstico'],
] as const;
const NATUREZAS = [
  ['profissional', 'Profissional'],
  ['relato_leigo', 'Relato de quem convive'],
  ['documento', 'Documento'],
] as const;
const SITUACOES = [
  ['confirmado', 'Confirmado'],
  ['hipotese', 'Hipótese'],
] as const;
const rotuloDe = (lista: readonly (readonly [string, string])[], valor: string) =>
  lista.find(([chave]) => chave === valor)?.[1] ?? valor;

/** Uma linha do rascunho. `inicial` só alimenta os `defaultValue`; o valor corrente mora
 *  no DOM. As três seleções são espelhadas porque legenda e resumo dependem delas. */
type Linha = {
  id: string;
  inicial: Partial<RegistroSaude>;
  tipo: string;
  natureza: string;
  situacao: string;
};

function linhaDe(registro?: RegistroSaude): Linha {
  return {
    id: registro?.id ?? crypto.randomUUID(),
    inicial: registro ?? {},
    tipo: registro?.tipo ?? TIPOS[0][0],
    natureza: registro?.natureza ?? NATUREZAS[0][0],
    situacao: registro?.situacao ?? SITUACOES[0][0],
  };
}

/** Os `name` de uma linha, num lugar só: são o contrato entre o que é desenhado e o que é
 *  lido do formulário na hora de gravar. */
const nomes = (id: string) => ({
  tipo: `tipo-${id}`,
  descricao: `descricao-${id}`,
  origem: `origem-${id}`,
  natureza: `natureza-${id}`,
  data: `data-${id}`,
  situacao: `situacao-${id}`,
});

/** O indicador de ação em curso que `iniciarAcao` acrescentava ao botão. A mensagem
 *  acessível continua no `role="status"` da tela; isto é só a pintura. */
function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

type Consulta = { fase: 'carregando' } | { fase: 'pronta' } | { fase: 'erro'; erro: unknown };

export function TelaSaude({
  pacienteId,
  servico,
  acessoPerdido,
  alteracaoPendente,
}: {
  pacienteId: string;
  servico: ServicoSaude;
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
}) {
  /* A tela nasce consultando: declarar o estado inicial como "já em curso" é o que mantém
     a primeira pintura honesta, sem um instante de tela em branco (VIS-014). */
  const [consulta, definirConsulta] = useState<Consulta>({ fase: 'carregando' });
  const [tentativaConsulta, definirTentativaConsulta] = useState(0);
  const [descartada, definirDescartada] = useState(false);

  const [versao, definirVersao] = useState(0);
  const [linhas, definirLinhas] = useState<Linha[]>([]);
  const [aviso, definirAviso] = useState('');
  const [enviando, definirEnviando] = useState(false);
  const [retryVisivel, definirRetryVisivel] = useState(false);
  const [conflitoVersao, definirConflitoVersao] = useState(false);

  /* Decisão SÍNCRONA no meio de fluxo assíncrono — "há gravação reservada?" é conferida
     dentro de tratadores e de continuações de promessa, onde ler o `useState` devolveria o
     valor do render anterior. Mora em referência e é espelhada para a renderização. */
  const pendenteRef = useRef<{ registros: RegistroSaude[]; chaveIdempotencia: string } | null>(
    null,
  );
  const [temPendente, marcarPendente] = useState(false);
  const definirPendente = useCallback(
    (valor: { registros: RegistroSaude[]; chaveIdempotencia: string } | null) => {
      pendenteRef.current = valor;
      marcarPendente(valor !== null);
    },
    [],
  );

  /* A versão vigente também é lida de dentro de continuação de promessa (`enviar`), pelo
     mesmo motivo. */
  const versaoRef = useRef(0);
  const aplicarVersao = useCallback((valor: number) => {
    versaoRef.current = valor;
    definirVersao(valor);
  }, []);

  const avisarPendente = useRef(alteracaoPendente);
  avisarPendente.current = alteracaoPendente;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;
  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;

  /** Revalidação de acesso: a raiz é esvaziada ANTES de avisar, para o fluxo de nova
   *  entrada nunca encontrar conteúdo clínico na tela por trás dele. */
  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    pendenteRef.current = null;
    flushSync(() => definirDescartada(true));
    avisarPerda.current(erro);
    return true;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tentativaConsulta` não é lida no corpo de propósito — é o GATILHO de recarga que o botão "Tentar novamente" incrementa. Tirá-la daqui faria a nova tentativa não acontecer.
  useEffect(() => {
    let valida = true;
    definirConsulta({ fase: 'carregando' });
    servicoAtual.current
      .consultar(pacienteId)
      .then((dados) => {
        if (!valida) return;
        flushSync(() => {
          aplicarVersao(dados?.versao ?? 0);
          definirLinhas((dados?.registros ?? []).map((registro) => linhaDe(registro)));
          definirAviso('');
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
  }, [pacienteId, tentativaConsulta, descartarAcesso, aplicarVersao]);

  function adicionar() {
    const nova = linhaDe();
    definirLinhas((atuais) => [...atuais, nova]);
    avisarPendente.current(true);
    definirAviso('');
    // Depois da pintura: o nó ainda não existe no instante do clique.
    queueMicrotask(() => document.getElementById(`saude-descricao-${nova.id}`)?.focus());
  }

  function remover(id: string) {
    definirLinhas((atuais) => atuais.filter((linha) => linha.id !== id));
    avisarPendente.current(true);
    definirAviso('Registro removido do rascunho. Salve para confirmar.');
  }

  /** Espelha no estado a seleção que o DOM acabou de receber. */
  function aoTrocarSelecao(id: string, campo: 'tipo' | 'natureza' | 'situacao', valor: string) {
    definirLinhas((atuais) =>
      atuais.map((linha) => (linha.id === id ? { ...linha, [campo]: valor } : linha)),
    );
    avisarPendente.current(true);
  }

  const enviar = useCallback(async () => {
    const reservado = pendenteRef.current;
    if (!reservado) return;
    definirEnviando(true);
    definirAviso('Salvando histórico de saúde…');
    try {
      const salvo = await servicoAtual.current.salvar(
        pacienteId,
        versaoRef.current,
        reservado.registros,
        reservado.chaveIdempotencia,
      );
      definirPendente(null);
      avisarPendente.current(false);
      flushSync(() => {
        definirEnviando(false);
        aplicarVersao(salvo.versao);
        definirLinhas(salvo.registros.map((registro) => linhaDe(registro)));
        definirRetryVisivel(false);
        definirConflitoVersao(false);
        definirAviso('Histórico de saúde salvo.');
      });
    } catch (erro: unknown) {
      if (descartarAcesso(erro)) return;
      if (resultadoIncerto(erro)) {
        /* A reserva CONTINUA de pé: o envio pode ter sido gravado e a resposta se perdido.
           Salvar e Adicionar seguem travados e os campos inertes, para a confirmação usar
           a MESMA chave de idempotência e não duplicar versão. */
        flushSync(() => {
          definirEnviando(false);
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
        definirEnviando(false);
        definirConflitoVersao(conflito);
        definirRetryVisivel(false);
        definirAviso(
          conflito
            ? 'O histórico foi alterado por outra pessoa. Copie seu rascunho antes de recarregar a página; suas alterações ainda não foram salvas.'
            : mensagemFalha(erro),
        );
      });
    }
  }, [pacienteId, definirPendente, descartarAcesso, aplicarVersao]);

  /** Lê do DOM o registro corrente de uma linha — o DOM é quem tem o valor. */
  function registroDe(formulario: HTMLFormElement, linha: Linha): RegistroSaude {
    const nome = nomes(linha.id);
    return {
      id: linha.id,
      tipo: valorDe(formulario, nome.tipo),
      descricao: valorDe(formulario, nome.descricao),
      origem: valorDe(formulario, nome.origem),
      natureza: valorDe(formulario, nome.natureza),
      data: valorDe(formulario, nome.data),
      situacao: valorDe(formulario, nome.situacao),
    } as RegistroSaude;
  }

  function enviarFormulario(formulario: HTMLFormElement) {
    if (pendenteRef.current || conflitoVersao) return;
    const validada = salvarSaudeSchema.safeParse({
      versao_esperada: versaoRef.current,
      registros: linhas.map((linha) => registroDe(formulario, linha)),
    });
    if (!validada.success) {
      definirAviso(
        'Preencha descrição, origem e data de cada registro; confira as datas informadas.',
      );
      const faltando = linhas.find((linha) => {
        const nome = nomes(linha.id);
        return (
          !valorDe(formulario, nome.descricao).trim() ||
          !valorDe(formulario, nome.origem).trim() ||
          !valorDe(formulario, nome.data)
        );
      });
      const alvo = faltando
        ? document.getElementById(`saude-descricao-${faltando.id}`)
        : document.getElementById('saude-salvar');
      alvo?.focus();
      return;
    }
    definirPendente({
      registros: validada.data.registros,
      chaveIdempotencia: crypto.randomUUID(),
    });
    avisarPendente.current(true);
    void enviar();
  }

  if (descartada) return null;

  if (consulta.fase === 'carregando')
    return (
      <div className="grid min-w-0 gap-4">
        {/* Vazio de propósito: a regra global de `web/styles.css` desenha a forma do que
            vem para a região `[aria-busy] :empty`, com o atraso que impede o piscar. */}
        <Esqueleto ocupado />
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as telas e as provas já usam. */}
        <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
          Carregando histórico de saúde…
        </p>
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

  const resumo = linhas.length
    ? `${linhas.length} registro(s); ${linhas.filter((l) => l.situacao === 'hipotese').length} em hipótese; ${linhas.filter((l) => l.natureza === 'relato_leigo').length} vindo(s) de relato de quem convive.`
    : 'Nenhum registro de saúde. Adicione o primeiro abaixo.';
  const travado = temPendente || enviando;

  return (
    <Superficie>
      <Formulario
        aoEnviar={enviarFormulario}
        noValidate
        className="grid min-w-0 gap-5"
        onInput={() => avisarPendente.current(true)}
      >
        <header className="grid gap-2">
          <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
            Histórico de saúde
          </h2>
          <p className="m-0 max-w-[68ch] text-texto-suave">
            Registre histórico, avaliações e diagnósticos. A origem fica visível em cada item, e
            hipótese não vira diagnóstico.
          </p>
          <p className="m-0 text-(length:--texto-1) text-texto-suave">{resumo}</p>
        </header>

        {/* `inert` enquanto há gravação reservada: o rascunho não pode mudar entre a
            reserva e a confirmação, senão a chave de idempotência deixaria de descrever o
            que foi enviado. */}
        <div className="grid min-w-0 gap-4" inert={temPendente}>
          {linhas.map((linha) => {
            const nome = nomes(linha.id);
            return (
              <fieldset
                key={linha.id}
                data-natureza={linha.natureza}
                data-situacao={linha.situacao}
                className="m-0 grid min-w-0 gap-4 rounded-cartao border border-borda p-4"
              >
                {/* A legenda mantém origem e situação SEMPRE visíveis: relato de quem
                    convive continua identificado como relato, e hipótese nunca é
                    apresentada como diagnóstico fechado. */}
                <legend className="px-1">
                  <MarcaEstado tom="contorno">
                    {`${rotuloDe(TIPOS, linha.tipo)} — ${rotuloDe(NATUREZAS, linha.natureza)} — ${rotuloDe(SITUACOES, linha.situacao)}`}
                  </MarcaEstado>
                </legend>
                <SelecaoAprimorada
                  id={`saude-tipo-${linha.id}`}
                  name={nome.tipo}
                  rotulo="Tipo"
                  defaultValue={linha.inicial.tipo ?? TIPOS[0][0]}
                  onChange={(evento) =>
                    aoTrocarSelecao(linha.id, 'tipo', evento.currentTarget.value)
                  }
                >
                  {TIPOS.map(([chave, texto]) => (
                    <option key={chave} value={chave}>
                      {texto}
                    </option>
                  ))}
                </SelecaoAprimorada>
                <AreaTexto
                  id={`saude-descricao-${linha.id}`}
                  name={nome.descricao}
                  rotulo="Descrição"
                  linhas={3}
                  defaultValue={linha.inicial.descricao ?? ''}
                />
                <Campo
                  id={`saude-origem-${linha.id}`}
                  name={nome.origem}
                  rotulo="Origem"
                  dica="Quem informou (profissional, familiar, documento)"
                  defaultValue={linha.inicial.origem ?? ''}
                />
                <SelecaoAprimorada
                  id={`saude-natureza-${linha.id}`}
                  name={nome.natureza}
                  rotulo="Natureza da origem"
                  defaultValue={linha.inicial.natureza ?? NATUREZAS[0][0]}
                  onChange={(evento) =>
                    aoTrocarSelecao(linha.id, 'natureza', evento.currentTarget.value)
                  }
                >
                  {NATUREZAS.map(([chave, texto]) => (
                    <option key={chave} value={chave}>
                      {texto}
                    </option>
                  ))}
                </SelecaoAprimorada>
                <CampoData
                  id={`saude-data-${linha.id}`}
                  name={nome.data}
                  rotulo="Data"
                  defaultValue={linha.inicial.data ?? ''}
                />
                <SelecaoAprimorada
                  id={`saude-situacao-${linha.id}`}
                  name={nome.situacao}
                  rotulo="Situação"
                  defaultValue={linha.inicial.situacao ?? SITUACOES[0][0]}
                  onChange={(evento) =>
                    aoTrocarSelecao(linha.id, 'situacao', evento.currentTarget.value)
                  }
                >
                  {SITUACOES.map(([chave, texto]) => (
                    <option key={chave} value={chave}>
                      {texto}
                    </option>
                  ))}
                </SelecaoAprimorada>
                <div>
                  <Botao peso="discreto" aoAtivar={() => remover(linha.id)}>
                    Remover registro
                  </Botao>
                </div>
              </fieldset>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3">
          <Botao peso="secundario" disabled={travado} aoAtivar={adicionar}>
            Adicionar registro
          </Botao>
          <Botao
            id="saude-salvar"
            peso="principal"
            tipo="submit"
            disabled={travado || conflitoVersao}
            aria-busy={(enviando && !retryVisivel) || undefined}
          >
            Salvar histórico de saúde
            {enviando && !retryVisivel ? <Indicador /> : null}
          </Botao>
          {retryVisivel ? (
            <Botao
              peso="secundario"
              disabled={enviando}
              aria-busy={enviando || undefined}
              aoAtivar={() => void enviar()}
            >
              Tentar confirmar salvamento
              {enviando ? <Indicador /> : null}
            </Botao>
          ) : null}
        </div>

        {/* Um único recado por vez, no mesmo nó de antes: é onde as provas e os leitores de
            tela já procuram, e dividir a mensagem em dois lugares faria o leitor anunciar
            duas vezes. */}
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas procuram dentro do formulário. */}
        <p
          role="status"
          aria-live="polite"
          data-tone={conflitoVersao ? 'error' : undefined}
          className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave empty:hidden"
        >
          {aviso}
        </p>
      </Formulario>
    </Superficie>
  );
}

/** FR-004: histórico de saúde, avaliações e diagnósticos ou hipóteses.
 * A origem e a natureza ficam sempre visíveis: um relato de quem convive continua
 * identificado como relato, e hipótese nunca é apresentada como diagnóstico fechado.
 * A tela organiza o registro; validação clínica é do profissional habilitado. */
