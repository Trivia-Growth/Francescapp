import { expect, it } from 'vitest';
import { derivarChavesAgendaGoogle } from './chaves-agenda-google.ts';
it('separa finalidades e preserva derivação determinística sem chave adicional', async () => {
  const base = new Uint8Array(32).fill(42);
  const a = await derivarChavesAgendaGoogle(base);
  const b = await derivarChavesAgendaGoogle(base);
  expect(a).toEqual(b);
  expect(a.state).not.toEqual(base);
  expect(a.state).not.toEqual(a.cookie);
  expect(a.desconexao).not.toEqual(a.cookie);
  expect(a.desconexao).not.toEqual(a.state);
});
