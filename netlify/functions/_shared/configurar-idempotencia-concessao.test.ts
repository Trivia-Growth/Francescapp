import { describe, expect, it } from 'vitest';
import { configurarIdempotenciaConcessao } from './configurar-idempotencia-concessao.ts';

describe('configuração de idempotência de concessão', () => {
  it('carrega ativa e anterior para rotação', () => {
    const configuracao = configurarIdempotenciaConcessao({
      FFCM_VAULT_IDEMPOTENCIA_EQUIPE_ATIVA: 'v2',
      FFCM_VAULT_IDEMPOTENCIA_EQUIPE_REFERENCIAS:
        'v1=ffcmapp.cifra.idem-v1,v2=ffcmapp.cifra.idem-v2',
    });
    expect(configuracao.ativa).toBe('v2');
    expect(Object.keys(configuracao.referencias)).toEqual(['v1', 'v2']);
  });
  it.each([
    {},
    {
      FFCM_VAULT_IDEMPOTENCIA_EQUIPE_ATIVA: 'v2',
      FFCM_VAULT_IDEMPOTENCIA_EQUIPE_REFERENCIAS: 'v1=ffcmapp.cifra.idem-v1',
    },
    {
      FFCM_VAULT_IDEMPOTENCIA_EQUIPE_ATIVA: 'v1',
      FFCM_VAULT_IDEMPOTENCIA_EQUIPE_REFERENCIAS: 'v1=ffcmapp.cifra.idem,v2=ffcmapp.cifra.idem',
    },
  ])('rejeita configuração incompleta ou repetida', (fonte) => {
    expect(() => configurarIdempotenciaConcessao(fonte)).toThrow();
  });
});
