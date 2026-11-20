import { describe, expect, it } from 'vitest';
import {
  type RegistroExecucaoPublico,
  rotinaTurnoPublicaSchema,
} from '../../../packages/contracts/src/turno-execucao-http.ts';
import { apresentarRegistroExecucao } from './turno-execucao-apresentacao.ts';

/** FR-076 e FR-062. O estado emocional da ficha de plantão entra como rotina do turno, e
 * precisa atravessar contrato, apresentação e relatório sem derrubar nada.
 *
 * Por que este arquivo existe: quando a ficha de plantão foi implementada, a projeção
 * passou a emitir `{ tipo: 'estado_emocional' }` enquanto `rotinaTurnoPublicaSchema` não
 * tinha essa variante. O efeito não seria um campo faltando — seria a PRIMEIRA ficha com
 * estado emocional derrubando o relatório de turno do período inteiro, porque o relatório
 * valida o lote. Nenhum teste cobria esse caminho, e por isso o defeito passou.
 *
 * Dados fictícios. */

const TURNO = 'b0000000-0000-4000-8000-000000000001';

/** Monta um registro público de rotina sem conversão forçada: o conteúdo entra tipado, e é
 * o compilador que confere a variante. Se a união perder `estado_emocional`, este arquivo
 * deixa de compilar — o que é exatamente o alarme que faltava. */
function registroDeRotina(dados: RegistroExecucaoPublico['conteudo']): RegistroExecucaoPublico {
  return {
    paciente_id: 'c0000000-0000-4000-8000-000000000003',
    turno_id: TURNO,
    registro_id: 'd0000000-0000-4000-8000-000000000004',
    versao: 1,
    registrador_usuario_id: 'a0000000-0000-4000-8000-000000000001',
    registrador_nome: null,
    criado_em: '2026-11-20T12:00:00Z',
    instante_ocorrencia: '2026-11-20T12:00:00Z',
    retificada: false,
    conteudo: dados,
  };
}

function registroComEstado(qualidade: string): RegistroExecucaoPublico {
  return registroDeRotina({
    classe: 'rotina',
    dados: {
      tipo: 'estado_emocional',
      turno_id: TURNO,
      instante_ocorrencia: '2026-11-20T12:00:00Z',
      qualidade,
    },
  });
}

describe('estado emocional na rotina do turno', () => {
  it('é aceito pelo contrato público da rotina, com o termo do catálogo administrado', () => {
    const r = rotinaTurnoPublicaSchema.safeParse({
      tipo: 'estado_emocional',
      turno_id: TURNO,
      instante_ocorrencia: '2026-11-20T12:00:00Z',
      qualidade: 'estado fictício',
    });
    expect(r.success).toBe(true);
  });

  it('não admite valor, pontuação, escala nem gravidade', () => {
    // A ausência é o controle: sem número não há o que derivar. Se algum destes passar a
    // ser aceito, a proibição de FR-076 e FR-081 deixa de ser garantida pelo esquema.
    for (const extra of [
      { valor: 7 },
      { pontuacao: 3 },
      { gravidade: 'alta' },
      { escala: 'PHQ-9' },
      { mililitros: 10 },
    ]) {
      const r = rotinaTurnoPublicaSchema.safeParse({
        tipo: 'estado_emocional',
        turno_id: TURNO,
        instante_ocorrencia: '2026-11-20T12:00:00Z',
        qualidade: 'estado fictício',
        ...extra,
      });
      expect(r.success, `aceitou ${JSON.stringify(extra)}`).toBe(false);
    }
  });

  it('exige o termo observado: sem ele o registro é recusado', () => {
    const r = rotinaTurnoPublicaSchema.safeParse({
      tipo: 'estado_emocional',
      turno_id: TURNO,
      instante_ocorrencia: '2026-11-20T12:00:00Z',
    });
    expect(r.success).toBe(false);
  });

  it('é apresentado como observação declarada, com o termo visível', () => {
    const texto = apresentarRegistroExecucao(registroComEstado('estado fictício'));
    expect(texto).toContain('Estado emocional observado');
    expect(texto).toContain('estado fictício');
  });

  it('não apresenta palavra que sugira medida, risco ou gravidade', () => {
    const texto = apresentarRegistroExecucao(registroComEstado('estado fictício'));
    for (const proibida of ['escala', 'pontuação', 'gravidade', 'risco', 'nível']) {
      expect(texto.toLowerCase()).not.toContain(proibida);
    }
  });

  it('as demais rotinas continuam apresentadas como antes', () => {
    // Guarda de regressão da variante vizinha: ao acrescentar `estado_emocional` à união,
    // o ramo final de `eliminacao` deixou de ser o `else` e precisou de condição própria.
    const texto = apresentarRegistroExecucao(
      registroDeRotina({
        classe: 'rotina',
        dados: {
          tipo: 'eliminacao',
          turno_id: TURNO,
          instante_ocorrencia: '2026-11-20T12:00:00Z',
          eliminacao: 'urina',
          contagem: 2,
        },
      }),
    );
    expect(texto).toContain('Eliminação observada');
    expect(texto).toContain('Contagem: 2');
  });
});
