import { describe, it, expect, vi } from 'vitest';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.ts';
import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.ts';
import { criarIdempotenciaNativa } from './idempotencia-nativa.ts';
import { operarExecucaoTurno, type PortasExecucaoTurno } from './turno-execucao-nativo.ts';
const paciente = 'c0000000-0000-4000-8000-000000000003';
const usuario = 'a0000000-0000-4000-8000-000000000001';
const sessao = 'b0000000-0000-4000-8000-000000000002';
const id = 'd0000000-0000-4000-8000-000000000004';
const turno = 'e0000000-0000-4000-8000-000000000005';
const pedido = () =>
  new Request('https://exemplo.test/', {
    headers: { 'x-sessao': sessao, 'x-chave-idempotencia': 'chave_ficticia_123456' },
  });
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(16).fill(0)]);
const anexo = {
  anexo_id: id,
  ocorrencia_id: id,
  ocorrencia_versao: 1,
  mime_type: 'image/png' as const,
  tamanho_bytes: png.length,
  audiencia: 'equipe' as const,
  arquivo_base64: btoa(String.fromCharCode(...png)),
};
function portas(handler?: (acao: string, entrada: Record<string, unknown>) => Promise<unknown>) {
  const cifra = criarCifraAutenticada({
    keyIdAtiva: 'teste',
    chavesDeCifra: { teste: new Uint8Array(32).fill(2) },
    chaveHmac: new Uint8Array(32).fill(4),
  });
  const identidade = { usuario_id: usuario, session_id: sessao };
  const p: PortasExecucaoTurno = {
    autorizar: async () => ({ estado: 'autorizado', identidade }),
    revalidar: async () => ({ estado: 'autorizado', identidade }),
    areas: ['Cuidado'],
    cifra,
    idempotencia: criarIdempotenciaNativa(cifra),
    atestador: criarAtestadorOperacao({ keyId: 'teste', chave: new Uint8Array(32).fill(3) }),
    metadados: (request_id) => ({
      key_id: 'teste',
      request_id,
      emitido_em: '2026-11-19T12:00:00Z',
      expira_em: '2026-11-19T12:00:30Z',
    }),
    storage: { enviar: vi.fn(async () => 'criado' as const), obter: vi.fn(async () => png) },
    lerCaso: vi.fn(async () => []),
    executar: vi.fn(async (_rpc, { p_transporte }) => {
      const e = p_transporte.entrada;
      const acao = String((e.atestado as { operacao: string }).operacao);
      const dados = handler ? await handler(acao, e) : [];
      return { ok: true, repeticao: false, request_id: e.request_id, dados };
    }),
  };
  return p;
}
describe('BFF execução: reserva, recuperação e fronteiras', () => {
  it.each(['sem_permissao', 'nao_autenticado'])(
    'nega %s antes de bytes Storage e fontes clínicas',
    async (codigo) => {
      const p = portas();
      p.executar = vi.fn(async (_r, { p_transporte }) => ({
        ok: false,
        erro: { codigo },
        request_id: p_transporte.entrada.request_id,
      }));
      const r = await operarExecucaoTurno(
        pedido(),
        { operacao: 'enviarAnexo', paciente_id: paciente, entrada: anexo },
        p,
      );
      expect(r.ok).toBe(false);
      expect(p.storage.enviar).not.toHaveBeenCalled();
      expect(p.storage.obter).not.toHaveBeenCalled();
      expect(p.lerCaso).not.toHaveBeenCalled();
    },
  );
  it('reserva autorizada vem antes de upload e confirmação vem depois', async () => {
    const ordem: string[] = [];
    const p = portas(async (acao) => {
      ordem.push(acao);
      if (acao === 'api.reservar_anexo_turno' || acao === 'api.consultar_anexo_turno')
        return {
          id,
          paciente_id: paciente,
          ocorrencia_id: id,
          objeto_nome: `${paciente}/${id}/${id}`,
          mime_type: 'image/png',
          tamanho_bytes: png.length,
          audiencia: 'equipe',
        };
      return { anexo_id: id, confirmado: true };
    });
    p.storage.enviar = vi.fn(async () => {
      ordem.push('upload');
      return 'criado';
    });
    const r = await operarExecucaoTurno(
      pedido(),
      { operacao: 'enviarAnexo', paciente_id: paciente, entrada: anexo },
      p,
    );
    expect(r.ok).toBe(true);
    expect(ordem).toEqual([
      'api.reservar_anexo_turno',
      'upload',
      'api.confirmar_anexo_turno',
      'api.consultar_anexo_turno',
    ]);
  });
  it('resposta de confirmação perdida preserva bytes; retry409 confere conteúdo sem overwrite', async () => {
    let perder = true;
    let uploads = 0;
    const p = portas(async (acao) => {
      if (acao === 'api.confirmar_anexo_turno') {
        if (perder) {
          perder = false;
          throw new Error('Resposta perdida');
        }
        return { anexo_id: id, confirmado: true };
      }
      return {
        id,
        paciente_id: paciente,
        ocorrencia_id: id,
        objeto_nome: `${paciente}/${id}/${id}`,
        mime_type: 'image/png',
        tamanho_bytes: png.length,
        audiencia: 'equipe',
      };
    });
    p.storage.enviar = vi.fn(async () => (++uploads === 1 ? 'criado' : 'existente'));
    const comando = { operacao: 'enviarAnexo' as const, paciente_id: paciente, entrada: anexo };
    expect(await operarExecucaoTurno(pedido(), comando, p)).toMatchObject({
      ok: false,
      erro: { codigo: 'pendencia_externa' },
    });
    expect((await operarExecucaoTurno(pedido(), comando, p)).ok).toBe(true);
    expect(p.storage.obter).toHaveBeenCalledTimes(1);
    expect(Object.keys(p.storage)).toEqual(['enviar', 'obter']);
  });
  it('rejeita capacidade de outro caso retornada na reserva: zero uploads', async () => {
    const p = portas(async () => ({ id, paciente_id: usuario, objeto_nome: 'outro-caso' }));
    expect(
      (
        await operarExecucaoTurno(
          pedido(),
          { operacao: 'enviarAnexo', paciente_id: paciente, entrada: anexo },
          p,
        )
      ).ok,
    ).toBe(false);
    expect(p.storage.enviar).not.toHaveBeenCalled();
  });
  it('não lê bytes após autorização de anexo negada', async () => {
    const p = portas();
    p.executar = vi.fn(async (_r, { p_transporte }) => ({
      ok: false,
      erro: { codigo: 'sem_permissao' },
      request_id: p_transporte.entrada.request_id,
    }));
    expect(
      (
        await operarExecucaoTurno(
          pedido(),
          { operacao: 'baixarAnexo', paciente_id: paciente, anexo_id: id, entrada: {} },
          p,
        )
      ).ok,
    ).toBe(false);
    expect(p.storage.obter).not.toHaveBeenCalled();
  });
  it('revogação na reautorização final impede entregar bytes carregados', async () => {
    const p = portas(async () => ({
      id,
      paciente_id: paciente,
      objeto_nome: 'privado',
      mime_type: 'image/png',
      tamanho_bytes: png.length,
    }));
    p.revalidar = async () => ({ estado: 'sem_permissao' });
    expect(
      (
        await operarExecucaoTurno(
          pedido(),
          { operacao: 'baixarAnexo', paciente_id: paciente, anexo_id: id, entrada: {} },
          p,
        )
      ).ok,
    ).toBe(false);
    expect(p.storage.obter).toHaveBeenCalledOnce();
  });
  it('MIME forjado falha antes da reserva e upload', async () => {
    const p = portas();
    expect(
      await operarExecucaoTurno(
        pedido(),
        {
          operacao: 'enviarAnexo',
          paciente_id: paciente,
          entrada: { ...anexo, mime_type: 'image/jpeg' },
        },
        p,
      ),
    ).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
    expect(p.executar).not.toHaveBeenCalled();
    expect(p.storage.enviar).not.toHaveBeenCalled();
  });
  it('consulta de recuperação de conversão inclui autorização filha TaskRead no mesmo atestado', async () => {
    const p = portas(async (acao, e) => {
      expect(acao).toBe('api.consultar_conversao_ocorrencia_turno');
      const filho = e.autorizacao_tarefa as { entrada: Record<string, unknown> };
      expect(filho.entrada).toMatchObject({
        paciente_id: paciente,
        request_id: e.request_id,
        autorizacao_somente: true,
        atestado: { operacao: 'api.ler_tarefas_cuidado', usuario_id: usuario, session_id: sessao },
      });
      return null;
    });
    expect(
      (
        await operarExecucaoTurno(
          pedido(),
          {
            operacao: 'consultarConversaoOcorrencia',
            paciente_id: paciente,
            entrada: { registro_id: id },
          },
          p,
        )
      ).ok,
    ).toBe(true);
  });
  it('PDF confirmado é conferível; repetição não gera nem entrega bytes novos', async () => {
    const p = portas(async () => ({ exportacao_id: id, registrado_em: '2026-11-19T12:00:00Z' }));
    const r = await operarExecucaoTurno(
      pedido(),
      {
        operacao: 'pdf',
        paciente_id: paciente,
        entrada: {
          tipo: 'diario',
          inicio: '2026-11-19T00:00:00Z',
          fim: '2026-11-20T00:00:00Z',
          exportacao_id: id,
          destinatario: 'Equipe fictícia',
          proposito: 'Continuidade fictícia',
        },
      },
      p,
    );
    expect(r).toMatchObject({ ok: false, erro: { codigo: 'conflito_idempotencia' } });
    expect(p.executar).toHaveBeenCalledOnce();
    expect(p.lerCaso).not.toHaveBeenCalled();
  });
  it('família negada no relatório caso não dispara fontes nem manifesto', async () => {
    const p = portas(async () => null);
    p.executar = vi.fn(async (_r, { p_transporte }) => {
      const acao = (p_transporte.entrada.atestado as { operacao: string }).operacao;
      return acao === 'api.consultar_exportacao_turno'
        ? { ok: true, repeticao: false, dados: null, request_id: p_transporte.entrada.request_id }
        : {
            ok: false,
            erro: { codigo: 'sem_permissao' },
            request_id: p_transporte.entrada.request_id,
          };
    });
    const r = await operarExecucaoTurno(
      pedido(),
      {
        operacao: 'pdf',
        paciente_id: paciente,
        entrada: {
          tipo: 'caso',
          inicio: '2026-11-19T00:00:00Z',
          fim: '2026-11-20T00:00:00Z',
          exportacao_id: id,
          destinatario: 'Equipe fictícia',
          proposito: 'Finalidade fictícia',
        },
      },
      p,
    );
    expect(r.ok).toBe(false);
    expect(p.lerCaso).not.toHaveBeenCalled();
  });
});
describe('PDF servidor: persistência, snapshot e auditoria', () => {
  const consultaId = 'f0000000-0000-4000-8000-000000000006';
  const entrada = {
    tipo: 'diario' as const,
    inicio: '2026-11-19T00:00:00Z',
    fim: '2026-11-20T00:00:00Z',
    exportacao_id: id,
    destinatario: 'Equipe fictícia',
    proposito: 'Continuidade fictícia',
  };
  function pagina() {
    return {
      tipo: 'diario',
      paciente_id: paciente,
      inicio: entrada.inicio,
      fim: entrada.fim,
      itens: [],
      identidades: [],
      proximo_cursor: null,
      lacunas: [],
      consulta_id: consultaId,
      instante_corte: '2026-11-19T12:00:00Z',
      rotulos_atuais: true,
    };
  }
  it('gera bytes somente com snapshot persistido e exportação auditada; destinatário nunca segue em claro', async () => {
    let auditou = false;
    let digestConfirmado: unknown;
    const p = portas(async (acao, e) => {
      if (acao === 'api.consultar_exportacao_turno') return null;
      if (acao === 'api.consultar_relatorio_turno') return pagina();
      expect(acao).toBe('api.registrar_exportacao_turno');
      expect(e.consulta_id).toBe(consultaId);
      expect(e.destinatario).not.toBe(entrada.destinatario);
      expect(e.proposito).not.toBe(entrada.proposito);
      expect(e.digest_pdf).toMatch(/^[A-Za-z0-9_-]{43}$/);
      digestConfirmado = e.digest_pdf;
      auditou = true;
      return { exportacao_id: id, registrado_em: '2026-11-19T12:00:00Z' };
    });
    const r = await operarExecucaoTurno(
      pedido(),
      { operacao: 'pdf', paciente_id: paciente, entrada },
      p,
    );
    expect(auditou).toBe(true);
    expect(r.ok && r.dados instanceof Uint8Array).toBe(true);
    if (!r.ok || !(r.dados instanceof Uint8Array)) throw new Error('PDF não retornado');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(r.dados)));
    expect(digestConfirmado).toBe(
      btoa(String.fromCharCode(...hash))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, ''),
    );
    expect(p.lerCaso).not.toHaveBeenCalled();
  });
  it('falha de auditoria não entrega arquivo nem cria Storage', async () => {
    const p = portas(async (acao) => {
      if (acao === 'api.consultar_exportacao_turno') return null;
      if (acao === 'api.consultar_relatorio_turno') return pagina();
      throw new Error('Auditoria indisponível');
    });
    const r = await operarExecucaoTurno(
      pedido(),
      { operacao: 'pdf', paciente_id: paciente, entrada },
      p,
    );
    expect(r).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
    expect(r).not.toHaveProperty('dados');
    expect(p.storage.enviar).not.toHaveBeenCalled();
  });
  it('mantém consulta_id entre páginas e inclui a segunda página sem truncar', async () => {
    let chamadas = 0;
    const p = portas(async (acao, e) => {
      if (acao === 'api.consultar_exportacao_turno') return null;
      if (acao === 'api.registrar_exportacao_turno')
        return { exportacao_id: id, registrado_em: '2026-11-19T12:00:00Z' };
      chamadas++;
      if (chamadas > 1) expect(e.consulta_id).toBe(consultaId);
      return {
        ...pagina(),
        proximo_cursor:
          chamadas <= 2
            ? { instante: '2026-11-19T01:00:00Z', id, versao: 1, classe: 'ocorrencia' }
            : null,
      };
    });
    const r = await operarExecucaoTurno(
      pedido(),
      { operacao: 'pdf', paciente_id: paciente, entrada },
      p,
    );
    expect(r.ok).toBe(true);
    expect(chamadas).toBe(4);
  });
});
describe('barreira clínica durável própria', () => {
  it('recupera recibo operacional sem ler caso/Storage e preserva a época retornada', async () => {
    const p = portas(async (acao, e) => {
      expect(acao).toBe('api.reconciliar_execucao_turno');
      expect(e.comando_id).toBe(id);
      return {
        epoca: 2,
        resultado_pendente: {
          recibo_id: id,
          paciente_id: paciente,
          classe: 'ocorrencia',
          registro_id: id,
          versao: 1,
          registrado_em: '2026-11-19T12:00:00Z',
        },
      };
    });
    const r = await operarExecucaoTurno(
      pedido(),
      { operacao: 'reconciliar', paciente_id: paciente, entrada: { comando_id: id } },
      p,
    );
    expect(r).toMatchObject({
      ok: true,
      dados: { epoca: 2, resultado_pendente: { recibo_id: id } },
    });
    expect(p.lerCaso).not.toHaveBeenCalled();
    expect(p.storage.enviar).not.toHaveBeenCalled();
  });
  it('reconhecimento assina época e recibo exatos, sem dados clínicos', async () => {
    const p = portas(async (acao, e) => {
      expect(acao).toBe('api.reconhecer_execucao_turno');
      expect(e).toMatchObject({ epoca: 2, recibo_id: id });
      return { epoca: 2, resultado_pendente: null };
    });
    expect(
      (
        await operarExecucaoTurno(
          pedido(),
          { operacao: 'reconhecer', paciente_id: paciente, entrada: { epoca: 2, recibo_id: id } },
          p,
        )
      ).ok,
    ).toBe(true);
  });
});
describe('anexos autorizados no relatório geral', () => {
  it('preserva metadados de foto autorizados pela RPC sem caminho de Storage nem bytes', async () => {
    const p = portas();
    const { cifrarExecucao } = await import('./turno-execucao-projecao.ts');
    const cifrado = await cifrarExecucao(
      {
        epoca: 1,
        registro_id: id,
        versao_esperada: 0,
        conteudo: {
          classe: 'ocorrencia',
          dados: {
            turno_id: turno,
            descricao: 'Ocorrência fictícia',
            providencia: 'Providência fictícia',
            instante_ocorrencia: '2026-11-19T01:00:00Z',
          },
        },
      },
      paciente,
      'chave_ficticia_123456',
      'd'.repeat(43),
      p.cifra,
    );
    p.executar = vi.fn(async (_r, { p_transporte }) => ({
      ok: true,
      repeticao: false,
      request_id: p_transporte.entrada.request_id,
      dados: {
        consulta_id: 'f0000000-0000-4000-8000-000000000006',
        instante_corte: '2026-11-19T12:00:00Z',
        tipo: 'diario',
        paciente_id: paciente,
        inicio: '2026-11-19T00:00:00Z',
        fim: '2026-11-20T00:00:00Z',
        lacunas: [],
        identidades: [],
        proximo_cursor: null,
        itens: [
          {
            categoria: 'ocorrencia',
            id,
            versao: 1,
            instante: '2026-11-19T01:00:00Z',
            dados: {
              id,
              paciente_id: paciente,
              turno_id: turno,
              classe: 'ocorrencia',
              autor_usuario_id: usuario,
              versao: 1,
              instante_ocorrencia: '2026-11-19T01:00:00Z',
              registrado_em: '2026-11-19T01:00:00Z',
              dados: { ...cifrado.conteudo.dados, retificada: false },
              anexos: [{ anexo_id: id, mime_type: 'image/png', tamanho_bytes: 24 }],
            },
          },
        ],
      },
    }));
    const r = await operarExecucaoTurno(
      pedido(),
      {
        operacao: 'relatorio',
        paciente_id: paciente,
        entrada: {
          tipo: 'diario',
          inicio: '2026-11-19T00:00:00Z',
          fim: '2026-11-20T00:00:00Z',
          limite: 25,
        },
      },
      p,
    );
    expect(r).toMatchObject({
      ok: true,
      dados: { itens: [{ anexos: [{ anexo_id: id, mime_type: 'image/png', tamanho_bytes: 24 }] }] },
    });
    expect(JSON.stringify(r)).not.toContain('objeto_nome');
    expect(p.storage.obter).not.toHaveBeenCalled();
  });
});
