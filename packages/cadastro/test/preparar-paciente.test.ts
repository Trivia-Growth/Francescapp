/// <reference lib="dom" />

import { createHmac } from 'node:crypto';
import type { MetadadosAad } from '@ffcmapp/contratos';
import { describe, expect, it } from 'vitest';

import { criarCifraAutenticada } from '../../../supabase/functions/_shared/cifra-autenticada.js';
import { criarAtestadorOperacao } from '../../../supabase/functions/_shared/atestado-operacao.js';
import { prepararComandoCriarPaciente, prepararPacienteCifrado } from '../src/preparar-paciente.js';

const cifra = criarCifraAutenticada({
  keyIdAtiva: 'teste',
  chavesDeCifra: { teste: new Uint8Array(32).fill(1) },
  chaveHmac: new Uint8Array(32).fill(2),
});
const idempotencia = {
  async calcularDigestIdempotencia(comando: string) {
    return createHmac('sha256', Buffer.alloc(32, 4)).update(comando).digest('base64url');
  },
};
const reserva = { reserva_id: 'd0000000-0000-4000-8000-000000000001', geracao_reserva: 1 };
const responsavelId = 'e0000000-0000-4000-8000-000000000001';
/** Caso novo completo e fictício: todos os campos do contrato são obrigatórios. */
const casoNovo = {
  nome: 'Pessoa fictícia',
  nome_preferencia: 'Nome fictício',
  data_nascimento: '2000-01-01',
  contatos: [
    { tipo: 'email', valor: 'pessoa.ficticia@exemplo.test' },
    { tipo: 'telefone', valor: '+55 11 90000-0000' },
  ],
  situacao: 'entrada',
  responsavel_id: responsavelId,
};

