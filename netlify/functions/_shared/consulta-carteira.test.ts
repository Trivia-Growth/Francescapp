import { expect, it } from 'vitest';
import { lerConsultaCarteira } from './consulta-carteira.ts';

const url = (query: string) => new URL(`https://exemplo.test/api/pacientes${query}`);

it('aceita os quatro filtros de FR-026 e os entrega com o nome do contrato', () => {
  expect(
    lerConsultaCarteira(
      url(
        '?limite=25&filtro_responsavel=10000000-0000-4000-8000-000000000002' +
          '&filtro_situacao=a_completar&filtro_revisao=vencida&filtro_pendencia=abertas',
      ),
    ),
  ).toEqual({
    limite: 25,
    filtros: {
      responsavel: '10000000-0000-4000-8000-000000000002',
      situacao: 'a_completar',
      revisao: 'vencida',
      pendencia: 'abertas',
    },
  });
});

it('consulta sem filtro não inventa o campo', () => {
  expect(lerConsultaCarteira(url('?limite=10'))).toEqual({ limite: 10 });
});

it('filtro desconhecido é recusado, não ignorado', () => {
  expect(lerConsultaCarteira(url('?limite=10&filtro_qualquer=x'))).toBeNull();
  expect(lerConsultaCarteira(url('?limite=10&ordem=nome'))).toBeNull();
});

it('valor fora da lista é recusado', () => {
  expect(lerConsultaCarteira(url('?limite=10&filtro_revisao=amanha'))).toBeNull();
  expect(lerConsultaCarteira(url('?limite=10&filtro_situacao=inventada'))).toBeNull();
  expect(lerConsultaCarteira(url('?limite=10&filtro_responsavel=nao-e-uuid'))).toBeNull();
});

it('parâmetro repetido é recusado: o pedido assinado não pode ser ambíguo', () => {
  expect(
    lerConsultaCarteira(url('?limite=10&filtro_revisao=vencida&filtro_revisao=proxima')),
  ).toBeNull();
  expect(lerConsultaCarteira(url('?limite=10&limite=20'))).toBeNull();
});

it('o literal "nenhum" vale para responsável, porque caso sem responsável também é recorte', () => {
  expect(lerConsultaCarteira(url('?limite=10&filtro_responsavel=nenhum'))).toEqual({
    limite: 10,
    filtros: { responsavel: 'nenhum' },
  });
});
