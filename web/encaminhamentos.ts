import type { Encaminhamento } from '../packages/contracts/src/encaminhamento.ts';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import {
  montarEncaminhamentosLocais,
  type DadosEncaminhamento,
  type EncaminhamentoLocal,
  type EstadoEncaminhamento,
} from './encaminhamentos-local.js';

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

/** Interface da aba de encaminhamentos (FR-018), ligada ao serviço autorizado no servidor. */
export function montarEncaminhamentos(
  raiz: HTMLElement,
  pacienteId: string,
  servico: Servico,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  let ativa = true;
  // Cada encaminhamento é imutável e versionado: revisar exige a versão vigente.
  const versoes = new Map<string, number>();
  const descartarAcesso = (erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Carregando encaminhamentos…';
  raiz.replaceChildren(status);

  const comoLocal = (registro: Encaminhamento): EncaminhamentoLocal => {
    versoes.set(registro.encaminhamento_id, registro.versao);
    return {
      id: registro.encaminhamento_id,
      destino: registro.destino,
      motivo: registro.motivo,
      responsavel: registro.responsavel,
      estado: rotulos[registro.etapa],
    };
  };
  const gravar = async (id: string | undefined, valores: DadosEncaminhamento) => {
    const versao = id ? versoes.get(id) : 0;
    if (versao === undefined) throw new Error('Versão vigente desconhecida.');
    return servico.salvar(pacienteId, {
      ...(id ? { encaminhamento_id: id } : {}),
      versao_esperada: versao,
      etapa: etapaDe(valores.estado),
      destino: valores.destino,
      motivo: valores.motivo,
      responsavel: valores.responsavel,
    });
  };

  void (async () => {
    try {
      const registros = await servico.consultar(pacienteId);
      if (!ativa) return;
      const encaminhamentos = registros.map(comoLocal);
      const painel = document.createElement('section');
      const titulo = document.createElement('h2');
      titulo.textContent = 'Encaminhamentos';
      painel.append(titulo);
      const corpo = document.createElement('div');
      painel.append(corpo);
      montarEncaminhamentosLocais(corpo, {
        encaminhamentos,
        aoRegistrar: async (valores) => {
          try {
            return comoLocal(await gravar(undefined, valores));
          } catch (erro) {
            if (descartarAcesso(erro)) throw erro;
            throw new Error(mensagemFalha(erro));
          }
        },
        aoAtualizar: async (id, valores) => {
          try {
            comoLocal(await gravar(id, valores));
          } catch (erro) {
            if (descartarAcesso(erro)) throw erro;
            throw new Error(mensagemFalha(erro));
          }
        },
      });
      if (ativa) raiz.replaceChildren(painel);
    } catch (erro) {
      if (!ativa || descartarAcesso(erro)) return;
      status.textContent = mensagemFalha(erro);
    }
  })();

  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
