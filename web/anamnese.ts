import type { Anamnese } from '../packages/contracts/src/index.js';
import { localizarPendencias } from '../packages/cadastro/src/anamnese.js';
import { mensagemFalha } from './api.js';

type Servico = { consultarAnamnese(pacienteId: string): Promise<Anamnese | null> };

/** Consulta isolada; montagem depende da integração segura do servidor. */
export function montarAnamnese(
  raiz: HTMLElement,
  pacienteId: string,
  servico: Servico,
): () => void {
  let ativa = true;
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const status = elemento('p', 'Carregando anamnese…');
  status.setAttribute('role', 'status');
  raiz.replaceChildren(status);
  void servico
    .consultarAnamnese(pacienteId)
    .then((resultado) => {
      if (!ativa) return;
      const conteudo = elemento('section');
      conteudo.append(elemento('h2', 'Anamnese de coordenação'));
      if (!resultado || resultado.secoes.length === 0) {
        conteudo.append(elemento('p', 'Nenhuma seção registrada.'));
      } else {
        const pendencias = localizarPendencias(resultado.secoes);
        conteudo.append(
          elemento(
            'p',
            pendencias.length
              ? `Seções com pendências: ${pendencias.map((p) => p.secao).join(', ')}.`
              : 'Nenhuma pendência identificada nos campos informados.',
          ),
        );
        const estados = {
          pendente: 'Pendente',
          informado: 'Informado',
          desconhecido: 'Desconhecido',
          nao_se_aplica: 'Não se aplica',
        };
        for (const secao of resultado.secoes) {
          const grupo = elemento('section');
          grupo.append(elemento('h3', secao.id));
          const campos = new Set([
            ...secao.camposEsperados,
            ...secao.respostas.map((r) => r.campo),
          ]);
          for (const campo of campos) {
            const resposta = secao.respostas.find((r) => r.campo === campo);
            grupo.append(elemento('h4', campo));
            grupo.append(elemento('p', resposta ? estados[resposta.estado] : 'Pendente'));
            if (resposta?.estado === 'informado') grupo.append(elemento('p', resposta.valor));
            if (resposta && resposta.estado !== 'pendente')
              grupo.append(elemento('p', `Fonte: ${resposta.fonte} | Data: ${resposta.data}`));
          }
          conteudo.append(grupo);
        }
      }
      raiz.replaceChildren(conteudo);
    })
    .catch((erro: unknown) => {
      if (ativa) status.textContent = mensagemFalha(erro);
    });
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
