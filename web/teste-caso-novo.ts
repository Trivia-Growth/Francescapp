import { expect, vi } from 'vitest';

/** Apoio de testes do cadastro de caso novo: equipe fictícia e preenchimento de todos os campos. */
export const ID_RESPONSAVEL = '30000000-0000-4000-8000-000000000001';

/** Corpo da listagem de equipe que o catálogo do cadastro novo consulta. */
export const equipeFicticia = {
  itens: [
    {
      id: '31000000-0000-4000-8000-000000000001',
      perfil: 'profissional',
      estado: 'vinculada',
      usuario_id: ID_RESPONSAVEL,
      versao: 1,
      email: 'equipe@exemplo.test',
      ativo: true,
    },
  ],
  proximo_cursor: null,
};

export const CAMINHO_EQUIPE = '/api/admin/concessoes-equipe';

/** Resposta da listagem de equipe no envelope do serviço (uma resposta nova a cada chamada). */
export const respostaEquipe = (corpo: unknown = equipeFicticia) =>
  Response.json({ dados: corpo, request_id: ID_RESPONSAVEL });

/** Entrada completa do caso novo, igual à que `preencherCasoNovo` digita no formulário. */
export const entradaCasoNovo = (nome = 'Paciente fictício') => ({
  nome,
  nome_preferencia: 'Pac',
  data_nascimento: '2000-01-31',
  contatos: [{ tipo: 'email' as const, valor: 'contato@exemplo.test' }],
  situacao: 'ativo' as const,
  responsavel_id: ID_RESPONSAVEL,
});

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Preenche tudo o que o caso novo exige. Espera a equipe carregar para poder escolher o responsável. */
export async function preencherCasoNovo(nome = 'Paciente fictício') {
  await vi.waitFor(() =>
    expect(el<HTMLSelectElement>('case-manager').options.length).toBeGreaterThan(1),
  );
  el<HTMLInputElement>('patient-name').value = nome;
  el<HTMLInputElement>('preferred-name').value = 'Pac';
  el<HTMLInputElement>('birth-date').value = '2000-01-31';
  el<HTMLInputElement>('contact-value-1').value = 'contato@exemplo.test';
  el<HTMLSelectElement>('case-status').value = 'ativo';
  el<HTMLSelectElement>('case-manager').value = ID_RESPONSAVEL;
}
