import { describe, expect, it } from 'vitest';
import { contratosBarreiraHttp as rotas } from '../src/barreira-http.ts';

const id = '31a7e0e6-8b2f-4c85-8baf-9422b39a4175';

describe('contratos HTTP da barreira de cadastro', () => {
  it('define consulta e comandos sem identidade ou dados pessoais no corpo', () => {
    expect(rotas.consultar.metodo).toBe('GET');
    expect(rotas.consultar.caminho).toBe('/api/cadastro/barreira');
    expect(rotas.consultar.entrada.safeParse({ usuario_id: id }).success).toBe(false);
    for (const rota of [rotas.reservar, rotas.encerrar, rotas.reconhecer]) {
      expect(rota.metodo).toBe('POST');
      expect(rota.cabecalhos.safeParse({ 'x-sessao': id }).success).toBe(false);
      expect(
        rota.cabecalhos.safeParse({ 'x-sessao': id, origin: 'https://app.example.test' }).success,
      ).toBe(true);
    }
    expect(
      rotas.reservar.entrada.safeParse({ epoca: 1, reserva_id: id, nome: 'Pessoa fictícia' })
        .success,
    ).toBe(false);
    expect(rotas.reservar.entrada.safeParse({ epoca: 0, reserva_id: id }).success).toBe(false);
    expect(
      rotas.encerrar.entrada.safeParse({ epoca: 1, reserva_id: null, comando_id: id }).success,
    ).toBe(true);
    expect(rotas.reconhecer.entrada.safeParse({ comando_id: 'pessoa@example.test' }).success).toBe(
      false,
    );
  });

  it('distingue resultados de cada operação e rejeita falha como sucesso', () => {
    for (const estado of [
      'aberta',
      'confirmada',
      'cancelada',
      'negada',
      'id_reutilizado',
      'epoca_antiga',
      'bloqueada',
    ]) {
      expect(rotas.reservar.saida.safeParse({ dados: { estado }, request_id: id }).success).toBe(
        true,
      );
    }
    expect(
      rotas.encerrar.saida.safeParse({ dados: { estado: 'vazia' }, request_id: id }).success,
    ).toBe(true);
    expect(
      rotas.reconhecer.saida.safeParse({ dados: { estado: 'vazia' }, request_id: id }).success,
    ).toBe(false);
    expect(
      rotas.consultar.saida.safeParse({
        dados: { epoca: 1, reserva: null, resultado_pendente: null },
        request_id: id,
      }).success,
    ).toBe(true);
    expect(
      rotas.consultar.saida.safeParse({ erro: { codigo: 'servico_indisponivel' }, request_id: id })
        .success,
    ).toBe(false);
    expect(
      rotas.consultar.saida.safeParse({
        dados: { epoca: 1, reserva: null, resultado_pendente: null, nome: 'Pessoa fictícia' },
        request_id: id,
      }).success,
    ).toBe(false);
  });
});
