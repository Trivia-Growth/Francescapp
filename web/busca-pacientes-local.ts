type PacienteBuscavelLocal = {
  name: string;
  preferredName?: string;
};

const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();

/** Filtra apenas registros já carregados pela prévia local. */
export function correspondeBuscaPacienteLocal(
  paciente: PacienteBuscavelLocal,
  texto: string,
): boolean {
  const busca = normalizar(texto);
  return [paciente.name, paciente.preferredName ?? ''].some((nome) =>
    normalizar(nome).includes(busca),
  );
}

/** Monta o campo de busca; a tabela mantém a apresentação dos resultados e do estado vazio. */
export function montarBuscaPacientesLocal(
  raiz: HTMLElement,
  aoBuscar: (texto: string) => void,
): void {
  const rotulo = document.createElement('label');
  rotulo.append('Buscar paciente por nome ou nome preferido');
  const campo = document.createElement('input');
  campo.type = 'search';
  campo.addEventListener('input', () => aoBuscar(campo.value));
  rotulo.append(campo);
  raiz.replaceChildren(rotulo);
}
