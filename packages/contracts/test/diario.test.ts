import { describe, expect, it } from 'vitest';
import { registroDiarioSchema, salvarRegistroDiarioSchema } from '../src/diario.ts';

/** Estas regras não cabem no banco, porque lá o conteúdo é cifrado. O banco garante autoria,
 * data, estado, audiência e a presença da justificativa na retificação; o que depende de ler
 * o texto é conferido aqui e no servidor. Dados fictícios. */

const relato = {
  versao_esperada: 0,
  tipo: 'relato_familiar',
  estado: 'publicado',
  audiencia: 'equipe',
  atencao: false,
  retorno_solicitado: true,
  origem_conteudo: 'texto',
  conteudo: { dataAcontecimento: '2026-11-10', descricao: 'Dormiu mal depois da escola.' },
} as const;

const evolucao = {
  versao_esperada: 0,
  tipo: 'evolucao_profissional',
  estado: 'publicado',
  audiencia: 'equipe',
  atencao: false,
  retorno_solicitado: false,
  origem_conteudo: 'texto',
  conteudo: { data: '2026-11-10', area: 'Fonoaudiologia', atividade: 'Sessão de 40 minutos.' },
} as const;

describe('salvarRegistroDiarioSchema', () => {
  it('FR-008: aceita relato só com data e descrição', () => {
    expect(salvarRegistroDiarioSchema.safeParse(relato).success).toBe(true);
  });

  it('FR-008: recusa relato sem descrição', () => {
    const { descricao: _descricao, ...conteudo } = relato.conteudo;
    expect(salvarRegistroDiarioSchema.safeParse({ ...relato, conteudo }).success).toBe(false);
  });

  it('FR-009: publicar evolução exige síntese, mas rascunho não', () => {
    const { atividade: _atividade, ...conteudo } = evolucao.conteudo;
    expect(salvarRegistroDiarioSchema.safeParse({ ...evolucao, conteudo }).success).toBe(false);
    expect(
      salvarRegistroDiarioSchema.safeParse({ ...evolucao, conteudo, estado: 'rascunho' }).success,
    ).toBe(true);
  });

  it('FR-012: retificar exige justificativa e publicar não a aceita', () => {
    expect(
      salvarRegistroDiarioSchema.safeParse({
        ...evolucao,
        diario_registro_id: '7f2b0a1e-0000-4000-8000-000000000001',
        versao_esperada: 1,
        estado: 'retificado',
      }).success,
    ).toBe(false);
    expect(
      salvarRegistroDiarioSchema.safeParse({
        ...evolucao,
        diario_registro_id: '7f2b0a1e-0000-4000-8000-000000000001',
        versao_esperada: 1,
        estado: 'retificado',
        justificativa: 'Troquei a data do atendimento.',
      }).success,
    ).toBe(true);
    expect(
      salvarRegistroDiarioSchema.safeParse({ ...evolucao, justificativa: 'sem motivo' }).success,
    ).toBe(false);
  });

  it('relato familiar não amplia audiência nem responde registro alheio', () => {
    expect(
      salvarRegistroDiarioSchema.safeParse({ ...relato, audiencia: 'equipe_e_familia' }).success,
    ).toBe(false);
    expect(
      salvarRegistroDiarioSchema.safeParse({
        ...relato,
        responde_registro_id: '7f2b0a1e-0000-4000-8000-000000000002',
      }).success,
    ).toBe(false);
  });

  it('rascunho não responde ninguém, porque é privado do autor', () => {
    expect(
      salvarRegistroDiarioSchema.safeParse({
        ...evolucao,
        estado: 'rascunho',
        responde_registro_id: '7f2b0a1e-0000-4000-8000-000000000002',
      }).success,
    ).toBe(false);
  });

  it('criação e revisão não se confundem: versão zero não leva identificador', () => {
    expect(
      salvarRegistroDiarioSchema.safeParse({
        ...evolucao,
        diario_registro_id: '7f2b0a1e-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false);
    expect(salvarRegistroDiarioSchema.safeParse({ ...evolucao, versao_esperada: 2 }).success).toBe(
      false,
    );
  });

  it('rejeita campo de autoridade enviado pela entrada', () => {
    expect(
      salvarRegistroDiarioSchema.safeParse({ ...evolucao, autor_usuario_id: 'qualquer' }).success,
    ).toBe(false);
    expect(salvarRegistroDiarioSchema.safeParse({ ...evolucao, consultas: 9 }).success).toBe(false);
  });
});

describe('registroDiarioSchema', () => {
  const projecao = {
    diario_registro_id: '7f2b0a1e-0000-4000-8000-000000000001',
    registro_id: '7f2b0a1e-0000-4000-8000-000000000002',
    versao: 1,
    tipo: 'relato_familiar',
    autor_usuario_id: '7f2b0a1e-0000-4000-8000-000000000003',
    estado: 'publicado',
    audiencia: 'equipe',
    atencao: false,
    retorno_solicitado: true,
    origem_conteudo: 'texto',
    responde_registro_id: null,
    tarefa_id: null,
    criado_em: '2026-11-11T15:48:13.157219-03:00',
    consultas: 0,
    conteudo: relato.conteudo,
  };

  it('aceita a projeção que o servidor devolve', () => {
    expect(registroDiarioSchema.safeParse(projecao).success).toBe(true);
  });

  it('exige justificativa no retificado e a recusa fora dele', () => {
    expect(registroDiarioSchema.safeParse({ ...projecao, estado: 'retificado' }).success).toBe(
      false,
    );
    expect(registroDiarioSchema.safeParse({ ...projecao, justificativa: 'motivo' }).success).toBe(
      false,
    );
    expect(
      registroDiarioSchema.safeParse({
        ...projecao,
        estado: 'retificado',
        justificativa: 'motivo',
      }).success,
    ).toBe(true);
  });
});
