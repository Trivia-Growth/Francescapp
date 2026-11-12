import type { Orientacao } from '../packages/contracts/src/orientacao.ts';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { montarOrientacoesLocais, type OrientacaoLocal } from './orientacoes-local.js';
import type { EntradaOrientacao } from './servico-orientacoes-http.js';
import { esqueletoCarregando } from './esqueleto.js';

type Servico = {
  consultar(pacienteId: string, apenasVigentes?: boolean): Promise<Orientacao[]>;
  salvar(pacienteId: string, entrada: EntradaOrientacao): Promise<Orientacao>;
};

/** Interface da aba de orientações (FR-019), ligada ao serviço autorizado no servidor. */
export function montarOrientacoes(
  raiz: HTMLElement,
  pacienteId: string,
  servico: Servico,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  let ativa = true;
  // Cada orientação é imutável e versionada: superá-la exige a versão vigente.
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
  status.textContent = 'Carregando orientações…';
  raiz.replaceChildren(esqueletoCarregando(2, true), status);

  const comoLocal = (registro: Orientacao): OrientacaoLocal => {
    versoes.set(registro.orientacao_id, registro.versao);
    return {
      id: registro.orientacao_id,
      texto: registro.texto,
      autor: registro.autor,
      data: registro.data,
      destinatarios: registro.destinatarios,
      validade: registro.validade,
      anterior: registro.situacao === 'superada',
    };
  };
  const campos = (item: OrientacaoLocal) => ({
    texto: item.texto,
    autor: item.autor,
    data: item.data,
    destinatarios: item.destinatarios,
    validade: item.validade,
  });

  void (async () => {
    try {
      const registros = await servico.consultar(pacienteId);
      if (!ativa) return;
      const orientacoes = registros.map(comoLocal);
      const painel = document.createElement('section');
      const titulo = document.createElement('h2');
      titulo.textContent = 'Orientações';
      painel.append(titulo);
      const corpo = document.createElement('div');
      painel.append(corpo);
      montarOrientacoesLocais(corpo, {
        orientacoes,
        // A tela entrega a lista inteira; aqui ela vira as duas gravações que o banco
        // espera: superar a anterior (nova versão da mesma orientação) e criar a nova.
        aoSalvar: async (proximas) => {
          const anteriores = new Map(orientacoes.map((item) => [item.id, item]));
          const superadas = proximas.filter(
            (item) => item.anterior && anteriores.get(item.id)?.anterior === false,
          );
          const novas = proximas.filter((item) => !anteriores.has(item.id));
          try {
            for (const item of superadas) {
              const versao = versoes.get(item.id);
              if (versao === undefined) throw new Error('Versão vigente desconhecida.');
              comoLocal(
                await servico.salvar(pacienteId, {
                  orientacao_id: item.id,
                  versao_esperada: versao,
                  situacao: 'superada',
                  ...campos(item),
                }),
              );
            }
            for (const item of novas) {
              const gravada = await servico.salvar(pacienteId, {
                versao_esperada: 0,
                situacao: 'vigente',
                ...campos(item),
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
