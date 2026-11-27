import { Component, type ReactNode } from 'react';

export const mensagemFalhaLinha =
  'Este registro não pôde ser apresentado. Os demais continuam disponíveis.';

/** Uma falha de apresentação não pode impedir a leitura dos outros registros (VIS-016). */
export class BarreiraDaLinha extends Component<
  { children: ReactNode; fallback: ReactNode; aoFalhar?: (erro: unknown) => void },
  { falhou: boolean }
> {
  override state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  override componentDidCatch(erro: unknown) {
    this.props.aoFalhar?.(erro);
  }

  override render() {
    return this.state.falhou ? this.props.fallback : this.props.children;
  }
}
