import { expect, it, vi } from 'vitest';
import { operarTurnoGrupo3, type PortasGrupo3 } from './turno-grupo3-nativo.ts';
const id = '11111111-1111-4111-8111-111111111111';
const outro = '22222222-2222-4222-8222-222222222222';
const instante = '2026-11-18T12:00:00Z';
const conteudo = {
  data: '2026-11-18',
  area: 'Passagem fictícia',
  atividade: 'Síntese fictícia reservada',
};
function preparar() {
  const textos = new Map<string, string>();
  const autorizado = async () => ({
    estado: 'autorizado' as const,
    identidade: { usuario_id: id, session_id: id },
  });
  const portas: PortasGrupo3 = {
    autorizar: autorizado,
    revalidar: autorizado,
    metadados: (request_id) => ({
      request_id,
      key_id: 'teste',
      emitido_em: instante,
      expira_em: '2026-11-18T12:00:30Z',
    }),
    cifra: {
      cifrar: vi.fn(async (texto) => {
        const ciphertext = `Y2lmcmE${textos.size}`;
        textos.set(ciphertext, texto);
        return { formato: 1 as const, key_id: 'teste', nonce: 'bm9uY2U', ciphertext, tag: 'dGFn' };
      }),
      decifrar: vi.fn(async (campo) => {
        const texto = textos.get(campo.ciphertext);
        if (!texto) throw new Error();
        return texto;
      }),
    },
    idempotencia: { calcularDigestIdempotencia: vi.fn(async () => 'a'.repeat(43)) },
    atestador: {
      canonicalizar: JSON.stringify,
      atestarEntrada: async (metadados, entrada) => {
        const dados = { ...(metadados as Record<string, unknown>), digest_entrada: 'digest' };
        return {
          atestado: { ...dados, mac: 'mac' },
          entradaCanonica: JSON.stringify(entrada),
          dadosCanonicos: JSON.stringify(dados),
        };
      },
    },
    executar: vi.fn(async (_pedido, tr) => ({
      ok: false,
      erro: { codigo: 'sem_permissao' },
      request_id: tr.p_transporte.entrada.request_id,
    })),
  };
  return portas;
}
const pedido = () =>
  new Request('https://example.test', {
    headers: { 'x-sessao': id, 'x-chave-idempotencia': 'chave-ficticia-123456789' },
  });
it('prepara publicação cifrada do Diário e executa somente RPC agregada', async () => {
  const portas = preparar();
  portas.executar = vi.fn(async (_pedido, tr) => {
    const filha = tr.p_transporte.entrada.diario as { entrada: Record<string, unknown> };
    return {
      ok: true,
      repeticao: false,
      request_id: tr.p_transporte.entrada.request_id,
      dados: {
        registro_id: filha.entrada.registro_id,
        diario_registro_id: filha.entrada.diario_registro_id,
        turno_aberto_em: instante,
        turno_encerrado_em: null,
        turno_id: outro,
        autor_usuario_id: id,
        publicado_em: instante,
        conteudo: filha.entrada.conteudo,
        versao: 1,
        versao_passagem: 1,
      },
    };
  });
  const resultado = await operarTurnoGrupo3(
    pedido(),
    {
      operacao: 'publicar',
      paciente_id: id,
      turno_id: outro,
      entrada: { conteudo, versao_esperada: 0 },
    },
    portas,
  );
  expect(resultado).toMatchObject({ ok: true, dados: { conteudo } });
  expect(portas.executar).toHaveBeenCalledOnce();
  const tr = vi.mocked(portas.executar).mock.calls[0]?.[1];
  expect(JSON.stringify(tr)).not.toContain(conteudo.atividade);
  const filha = tr?.p_transporte.entrada.diario as { entrada: Record<string, unknown> };
  expect(tr?.p_transporte.entrada.versao_esperada).toBe(0);
  expect(filha.entrada.versao_esperada).toBe(0);
  expect(filha.entrada).toMatchObject({
    tipo: 'evolucao_profissional',
    estado: 'publicado',
    audiencia: 'equipe',
    atencao: false,
    retorno_solicitado: false,
    area: conteudo.area,
  });
});
it('liga motivo cifrado ao caso, escala e nova versão', async () => {
  const portas = preparar();
  await operarTurnoGrupo3(
    pedido(),
    {
      operacao: 'alterarEscala',
      paciente_id: id,
      escala_id: outro,
      entrada: {
        tipo: 'substituicao',
        profissional_assumiu_usuario_id: id,
        motivo: 'Motivo fictício reservado',
        versao_esperada: 2,
      },
    },
    portas,
  );
  expect(portas.cifra.cifrar).toHaveBeenCalledWith('Motivo fictício reservado', {
    tabela: 'cadastro.turno_escala_versao',
    paciente_id: id,
    escala_id: outro,
    versao: 3,
    campo: 'motivo',
    formato: 1,
  });
  expect(JSON.stringify(vi.mocked(portas.executar).mock.calls[0]?.[1])).not.toContain(
    'Motivo fictício reservado',
  );
});
it('nega publicação sem síntese e revogação antes da RPC', async () => {
  const portas = preparar();
  expect(
    await operarTurnoGrupo3(
      pedido(),
      {
        operacao: 'publicar',
        paciente_id: id,
        turno_id: outro,
        entrada: {
          versao_esperada: 0,
          conteudo: { data: '2026-11-18', area: 'Passagem fictícia' },
        },
      },
      portas,
    ),
  ).toMatchObject({ ok: false, erro: { codigo: 'entrada_invalida' } });
  portas.revalidar = async () => ({ estado: 'sem_permissao' });
  expect(
    await operarTurnoGrupo3(
      pedido(),
      { operacao: 'ciencia', paciente_id: id, turno_id: outro, entrada: {} },
      portas,
    ),
  ).toMatchObject({ ok: false });
  expect(portas.executar).not.toHaveBeenCalled();
});
it('consulta não publica nem registra ciência e escrita perdida permanece pendente', async () => {
  const portas = preparar();
  portas.executar = vi.fn(async (_pedido, tr) => ({
    ok: true,
    repeticao: false,
    request_id: tr.p_transporte.entrada.request_id,
    dados: {
      identidades: [],
      propria: null,
      anterior: null,
      recebimento: null,
      area_passagem: null,
    },
  }));
  expect(
    await operarTurnoGrupo3(
      pedido(),
      { operacao: 'passagem', paciente_id: id, turno_id: outro, entrada: {} },
      portas,
    ),
  ).toMatchObject({ ok: true });
  expect(portas.cifra.cifrar).not.toHaveBeenCalled();
  expect(vi.mocked(portas.executar).mock.calls[0]?.[1].p_transporte.entrada.atestado).toMatchObject(
    { operacao: 'api.consultar_passagem_turno' },
  );
  portas.executar = vi.fn(async () => {
    throw new Error('Resposta perdida');
  });
  expect(
    await operarTurnoGrupo3(
      pedido(),
      { operacao: 'ciencia', paciente_id: id, turno_id: outro, entrada: {} },
      portas,
    ),
  ).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
});

