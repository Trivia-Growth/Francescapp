import { criarPacienteSchema } from '../packages/contracts/src/index.js';

/** Campos opcionais vazios são omitidos, como exige o contrato de criação. */
export function lerCadastro(campos: {
  nome: string;
  nomePreferencia: string;
  nascimento: string;
}) {
  const preferencia = campos.nomePreferencia.trim();
  return criarPacienteSchema.safeParse({
    nome: campos.nome.trim(),
    ...(preferencia ? { nome_preferencia: preferencia } : {}),
    ...(campos.nascimento ? { data_nascimento: campos.nascimento } : {}),
  });
}
