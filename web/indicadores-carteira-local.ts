export type SituacaoCarteiraLocal =
  | 'entrada'
  | 'ativo'
  | 'pausado'
  | 'encerrado'
  | 'transferido'
  | '';

type DadosIndicadoresCarteiraLocal = {
  pacientes: readonly { situacao?: Exclude<SituacaoCarteiraLocal, ''> }[];
  filtrar?: (situacao: SituacaoCarteiraLocal) => void;
};

/** Conta somente situações informadas nos registros já carregados. */
export function montarIndicadoresCarteiraLocal(
  raiz: HTMLElement,
  dados: DadosIndicadoresCarteiraLocal,
): void {
  const situacoes: readonly [SituacaoCarteiraLocal, string][] = [
    ['entrada', 'Entrada'],
    ['ativo', 'Ativo'],
    ['pausado', 'Pausado'],
    ['encerrado', 'Encerrado'],
    ['transferido', 'Transferido'],
    ['', 'Não informada'],
  ];
  const lista = document.createElement('ul');
  for (const [situacao, rotulo] of situacoes) {
    const item = document.createElement('li');
    const quantidade = dados.pacientes.filter(
      (paciente) => (paciente.situacao ?? '') === situacao,
    ).length;
    const texto = `${rotulo}: ${quantidade}`;
    if (dados.filtrar) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.textContent = texto;
      botao.addEventListener('click', () => dados.filtrar?.(situacao));
      item.append(botao);
    } else {
      item.textContent = texto;
    }
    lista.append(item);
  }
  raiz.replaceChildren(lista);
}