it('não confirma criação quando o recibo pertence a outro ator', async () => {
  const portas = preparar();
  portas.executar = vi.fn(async (_pedido, tr) => ({
    ok: true,
    repeticao: false,
    request_id: tr.p_transporte.entrada.request_id,
    dados: {
      escala_id: outro,
      paciente_id: id,
      versao: 1,
      profissional_previsto_usuario_id: id,
      profissional_assumiu_usuario_id: null,
      inicio_previsto: instante,
      fim_previsto: '2026-11-18T18:00:00Z',
      tipo: 'previsto',
      motivo: null,
      autor_usuario_id: outro,
      registrado_em: instante,
    },
  }));
  expect(
    await operarTurnoGrupo3(
      pedido(),
      {
        operacao: 'criarEscala',
        paciente_id: id,
        entrada: {
          escala_id: outro,
          profissional_previsto_usuario_id: id,
          inicio_previsto: instante,
          fim_previsto: '2026-11-18T18:00:00Z',
        },
      },
      portas,
    ),
  ).toMatchObject({ ok: false, erro: { codigo: 'pendencia_externa' } });
});

it('republica explicitamente com versão do vínculo e nova evolução, sem retificar anterior', async () => {
  const portas = preparar();
  const filhos: { entrada: Record<string, unknown> }[] = [];
  portas.executar = vi.fn(async (_pedido, tr) => {
    const filha = tr.p_transporte.entrada.diario as { entrada: Record<string, unknown> };
    filhos.push(filha);
    return {
      ok: true,
      repeticao: false,
      request_id: tr.p_transporte.entrada.request_id,
      dados: {
        registro_id: filha.entrada.registro_id,
        diario_registro_id: filha.entrada.diario_registro_id,
        turno_aberto_em: instante,
        turno_encerrado_em: null,
        turno_id: outro,
        autor_usuario_id: id,
        publicado_em: instante,
        conteudo: filha.entrada.conteudo,
        versao: 1,
        versao_passagem: Number(tr.p_transporte.entrada.versao_esperada) + 1,
      },
    };
  });
  for (const versao_esperada of [0, 1]) {
    const request = pedido();
    request.headers.set('x-chave-idempotencia', crypto.randomUUID());
    expect(
      await operarTurnoGrupo3(
        request,
        {
          operacao: 'publicar',
          paciente_id: id,
          turno_id: outro,
          entrada: { conteudo, versao_esperada },
        },
        portas,
      ),
    ).toMatchObject({ ok: true, dados: { versao_passagem: versao_esperada + 1 } });
  }
  expect(filhos).toHaveLength(2);
  expect(filhos[0]?.entrada.diario_registro_id).not.toBe(filhos[1]?.entrada.diario_registro_id);
  expect(filhos.map((filha) => filha.entrada.versao_esperada)).toEqual([0, 0]);
  expect(filhos[1]?.entrada).not.toHaveProperty('justificativa');
});

