import { criarPacienteSchema } from '../packages/contracts/src/index.js';
import type { ContatoDigitado } from './campos-caso-novo.js';

/** Caso novo: o contrato exige todos os campos. Nada é omitido nem preenchido por padrão;
 * campo vazio chega ao contrato como veio e é recusado por ele. */
export function lerCadastro(campos: {
  nome: string;
  nomePreferencia: string;
  nascimento: string;
  contatos: ContatoDigitado[];
  situacao: string | undefined;
  responsavelId: string | undefined;
}) {
  return criarPacienteSchema.safeParse({
    nome: campos.nome.trim(),
    nome_preferencia: campos.nomePreferencia.trim(),
    data_nascimento: campos.nascimento,
    contatos: campos.contatos,
    situacao: campos.situacao,
    responsavel_id: campos.responsavelId,
  });
}
