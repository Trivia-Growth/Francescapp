/* Aba de encaminhamentos (FR-018), reconstruído em React sobre a ilha
 * (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarEncaminhamentos(raiz, pacienteId, servico,
 * acessoPerdido) => desmontar`.
 *
 * VIS-012: o `if (!ativa) return` da versão imperativa desapareceu — `ilha()` desmonta a
 * raiz React e os efeitos são cancelados por construção.
 *
 * O que NÃO mudou, de propósito:
 *
 * - Cada encaminhamento é imutável e versionado: revisar exige a versão vigente, lida do
 *   servidor na consulta inicial (`versoes`), nunca da posição na lista.
 * - A edição em si continua delegada a `web/encaminhamentos-local.tsx`
 *   (`EncaminhamentosLocais`), que mantém o rascunho local até `aoRegistrar`/`aoAtualizar`
 *   confirmarem — a tela aqui só faz a consulta inicial e traduz etapa do banco ↔ rótulo
 *   da equipe. Composta como componente, na MESMA raiz React — não como uma segunda
 *   `ilha()` aberta de dentro de um efeito (medido em 25/11/2026 em `orientacoes.tsx`).
 * - `exigeNovoAcesso` continua retirando a tela inteira ANTES de avisar `acessoPerdido`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Encaminhamento } from '../packages/contracts/src/encaminhamento.ts';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import {
  EncaminhamentosLocais,
  type DadosEncaminhamento,
  type EncaminhamentoLocal,
  type EstadoEncaminhamento,
} from './encaminhamentos-local.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';

type Servico = {
  consultar(pacienteId: string, apenasSemRetorno?: boolean): Promise<Encaminhamento[]>;
  salvar(
    pacienteId: string,
    entrada: {
      encaminhamento_id?: string;
      versao_esperada: number;
      etapa: Encaminhamento['etapa'];
      destino: string;
      motivo: string;
      responsavel: string;
      observacao?: string;
    },
  ): Promise<Encaminhamento>;
};

/** O banco guarda a etapa normalizada; a tela mostra o rótulo que a equipe usa. */
const rotulos: Record<Encaminhamento['etapa'], EstadoEncaminhamento> = {
  sugerido: 'sugerido',
  agendado: 'agendado',
  realizado: 'realizado',
  retorno_pendente: 'retorno pendente',
  concluido: 'concluído',
};
const etapas = Object.entries(rotulos) as [Encaminhamento['etapa'], EstadoEncaminhamento][];
const etapaDe = (rotulo: EstadoEncaminhamento): Encaminhamento['etapa'] => {
  const par = etapas.find(([, valor]) => valor === rotulo);
  if (!par) throw new Error('Etapa desconhecida.');
  return par[0];
};

type Fase =
  | { fase: 'carregando' }
  | { fase: 'pronta'; encaminhamentos: EncaminhamentoLocal[] }
  | { fase: 'erro'; erro: unknown };

function TelaEncaminhamentos({
  pacienteId,
  servico,
  acessoPerdido,
}: {
  pacienteId: string;
  servico: Servico;
  acessoPerdido: (erro: unknown) => void;
}) {
  const [descartada, definirDescartada] = useState(false);
  const [fase, definirFase] = useState<Fase>({ fase: 'carregando' });

  const servicoAtual = useRef(servico);
  servicoAtual.current = servico;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;
  // Cada encaminhamento é imutável e versionado: revisar exige a versão vigente.
  const versoesRef = useRef(new Map<string, number>());

  const descartarAcesso = useCallback((erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    flushSync(() => definirDescartada(true));
    avisarPerda.current(erro);
    return true;
  }, []);

  const comoLocal = useCallback((registro: Encaminhamento): EncaminhamentoLocal => {
    versoesRef.current.set(registro.encaminhamento_id, registro.versao);
    return {
      id: registro.encaminhamento_id,
      destino: registro.destino,
      motivo: registro.motivo,
      responsavel: registro.responsavel,
      estado: rotulos[registro.etapa],
    };
  }, []);

  const gravar = useCallback(
    async (id: string | undefined, valores: DadosEncaminhamento) => {
      const versao = id ? versoesRef.current.get(id) : 0;
      if (versao === undefined) throw new Error('Versão vigente desconhecida.');
      return servicoAtual.current.salvar(pacienteId, {
        ...(id ? { encaminhamento_id: id } : {}),
        versao_esperada: versao,
        etapa: etapaDe(valores.estado),
        destino: valores.destino,
        motivo: valores.motivo,
        responsavel: valores.responsavel,
      });
    },
    [pacienteId],
  );

  useEffect(() => {
    let valida = true;
    servicoAtual.current
      .consultar(pacienteId)
      .then((registros) => {
        if (!valida) return;
        const encaminhamentos = registros.map(comoLocal);
        definirFase({ fase: 'pronta', encaminhamentos });
      })
      .catch((erro: unknown) => {
        if (!valida || descartarAcesso(erro)) return;
        definirFase({ fase: 'erro', erro });
      });
    return () => {
      valida = false;
    };
  }, [pacienteId, comoLocal, descartarAcesso]);

  const aoRegistrar = useCallback(
    async (valores: DadosEncaminhamento): Promise<EncaminhamentoLocal> => {
      try {
        return comoLocal(await gravar(undefined, valores));
      } catch (erro) {
        if (descartarAcesso(erro)) throw erro;
        throw new Error(mensagemFalha(erro));
      }
    },
    [gravar, comoLocal, descartarAcesso],
  );

  const aoAtualizar = useCallback(
    async (id: string, valores: DadosEncaminhamento): Promise<void> => {
      try {
        comoLocal(await gravar(id, valores));
      } catch (erro) {
        if (descartarAcesso(erro)) throw erro;
        throw new Error(mensagemFalha(erro));
      }
    },
    [gravar, comoLocal, descartarAcesso],
  );

  if (descartada) return null;

  if (fase.fase === 'carregando')
    return (
      <div className="grid min-w-0 gap-4">
        <Esqueleto ocupado />
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as telas e as provas já usam. */}
        <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave">
          Carregando encaminhamentos…
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

  return (
    <section className="grid min-w-0 gap-4">
      <h2 className="m-0 font-serifada text-(length:--texto-5) font-semibold leading-[1.2]">
        Encaminhamentos
      </h2>
      <EncaminhamentosLocais
        aprimorarControles
        dados={{ encaminhamentos: fase.encaminhamentos, aoRegistrar, aoAtualizar }}
      />
    </section>
  );
}

/** Interface da aba de encaminhamentos (FR-018), ligada ao serviço autorizado no servidor. */
export function montarEncaminhamentos(
  raiz: HTMLElement,
  pacienteId: string,
  servico: Servico,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  return ilha(
    raiz,
    <TelaEncaminhamentos pacienteId={pacienteId} servico={servico} acessoPerdido={acessoPerdido} />,
  );
}