it('decifra identificação autorizada com AAD original sem expor envelope ou ampliar catálogo', async () => {
  const portas = preparar();
  const email = await portas.cifra.cifrar('Autor histórico fictício', {
    tabela: 'identidade.concessao_equipe',
    registro_id: outro,
    campo: 'email',
    formato: 1,
  });
  portas.executar = vi.fn(async (_pedido, tr) => ({
    ok: true,
    repeticao: false,
    request_id: tr.p_transporte.entrada.request_id,
    dados: {
      identidades: [
        { usuario_id: id, concessao_id: outro, email },
        { usuario_id: outro, concessao_id: null, email: null },
      ],
      proximo_cursor: null,
      pode_gerir: false,
      profissionais: [],
      itens: [
        {
          escala_id: id,
          paciente_id: id,
          versao: 1,
          profissional_previsto_usuario_id: outro,
          profissional_assumiu_usuario_id: null,
          inicio_previsto: instante,
          fim_previsto: '2026-11-18T18:00:00Z',
          tipo: 'previsto',
          motivo: null,
          autor_usuario_id: id,
          registrado_em: instante,
        },
      ],
    },
  }));
  const resultado = await operarTurnoGrupo3(
    pedido(),
    {
      operacao: 'escala',
      paciente_id: id,
      entrada: { cursor_escala_id: outro, cursor_versao: 50 },
    },
    portas,
  );
  expect(resultado).toMatchObject({
    ok: true,
    dados: {
      identidades: [
        { usuario_id: id, rotulo: 'Autor histórico fictício' },
        { usuario_id: outro, rotulo: null },
      ],
      profissionais: [],
    },
  });
  expect(portas.cifra.decifrar).toHaveBeenCalledWith(email, {
    tabela: 'identidade.concessao_equipe',
    registro_id: outro,
    campo: 'email',
    formato: 1,
  });
  expect(vi.mocked(portas.executar).mock.calls[0]?.[1].p_transporte.entrada).toMatchObject({
    cursor_escala_id: outro,
    cursor_versao: 50,
  });
  expect(JSON.stringify(resultado)).not.toContain('ciphertext');
});

it.each(['extra', 'duplicada', 'inconsistente', 'outro_caso'])(
  'recusa identidade %s antes de qualquer decifra',
  async (falha) => {
    const portas = preparar();
    const email = await portas.cifra.cifrar('Identidade fictícia', {
      tabela: 'identidade.concessao_equipe',
      registro_id: id,
      campo: 'email',
      formato: 1,
    });
    const identidade = { usuario_id: id, concessao_id: id, email };
    const identidades =
      falha === 'outro_caso'
        ? [identidade]
        : falha === 'extra'
          ? [identidade, { ...identidade, usuario_id: outro }]
          : falha === 'duplicada'
            ? [identidade, identidade]
            : [{ ...identidade, email: null }];
    portas.executar = vi.fn(async (_pedido, tr) => ({
      ok: true,
      repeticao: false,
      request_id: tr.p_transporte.entrada.request_id,
      dados: {
        identidades,
        proximo_cursor: null,
        pode_gerir: false,
        profissionais: [],
        itens: [
          {
            escala_id: id,
            paciente_id: falha === 'outro_caso' ? outro : id,
            versao: 1,
            profissional_previsto_usuario_id: id,
            profissional_assumiu_usuario_id: null,
            inicio_previsto: instante,
            fim_previsto: '2026-11-18T18:00:00Z',
            tipo: 'previsto',
            motivo: email,
            autor_usuario_id: id,
            registrado_em: instante,
          },
        ],
      },
    }));
    expect(
      await operarTurnoGrupo3(
        pedido(),
        { operacao: 'escala', paciente_id: id, entrada: {} },
        portas,
      ),
    ).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
    expect(portas.cifra.decifrar).not.toHaveBeenCalled();
  },
);

it('passagem recusa rótulo extra antes de decifrar síntese ou identificação', async () => {
  const portas = preparar();
  const campo = await portas.cifra.cifrar('Fictício', {
    tabela: 'identidade.concessao_equipe',
    registro_id: id,
    campo: 'email',
    formato: 1,
  });
  portas.executar = vi.fn(async (_pedido, tr) => ({
    ok: true,
    repeticao: false,
    request_id: tr.p_transporte.entrada.request_id,
    dados: {
      propria: {
        turno_aberto_em: instante,
        turno_encerrado_em: null,
        versao_passagem: 1,
        registro_id: id,
        diario_registro_id: id,
        turno_id: outro,
        autor_usuario_id: id,
        publicado_em: instante,
        conteudo: campo,
        versao: 1,
      },
      anterior: null,
      recebimento: null,
      area_passagem: 'Área fictícia',
      identidades: [
        { usuario_id: id, concessao_id: id, email: campo },
        { usuario_id: outro, concessao_id: outro, email: campo },
      ],
    },
  }));
  expect(
    await operarTurnoGrupo3(
      pedido(),
      { operacao: 'passagem', paciente_id: id, turno_id: outro, entrada: {} },
      portas,
    ),
  ).toMatchObject({ ok: false, erro: { codigo: 'servico_indisponivel' } });
  expect(portas.cifra.decifrar).not.toHaveBeenCalled();
});
