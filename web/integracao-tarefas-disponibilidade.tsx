import {
  Fragment,
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { FalhaApi, exigeNovoAcesso } from './api.js';
import { Botao } from './componentes/ui/botao.js';

type Identidade = { usuario_id: string; session_id: string };
type PortasTarefas = {
  identidadeAtual(): Identidade | null;
  casoAtual(): string | null;
  consultarDisponibilidade(pacienteId: string): Promise<{ escrita_disponivel: boolean }>;
  compor(escritaDisponivel: boolean, identidadeVigente: () => Identidade | null): ReactElement;
  acessoPerdido(erro: unknown): void;
};
type Painel = { tela: ReactElement; revisao: number };
type Fase = 'inicial' | 'somente-leitura' | 'confirmada' | 'falhou' | 'encerrada';

const mensagens: Record<Exclude<Fase, 'encerrada'>, string> = {
  inicial: 'Conferindo disponibilidade para alterar tarefas…',
  'somente-leitura': 'Criação e edição de tarefas indisponíveis neste caso.',
  confirmada: 'Disponibilidade confirmada. Confira envios pendentes antes de alterar tarefas.',
  falhou:
    'Não foi possível conferir a disponibilidade para alterar tarefas. Consulta mantida; tente novamente.',
};

/** A disponibilidade libera os controles de escrita para a sessão e o caso consultados. */
export function TarefasComDisponibilidade({
  pacienteId,
  portas,
}: {
  pacienteId: string;
  portas: PortasTarefas;
}) {
  const [identidade] = useState(() => {
    const atual = portas.identidadeAtual();
    return atual ? { ...atual } : null;
  });
  const [fase, definirFase] = useState<Fase>('inicial');
  const [consultando, definirConsultando] = useState(false);
  const [painel, definirPainel] = useState<Painel | null>(null);
  const painelAtual = useRef<Painel | null>(null);
  const consultaEmCurso = useRef(false);
  const ativa = useRef(false);
  const destinoFoco = useRef<HTMLDivElement>(null);
  const focarAposTentativa = useRef(false);

  useLayoutEffect(() => {
    ativa.current = true;
    return () => {
      ativa.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (fase !== 'confirmada' && fase !== 'somente-leitura') return;
    if (focarAposTentativa.current && document.activeElement === document.body)
      destinoFoco.current?.focus();
    focarAposTentativa.current = false;
  }, [fase]);

  const identidadeVigente = useCallback(() => {
    if (!ativa.current || portas.casoAtual() !== pacienteId || !identidade) return null;
    const atual = portas.identidadeAtual();
    return atual?.usuario_id === identidade.usuario_id && atual.session_id === identidade.session_id
      ? atual
      : null;
  }, [identidade, pacienteId, portas]);

  const consultar = useCallback(async () => {
    await Promise.resolve();
    if (!ativa.current || consultaEmCurso.current) return;
    const encerrar = (erro: unknown) => {
      ativa.current = false;
      painelAtual.current = null;
      flushSync(() => {
        definirPainel(null);
        definirFase('encerrada');
      });
      if (portas.casoAtual() === pacienteId) portas.acessoPerdido(erro);
    };
    const temContexto = () => {
      if (!ativa.current) return false;
      if (identidadeVigente()) return true;
      encerrar(new FalhaApi('nao_autenticado', 401));
      return false;
    };
    const compor = (escritaDisponivel: boolean) => {
      const novo = {
        tela: portas.compor(escritaDisponivel, identidadeVigente),
        revisao: (painelAtual.current?.revisao ?? 0) + 1,
      };
      painelAtual.current = novo;
      definirPainel(novo);
    };
    if (!temContexto()) return;
    consultaEmCurso.current = true;
    definirConsultando(true);
    try {
      const resultado = await portas.consultarDisponibilidade(pacienteId);
      if (!temContexto()) return;
      const escrita = resultado.escrita_disponivel === true;
      compor(escrita);
      definirFase(escrita ? 'confirmada' : 'somente-leitura');
    } catch (erro) {
      if (!temContexto()) return;
      if (exigeNovoAcesso(erro)) {
        encerrar(erro);
        return;
      }
      if (!painelAtual.current) compor(false);
      definirFase('falhou');
    } finally {
      consultaEmCurso.current = false;
      if (ativa.current) definirConsultando(false);
    }
  }, [identidadeVigente, pacienteId, portas]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  if (fase === 'encerrada') return null;
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: anúncio do resultado assíncrono. */}
      <p role="status">{mensagens[consultando ? 'inicial' : fase]}</p>
      {fase === 'falhou' ? (
        <Botao
          peso="secundario"
          disabled={consultando}
          aoAtivar={() => {
            focarAposTentativa.current = true;
            void consultar();
          }}
        >
          Tentar conferir disponibilidade novamente
        </Botao>
      ) : null}
      <div ref={destinoFoco} tabIndex={-1}>
        {painel ? <Fragment key={painel.revisao}>{painel.tela}</Fragment> : null}
      </div>
    </>
  );
}
