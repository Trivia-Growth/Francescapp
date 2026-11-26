import { describe, it, expect } from 'vitest';
import { apresentarRegistroExecucao } from './turno-execucao-apresentacao.ts';
import type { RegistroExecucaoPublico } from '../../../packages/contracts/src/turno-execucao-http.ts';
const a = 'a0000000-0000-4000-8000-000000000001';
const b = 'a0000000-0000-4000-8000-000000000002';
const registro: RegistroExecucaoPublico = {
  paciente_id: 'c0000000-0000-4000-8000-000000000003',
  turno_id: null,
  registro_id: 'd0000000-0000-4000-8000-000000000004',
  versao: 1,
  registrador_usuario_id: a,
  registrador_nome: null,
  criado_em: '2026-11-19T12:00:00Z',
  instante_ocorrencia: '2026-11-19T12:00:00Z',
  retificada: false,
  conteudo: {
    classe: 'prescricao',
    dados: {
      nome: 'Medicação fictícia',
      dose: 'Dose fictícia',
      via: 'Via fictícia',
      horarios: ['08:00:00'],
      vigencia_inicio: '2026-11-19T00:00:00Z',
      vigencia_fim: null,
      fonte_documental: 'Fonte fictícia',
    },
  },
};
describe('autoria persistida nos PDFs de turno', () => {
  it('distingue dois autores legados sem nome sem inventar identidade atual', () => {
    const um = apresentarRegistroExecucao(registro);
    const dois = apresentarRegistroExecucao({ ...registro, registrador_usuario_id: b });
    expect(um).toContain(`identificador do autor persistido ${a}`);
    expect(dois).toContain(`identificador do autor persistido ${b}`);
    expect(um).not.toEqual(dois);
  });
  it('usa nome atual quando a fonte autorizada o fornece', () => {
    const texto = apresentarRegistroExecucao({
      ...registro,
      registrador_nome: 'Profissional fictício',
    });
    expect(texto).toContain('Registrador autenticado: Profissional fictício');
    expect(texto).not.toContain(a);
  });
});