describe('preparação interna de paciente', () => {
  it('usa o snapshot assinado mesmo que o objeto de entrada seja alterado após assinatura', async () => {
    const real = criarAtestadorOperacao({ keyId: 'atestado', chave: new Uint8Array(32).fill(3) });
    const atestador = {
      canonicalizar: real.canonicalizar,
      async atestarEntrada(dados: unknown, entrada: Record<string, unknown>) {
        const prova = await real.atestarEntrada(dados, entrada);
        entrada.paciente_id = '10000000-0000-4000-8000-000000000099';
        prova.atestado.usuario_id = '10000000-0000-4000-8000-000000000099';
        return prova;
      },
    };
    const resultado = await prepararComandoCriarPaciente(
      {
        corpo: casoNovo,
        reserva,
        cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
        contexto: {
          key_id: 'atestado',
          usuario_id: '10000000-0000-4000-8000-000000000001',
          session_id: '10000000-0000-4000-8000-000000000002',
          request_id: '10000000-0000-4000-8000-000000000003',
          emitido_em: '2026-10-29T12:00:00Z',
          expira_em: '2026-10-29T12:01:00Z',
        },
      },
      { cifra, atestador, idempotencia },
    );
    const snapshot = JSON.parse(resultado.p_entrada.entrada_canonica) as { paciente_id: string };
    expect(resultado.p_entrada.entrada.paciente_id).toBe(snapshot.paciente_id);
    expect(snapshot.paciente_id).not.toBe('10000000-0000-4000-8000-000000000099');
    expect(resultado.p_entrada.entrada.atestado.usuario_id).toBe(
      '10000000-0000-4000-8000-000000000001',
    );
  });
  it('atesta tentativa cifrada e mantém HMAC lógico entre tentativas equivalentes', async () => {
    const atestador = criarAtestadorOperacao({
      keyId: 'atestado',
      chave: new Uint8Array(32).fill(3),
    });
    const contexto = {
      key_id: 'atestado',
      usuario_id: 'a0000000-0000-4000-8000-000000000001',
      session_id: 'b0000000-0000-4000-8000-000000000002',
      request_id: 'c0000000-0000-4000-8000-000000000003',
      emitido_em: '2026-10-29T12:00:00Z',
      expira_em: '2026-10-29T12:01:00Z',
    };
    const input = {
      corpo: { ...casoNovo, nome: ' Pessoa fictícia ' },
      reserva,
      cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
      contexto,
    };
    const primeira = await prepararComandoCriarPaciente(input, { cifra, atestador, idempotencia });
    const segunda = await prepararComandoCriarPaciente(input, { cifra, atestador, idempotencia });
    const outraCaixa = await prepararComandoCriarPaciente(
      {
        ...input,
        contexto: {
          ...contexto,
          usuario_id: contexto.usuario_id.toUpperCase(),
          session_id: contexto.session_id.toUpperCase(),
          request_id: contexto.request_id.toUpperCase(),
        },
      },
      { cifra, atestador, idempotencia },
    );
    const outroConteudo = await prepararComandoCriarPaciente(
      { ...input, corpo: { ...casoNovo, nome: 'Outro nome fictício' } },
      { cifra, atestador, idempotencia },
    );
    const outroContato = await prepararComandoCriarPaciente(
      {
        ...input,
        corpo: {
          ...casoNovo,
          contatos: [casoNovo.contatos[0], { tipo: 'telefone', valor: '+55 11 90000-0001' }],
        },
      },
      { cifra, atestador, idempotencia },
    );
    const outraSituacao = await prepararComandoCriarPaciente(
      { ...input, corpo: { ...casoNovo, situacao: 'ativo' } },
      { cifra, atestador, idempotencia },
    );
    const outroResponsavel = await prepararComandoCriarPaciente(
      { ...input, corpo: { ...casoNovo, responsavel_id: 'e0000000-0000-4000-8000-000000000002' } },
      { cifra, atestador, idempotencia },
    );
    const outraReserva = await prepararComandoCriarPaciente(
      { ...input, reserva: { ...reserva, reserva_id: 'd0000000-0000-4000-8000-000000000002' } },
      { cifra, atestador, idempotencia },
    );
    const outroAtor = await prepararComandoCriarPaciente(
      { ...input, contexto: { ...contexto, usuario_id: '10000000-0000-4000-8000-000000000004' } },
      { cifra, atestador, idempotencia },
    );
    const serializada = JSON.stringify(primeira);
    for (const claro of [
      'Pessoa fictícia',
      'Nome fictício',
      '2000-01-01',
      'pessoa.ficticia@exemplo.test',
      '90000-0000',
    ])
      expect(serializada).not.toContain(claro);
    expect(primeira.p_entrada.entrada.situacao).toBe('entrada');
    expect(primeira.p_entrada.entrada.responsavel_id).toBe(responsavelId);
    expect(primeira.p_entrada.entrada.contatos.map((contato) => contato.tipo)).toEqual([
      'email',
      'telefone',
    ]);
    expect(primeira.p_entrada.entrada.reserva_id).toBe(reserva.reserva_id);
    expect(primeira.p_entrada.entrada.geracao_reserva).toBe(reserva.geracao_reserva);
    expect(JSON.parse(primeira.p_entrada.entrada_canonica)).toMatchObject(reserva);
    expect(primeira.p_entrada.entrada.digest_idempotencia).toBe(
      segunda.p_entrada.entrada.digest_idempotencia,
    );
    expect(primeira.p_entrada.entrada.digest_idempotencia).toBe(
      outraCaixa.p_entrada.entrada.digest_idempotencia,
    );
    expect(outraCaixa.p_entrada.entrada.atestado.session_id).toBe(contexto.session_id);
    expect(outraCaixa.p_entrada.entrada.request_id).toBe(contexto.request_id);
    expect(primeira.p_entrada.entrada.digest_idempotencia).not.toBe(
      outroConteudo.p_entrada.entrada.digest_idempotencia,
    );
    // O digest cobre o corpo inteiro: contato, situação e responsável diferentes não são o mesmo comando.
    for (const diferente of [outroContato, outraSituacao, outroResponsavel])
      expect(primeira.p_entrada.entrada.digest_idempotencia).not.toBe(
        diferente.p_entrada.entrada.digest_idempotencia,
      );
    expect(primeira.p_entrada.entrada.digest_idempotencia).not.toBe(
      outraReserva.p_entrada.entrada.digest_idempotencia,
    );
    expect(primeira.p_entrada.entrada.digest_idempotencia).not.toBe(
      outroAtor.p_entrada.entrada.digest_idempotencia,
    );
    expect(primeira.p_entrada.entrada.paciente_id).not.toBe(segunda.p_entrada.entrada.paciente_id);
    expect(primeira.p_entrada.entrada.atestado.digest_entrada).not.toBe(
      segunda.p_entrada.entrada.atestado.digest_entrada,
    );
    expect(JSON.parse(primeira.p_entrada.entrada_canonica)).toEqual(
      Object.fromEntries(
        Object.entries(primeira.p_entrada.entrada).filter(([k]) => k !== 'atestado'),
      ),
    );
  });
  it('cifra nome, preferência e nascimento com AAD do registro gerado', async () => {
    const resultado = await prepararPacienteCifrado(
      { ...casoNovo, nome: ' Pessoa fictícia ', nome_preferencia: ' Nome fictício ' },
      cifra,
    );
    expect(JSON.stringify(resultado)).not.toContain('Pessoa fictícia');
    const aad = {
      tabela: 'cadastro.paciente',
      registro_id: resultado.paciente_id,
      formato: 1,
    } as const;
    expect(resultado.aad).toEqual({
      nome: { ...aad, campo: 'nome' },
      nome_preferencia: { ...aad, campo: 'nome_preferencia' },
      data_nascimento: { ...aad, campo: 'data_nascimento' },
    });
    expect(resultado.situacao).toBe('entrada');
    expect(resultado.responsavel_id).toBe(responsavelId);
    await expect(cifra.decifrar(resultado.nome, { ...aad, campo: 'nome' })).resolves.toBe(
      'Pessoa fictícia',
    );
    await expect(
      cifra.decifrar(resultado.nome_preferencia, { ...aad, campo: 'nome_preferencia' }),
    ).resolves.toBe('Nome fictício');
    await expect(
      cifra.decifrar(resultado.data_nascimento, { ...aad, campo: 'data_nascimento' }),
    ).resolves.toBe('2000-01-01');
    await expect(
      cifra.decifrar(resultado.nome, { ...aad, campo: 'nome_preferencia' }),
    ).rejects.toThrow();
  });

  it('normaliza o responsável para minúsculas sem alterar situação nem demais campos', async () => {
    const resultado = await prepararPacienteCifrado(
      { ...casoNovo, responsavel_id: responsavelId.toUpperCase(), situacao: 'pausado' },
      cifra,
    );
    expect(resultado.responsavel_id).toBe(responsavelId);
    expect(resultado.situacao).toBe('pausado');
    expect(Object.isFrozen(resultado.aad)).toBe(true);
    expect(Object.isFrozen(resultado.aad.nome)).toBe(true);
    expect(Object.isFrozen(resultado.aad.nome_preferencia)).toBe(true);
    expect(Object.isFrozen(resultado.aad.data_nascimento)).toBe(true);
  });

  it('dá a cada contato id e AAD próprios e entrega à cifra o AAD de cada um', async () => {
    const chamadas: { valor: string; aad: MetadadosAad }[] = [];
    const cifraEspia = {
      async cifrar(valor: string, aad: MetadadosAad) {
        chamadas.push({ valor, aad });
        return cifra.cifrar(valor, aad);
      },
    };
    const resultado = await prepararPacienteCifrado(
      {
        ...casoNovo,
        contatos: [
          { tipo: 'email', valor: '  pessoa.ficticia@exemplo.test  ' },
          { tipo: 'telefone', valor: '+55 11 90000-0000' },
          { tipo: 'email', valor: 'segundo.ficticio@exemplo.test' },
        ],
      },
      cifraEspia,
    );
    expect(resultado.contatos).toHaveLength(3);
    const ids = resultado.contatos.map((contato) => contato.contato_id);
    expect(new Set([...ids, resultado.paciente_id]).size).toBe(4);
    expect(resultado.contatos.map((contato) => contato.tipo)).toEqual([
      'email',
      'telefone',
      'email',
    ]);
    const claros = [
      'pessoa.ficticia@exemplo.test',
      '+55 11 90000-0000',
      'segundo.ficticio@exemplo.test',
    ];
    for (const [indice, contato] of resultado.contatos.entries()) {
      expect(contato.aad).toEqual({
        tabela: 'cadastro.contato_paciente',
        registro_id: contato.contato_id,
        campo: 'valor',
        formato: 1,
      });
      expect(Object.isFrozen(contato.aad)).toBe(true);
      // A cifra recebeu o valor com trim junto do AAD exato deste contato.
      expect(chamadas).toContainEqual({ valor: claros[indice], aad: contato.aad });
      await expect(cifra.decifrar(contato.valor, contato.aad)).resolves.toBe(claros[indice]);
      // Um AAD de outro contato do mesmo caso não decifra este valor.
      const outro = resultado.contatos[(indice + 1) % 3];
      if (!outro) throw new Error('Contato ausente.');
      await expect(cifra.decifrar(contato.valor, outro.aad)).rejects.toThrow();
    }
    expect(chamadas).toHaveLength(3 + 3);
  });

  it('rejeita o payload antigo somente com nome e qualquer campo obrigatório ausente', async () => {
    const falha = 'Não foi possível preparar o cadastro.';
    await expect(prepararPacienteCifrado({ nome: 'Pessoa fictícia' }, cifra)).rejects.toThrow(
      falha,
    );
    for (const campo of Object.keys(casoNovo)) {
      const semCampo = Object.fromEntries(Object.entries(casoNovo).filter(([k]) => k !== campo));
      await expect(prepararPacienteCifrado(semCampo, cifra), `sem ${campo}`).rejects.toThrow(falha);
    }
    await expect(prepararPacienteCifrado({ ...casoNovo, contatos: [] }, cifra)).rejects.toThrow(
      falha,
    );
  });

  it('mantém o digest quando só a caixa do UUID do responsável muda', async () => {
    const atestador = criarAtestadorOperacao({
      keyId: 'atestado',
      chave: new Uint8Array(32).fill(3),
    });
    const base = {
      reserva,
      cabecalhos: { 'x-chave-idempotencia': 'chave-ficticia-123456' },
      contexto: {
        key_id: 'atestado',
        usuario_id: 'a0000000-0000-4000-8000-000000000001',
        session_id: 'b0000000-0000-4000-8000-000000000002',
        request_id: 'c0000000-0000-4000-8000-000000000003',
        emitido_em: '2026-10-29T12:00:00Z',
        expira_em: '2026-10-29T12:01:00Z',
      },
    };
    const responsavel = 'abcdef00-0000-4000-8000-0000000000ab';
    const minuscula = await prepararComandoCriarPaciente(
      { ...base, corpo: { ...casoNovo, responsavel_id: responsavel } },
      { cifra, atestador, idempotencia },
    );
    const maiuscula = await prepararComandoCriarPaciente(
      { ...base, corpo: { ...casoNovo, responsavel_id: responsavel.toUpperCase() } },
      { cifra, atestador, idempotencia },
    );
    expect(maiuscula.p_entrada.entrada.digest_idempotencia).toBe(
      minuscula.p_entrada.entrada.digest_idempotencia,
    );
  });

  it('rejeita entrada inválida e não expõe detalhes de falha da cifra', async () => {
    await expect(prepararPacienteCifrado({ ...casoNovo, nome: ' ' }, cifra)).rejects.toThrow(
      'Não foi possível preparar o cadastro.',
    );
    const cifraIndisponivel = {
      async cifrar() {
        throw new Error('Paciente fictício e segredo fictício');
      },
    };
    await expect(prepararPacienteCifrado(casoNovo, cifraIndisponivel)).rejects.toThrow(
      'Não foi possível preparar o cadastro.',
    );
    // Falha ao cifrar só o contato também aborta o preparo, sem expor o valor.
    let chamadas = 0;
    const cifraFalhaNoContato = {
      async cifrar(valor: string, aad: MetadadosAad) {
        chamadas += 1;
        if (aad.tabela === 'cadastro.contato_paciente') throw new Error(valor);
        return cifra.cifrar(valor, aad);
      },
    };
    await expect(prepararPacienteCifrado(casoNovo, cifraFalhaNoContato)).rejects.toThrow(
      'Não foi possível preparar o cadastro.',
    );
    expect(chamadas).toBeGreaterThan(0);
  });
});
