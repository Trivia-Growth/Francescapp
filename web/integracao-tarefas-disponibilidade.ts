import { FalhaApi, exigeNovoAcesso } from './api.ts';
import { botao } from './ponte/botao-imperativo.js';

type Identidade = { usuario_id: string; session_id: string };
/** Disponibilidade habilita controles, nunca substitui autorização transacional. */
export function montarTarefasComDisponibilidade(
  raiz: HTMLElement,
  pacienteId: string,
  portas: {
    identidadeAtual(): Identidade | null;
    casoAtual(): string | null;
    consultarDisponibilidade(pacienteId: string): Promise<{ escrita_disponivel: boolean }>;
    montar(
      destino: HTMLElement,
      escritaDisponivel: boolean,
      identidadeVigente: () => Identidade | null,
    ): () => void;
    acessoPerdido(erro: unknown): void;
  },
): () => void {
  let ativa = true;
  let consultando = false;
  let desmontar: (() => void) | undefined;
  const inicial = portas.identidadeAtual();
  const identidade = inicial ? { ...inicial } : null;
  const contextoVigente = () => {
    const atual = portas.identidadeAtual();
    return (
      ativa &&
      portas.casoAtual() === pacienteId &&
      identidade !== null &&
      atual !== null &&
      atual.usuario_id === identidade.usuario_id &&
      atual.session_id === identidade.session_id
    );
  };
  const aviso = document.createElement('p');
  aviso.setAttribute('role', 'status');
  aviso.textContent = 'Conferindo disponibilidade para alterar tarefas…';
  const tentar = botao({
    rotulo: 'Tentar conferir disponibilidade novamente',
    peso: 'secundario',
  });
  tentar.hidden = true;
  const conteudo = document.createElement('div');
  raiz.replaceChildren(aviso, tentar, conteudo);
  const perdeuContexto = () => {
    if (!ativa) return;
    ativa = false;
    desmontar?.();
    if (portas.casoAtual() !== pacienteId) return;
    raiz.replaceChildren();
    portas.acessoPerdido(new FalhaApi('nao_autenticado', 401));
  };
  const consultar = async () => {
    if (!ativa || consultando) return;
    if (!contextoVigente()) {
      perdeuContexto();
      return;
    }
    consultando = true;
    tentar.disabled = true;
    aviso.textContent = 'Conferindo disponibilidade para alterar tarefas…';
    try {
      const resultado = await portas.consultarDisponibilidade(pacienteId);
      if (!ativa) return;
      if (!contextoVigente()) {
        perdeuContexto();
        return;
      }
      // Um estado positivo só vale para o caso e a identidade desta montagem.
      desmontar?.();
      desmontar = portas.montar(conteudo, resultado.escrita_disponivel === true, () =>
        contextoVigente() ? portas.identidadeAtual() : null,
      );
      aviso.textContent = resultado.escrita_disponivel
        ? 'Disponibilidade confirmada. Confira envios pendentes antes de alterar tarefas.'
        : 'Criação e edição de tarefas indisponíveis neste caso.';
      tentar.hidden = true;
    } catch (erro) {
      if (!ativa) return;
      if (!contextoVigente()) {
        perdeuContexto();
        return;
      }
      if (exigeNovoAcesso(erro)) {
        ativa = false;
        desmontar?.();
        raiz.replaceChildren();
        portas.acessoPerdido(erro);
        return;
      }
      // Falha na disponibilidade nunca libera escrita. A leitura continua pela própria autorização.
      if (!desmontar)
        desmontar = portas.montar(conteudo, false, () =>
          contextoVigente() ? portas.identidadeAtual() : null,
        );
      aviso.textContent =
        'Não foi possível conferir a disponibilidade para alterar tarefas. Consulta mantida; tente novamente.';
      tentar.hidden = false;
    } finally {
      consultando = false;
      if (ativa) tentar.disabled = false;
    }
  };
  tentar.addEventListener('click', () => {
    void consultar();
  });
  void consultar();
  return () => {
    ativa = false;
    desmontar?.();
    raiz.replaceChildren();
  };
}
