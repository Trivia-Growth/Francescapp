/* Aba de orientações (FR-019), reconstruído em React sobre a ilha
 * (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarOrientacoes(raiz, pacienteId, servico,
 * acessoPerdido, ehFamilia?) => desmontar`.
 *
 * VIS-012: o `if (!ativa) return` da versão imperativa desapareceu — `ilha()` desmonta a
 * raiz React e os efeitos são cancelados por construção.
 *
 * O que NÃO mudou, de propósito:
 *
 * - Cada orientação é imutável e versionada: superá-la exige a versão vigente, lida do
 *   servidor na consulta inicial (`versoes`), nunca da posição na lista.
 * - A edição em si continua delegada a `web/orientacoes-local.tsx` (`OrientacoesLocais`),
 *   que mantém o rascunho local até `aoSalvar` confirmar — a tela aqui só faz a consulta
 *   inicial e traduz o resultado em duas gravações (superar a anterior, criar a nova).
 *   Composta como componente, na MESMA raiz React — não como uma segunda `ilha()` aberta
 *   de dentro de um efeito: duas montagens síncronas (`flushSync`) aninhadas faz o React
 *   recusar a segunda por estarmos "dentro de um método de ciclo de vida", medido em
 *   25/11/2026.
 * - `exigeNovoAcesso` continua retirando a tela inteira ANTES de avisar `acessoPerdido`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Orientacao } from '../packages/contracts/src/orientacao.ts';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import './estilos/tema.css';
import { OrientacoesLocais, type OrientacaoLocal } from './orientacoes-local.js';
import type { EntradaOrientacao } from './servico-orientacoes-http.js';

type Servico = {
  consultar(pacienteId: string, apenasVigentes?: boolean): Promise<Orientacao[]>;
  salvar(pacienteId: string, entrada: EntradaOrientacao): Promise<Orientacao>;
};

function camposDe(item: OrientacaoLocal) {
  return {
    texto: item.texto,
    autor: item.autor,
    data: item.data,
    destinatarios: item.destinatarios,
    validade: item.validade,
    visibilidade: item.visibilidade,
  };
}

type Fase =
  | { fase: 'carregando' }
  | { fase: 'pronta'; orientacoes: OrientacaoLocal[] }
  | { fase: 'erro'; erro: unknown };

export function TelaOrientacoes({
  pacienteId,
  servico,
  acessoPerdido,
  ehFamilia,
}: {
  pacienteId: string;
  servico: Servico;
  acessoPerdido: (erro: unknown) => void;
  ehFamilia: boolean;
}) {
  const [descartada, definirDescartada] = useState(false);
  const [fase, definirFase] = useState<Fase>({ fase: 'carregando' });

  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;
  // Cada orientação é imutável e versionada: superá-la exige a versão vigente.
  const versoesRef = useRef(new Map<string, number>());

  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    flushSync(() => definirDescartada(true));
    avisarPerda.current(erro);
    return true;
  }, []);

  const comoLocal = useCallback((registro: Orientacao): OrientacaoLocal => {
    versoesRef.current.set(registro.orientacao_id, registro.versao);
    return {
      id: registro.orientacao_id,
      texto: registro.texto,
      autor: registro.autor,
      data: registro.data,
      destinatarios: registro.destinatarios,
      validade: registro.validade,
      anterior: registro.situacao === 'superada',
      visibilidade: registro.visibilidade,
    };
  }, []);

  useEffect(() => {
    let valida = true;
    servicoAtual.current
      .consultar(pacienteId)
      .then((registros) => {
        if (!valida) return;
        const orientacoes = registros.map(comoLocal);
        // Sem `flushSync`: esta troca de fase dispara o efeito que monta a prévia local
        // (outra raiz React, com o próprio `flushSync` interno) — encadear os dois
        // síncronos faria o React recusar o segundo por estarmos "dentro de um método de
        // ciclo de vida". Nenhuma prova depende de ler o DOM na mesma microtarefa aqui.
        definirFase({ fase: 'pronta', orientacoes });
      })
      .catch((erro: unknown) => {
        if (!valida || descartarAcesso(erro)) return;
        definirFase({ fase: 'erro', erro });
      });
    return () => {
      valida = false;
    };
  }, [pacienteId, comoLocal, descartarAcesso]);

  /** A tela entrega a lista inteira; aqui ela vira as duas gravações que o banco espera:
   *  superar a anterior (nova versão da mesma orientação) e criar a nova. `orientacoesCarregadas`
   *  é a lista da consulta inicial — a mesma referência que vira `dados.orientacoes` em
   *  `OrientacoesLocais`, por isso reflete substituições seguintes dentro da mesma prévia. */
  const aoSalvar = useCallback(
    async (orientacoesCarregadas: OrientacaoLocal[], proximas: OrientacaoLocal[]) => {
      const anteriores = new Map(orientacoesCarregadas.map((item) => [item.id, item]));
      const superadas = proximas.filter(
        (item) => item.anterior && anteriores.get(item.id)?.anterior === false,
      );
      const novas = proximas.filter((item) => !anteriores.has(item.id));
      try {
        for (const item of superadas) {
          const versao = versoesRef.current.get(item.id);
          if (versao === undefined) throw new Error('Versão vigente desconhecida.');
          comoLocal(
            await servicoAtual.current.salvar(pacienteId, {
              orientacao_id: item.id,
              versao_esperada: versao,
              situacao: 'superada',
              ...camposDe(item),
            }),
          );
        }
        for (const item of novas) {
          const gravada = await servicoAtual.current.salvar(pacienteId, {
            versao_esperada: 0,
            situacao: 'vigente',
            ...camposDe(item),
          });
          // O identificador é do servidor; o provisório da tela não serve de chave.
          item.id = gravada.orientacao_id;
          comoLocal(gravada);
        }
      } catch (erro) {
        if (descartarAcesso(erro)) throw erro;
        throw new Error(mensagemFalha(erro));
      }
    },
    [pacienteId, comoLocal, descartarAcesso],
  );

  if (descartada) return null;

  if (fase.fase === 'carregando')
    return (
      <div className="grid min-w-0 gap-4">
        <Esqueleto ocupado />
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as telas e as provas já usam. */}
        <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
          Carregando orientações…
        </p>
      </div>
    );

  if (fase.fase === 'erro')
    return (
      // biome-ignore lint/a11y/useSemanticElements: idem; aqui não havia recuperação própria.
      <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
        {mensagemFalha(fase.erro)}
      </p>
    );

  const orientacoesCarregadas = fase.orientacoes;

  return (
    <section className="grid min-w-0 gap-4">
      <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
        Orientações
      </h2>
      <OrientacoesLocais
        aprimorarControles
        dados={{
          orientacoes: orientacoesCarregadas,
          aoSalvar: (proximas) => aoSalvar(orientacoesCarregadas, proximas),
        }}
        ehFamilia={ehFamilia}
      />
    </section>
  );
}

/** Interface da aba de orientações (FR-019), ligada ao serviço autorizado no servidor. */
