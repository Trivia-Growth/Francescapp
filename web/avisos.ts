import { rotulosTipoAviso, type Aviso, type ListaAvisos } from '../packages/contracts/src/aviso.ts';
import { botao as botaoDaCamada } from './ui/basicos.js';

/** Serviço dos avisos no aplicativo (FR-072). Implementado por `servico-avisos-http.ts`;
 * aqui só existe o contrato, para que a tela seja testável sem rede. */
export type ServicoAvisos = {
  listar(): Promise<ListaAvisos>;
  marcarLido(aviso: Pick<Aviso, 'paciente_id' | 'tipo' | 'chave_origem'>): Promise<ListaAvisos>;
};

const estados = ['inicial', 'carregando', 'lista', 'vazio', 'falha'] as const;
export type EstadoAvisos = (typeof estados)[number];

function formatarInstante(valor: string | null): string {
  if (!valor) return 'sem data registrada';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 'sem data registrada';
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Sino e lista de avisos.
 *
 * Quatro estados observáveis e distintos, porque confundi-los é o erro perigoso aqui:
 * vazio só aparece depois de uma consulta real bem-sucedida, e falha nunca é apresentada
 * como "nenhum aviso" nem reaproveita a contagem de uma consulta anterior — o indicador é
 * apagado enquanto não há resposta boa.
 *
 * O texto de cada item descreve a ORIGEM do aviso, nunca o seu teor: quem quer saber o que
 * aconteceu abre o caso, onde a autorização é verificada de novo. */
export function montarAvisos(
  raiz: HTMLElement,
  servico: ServicoAvisos,
): { atualizar(): Promise<void>; estado(): EstadoAvisos } {
  raiz.replaceChildren();
  raiz.classList.add('avisos');

  const sino = document.createElement('button');
  sino.type = 'button';
  sino.id = 'avisos-sino';
  sino.className = 'avisos-sino';
  sino.setAttribute('aria-expanded', 'false');
  sino.setAttribute('aria-controls', 'avisos-painel');
  const rotuloSino = document.createElement('span');
  rotuloSino.className = 'avisos-sino-rotulo';
  rotuloSino.textContent = 'Avisos';
  const indicador = document.createElement('span');
  indicador.id = 'avisos-indicador';
  indicador.className = 'avisos-indicador';
  indicador.hidden = true;
  sino.append(rotuloSino, indicador);

  const painel = document.createElement('div');
  painel.id = 'avisos-painel';
  painel.className = 'avisos-painel';
  painel.hidden = true;

  const situacao = document.createElement('p');
  situacao.id = 'avisos-situacao';
  situacao.className = 'avisos-situacao';
  situacao.setAttribute('role', 'status');

  const lista = document.createElement('ul');
  lista.id = 'avisos-lista';
  lista.className = 'avisos-lista';

  painel.append(situacao, lista);
  raiz.append(sino, painel);

  let estadoAtual: EstadoAvisos = 'inicial';
  const marcar = (estado: EstadoAvisos) => {
    estadoAtual = estado;
    raiz.dataset.estado = estado;
  };
  marcar('inicial');

  const limparIndicador = () => {
    indicador.hidden = true;
    indicador.textContent = '';
    sino.removeAttribute('aria-description');
    sino.setAttribute('aria-label', 'Avisos');
  };

  const desenhar = (dados: ListaAvisos) => {
    lista.replaceChildren();
    for (const aviso of dados.itens) {
      const item = document.createElement('li');
      item.className = 'avisos-item';
      item.dataset.tipo = aviso.tipo;
      item.dataset.lido = String(aviso.lido);

      const titulo = document.createElement('p');
      titulo.className = 'avisos-item-titulo';
      titulo.textContent = rotulosTipoAviso[aviso.tipo];
      const detalhe = document.createElement('p');
      detalhe.className = 'avisos-item-detalhe';
      // Só referência: origem, instante e, na pendência de FR-027, o motivo operacional
      // que o próprio banco deriva de datas. Nada do conteúdo do caso.
      const partes = [formatarInstante(aviso.instante)];
      if (aviso.por_substituicao) partes.push('recebido por substituição');
      if (aviso.lido) partes.push('lido');
      detalhe.textContent = partes.join(' · ');
      item.append(titulo, detalhe);
      if (aviso.motivo) {
        const motivo = document.createElement('p');
        motivo.className = 'avisos-item-motivo';
        motivo.textContent = aviso.motivo;
        item.append(motivo);
      }

      if (!aviso.lido) {
        const botao = botaoDaCamada({ rotulo: 'Marcar como lido', peso: 'discreto' });
        botao.classList.add('avisos-item-lido');
        // Marcar como lido não registra ciência e não encerra a pendência (design D7):
        // o rótulo diz exatamente isso para que ninguém confunda os dois atos.
        botao.title = 'Tira do indicador. Não registra ciência nem encerra a pendência.';
        botao.addEventListener('click', () => {
          botao.disabled = true;
          void servico
            .marcarLido({
              paciente_id: aviso.paciente_id,
              tipo: aviso.tipo,
              chave_origem: aviso.chave_origem,
            })
            .then((novo) => {
              aplicar(novo);
            })
            .catch(() => {
              botao.disabled = false;
              falhar();
            });
        });
        item.append(botao);
      }
      lista.append(item);
    }
  };

  const aplicar = (dados: ListaAvisos) => {
    desenhar(dados);
    if (dados.nao_lidos > 0) {
      indicador.hidden = false;
      indicador.textContent = String(dados.nao_lidos);
      sino.setAttribute('aria-label', `Avisos: ${dados.nao_lidos} não lidos`);
    } else limparIndicador();
    if (dados.itens.length === 0) {
      marcar('vazio');
      situacao.textContent = 'Nenhum aviso para você agora.';
    } else {
      marcar('lista');
      situacao.textContent = `${dados.itens.length} aviso(s) na lista.`;
    }
  };

  const falhar = () => {
    // Falha não vira lista vazia e não reaproveita contagem anterior: o indicador some e
    // a lista é esvaziada, porque "não sabemos" não é "não há".
    lista.replaceChildren();
    limparIndicador();
    marcar('falha');
    situacao.textContent = 'Não foi possível carregar os avisos. Tente novamente.';
  };

  const atualizar = async () => {
    marcar('carregando');
    situacao.textContent = 'Carregando avisos…';
    lista.replaceChildren();
    lista.setAttribute('aria-busy', 'true');
    limparIndicador();
    try {
      aplicar(await servico.listar());
    } catch {
      falhar();
    } finally {
      lista.removeAttribute('aria-busy');
    }
  };

  sino.addEventListener('click', () => {
    const abrir = painel.hidden;
    painel.hidden = !abrir;
    sino.setAttribute('aria-expanded', String(abrir));
    if (abrir) void atualizar();
  });

  return { atualizar, estado: () => estadoAtual };
}
