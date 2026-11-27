import { onTestFinished } from 'vitest';

/** Desmonta o Cadastro da casca enquanto o DOM do teste ainda existe. */
export async function montarCascaParaTeste(): Promise<void> {
  const { desmontarCamposDeCadastro } = await import('./main.js');
  onTestFinished(desmontarCamposDeCadastro);
}
