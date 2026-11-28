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

/** Filtra a lista que já foi carregada pela demonstração. */
export function BuscaPacientesLocal({ aoBuscar }: { aoBuscar(texto: string): void }) {
  return (
    <label>
      Buscar paciente por nome ou nome preferido
      <input type="search" onInput={(evento) => aoBuscar(evento.currentTarget.value)} />
    </label>
  );
}
