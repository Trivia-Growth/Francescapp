import { Component, type ReactNode } from 'react';
import { Botao } from './componentes/ui/botao.js';
import { EstadoErro } from './componentes/ui/estado-erro.js';

type Props = {
  children: ReactNode;
  aoTentarNovamente: () => void;
  aoFalhar?: () => void;
  itemDaLista?: boolean;
};

/** Uma falha de renderização fica restrita ao painel ativo. */
export class LimiteErroPainel extends Component<Props, { falhou: boolean }> {
  override state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  override componentDidCatch() {
    this.props.aoFalhar?.();
  }

  override render() {
    if (!this.state.falhou) return this.props.children;
    const aviso = (
      <EstadoErro
        titulo="Não foi possível mostrar a área"
        texto="Tente abrir a área de novo."
        acao={
          <Botao peso="secundario" aoAtivar={this.props.aoTentarNovamente}>
            Tentar novamente
          </Botao>
        }
      />
    );
    return this.props.itemDaLista ? <li>{aviso}</li> : aviso;
  }
}
