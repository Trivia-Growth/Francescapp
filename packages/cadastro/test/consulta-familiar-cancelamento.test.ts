import { expect, it, vi } from 'vitest';
import { consultarCarteiraFamiliar } from '../../../netlify/functions/_shared/carteira-familiar-handler.ts';
import { consultarPacienteFamiliar } from '../../../netlify/functions/_shared/paciente-familiar-handler.ts';

const usuario_id = '61000000-0000-4000-8000-000000000001';
const session_id = '63000000-0000-4000-8000-000000000001';
const paciente = '66000000-0000-4000-8000-000000000001';
const autorizado = async () => ({
  estado: 'autorizado' as const,
  identidade: { usuario_id, session_id },
});

it.each(['carteira', 'paciente'])(
  'não processa dados após cancelamento durante consulta de %s',
  async (tipo) => {
    const controle = new AbortController();
    const decifrar = vi.fn();
    const consultar = vi.fn(async () => {
      controle.abort();
      return { ok: true, dados: { itens: [] } };
    });
    const caminho = tipo === 'carteira' ? '' : `/${paciente}`;
    const request = new Request(`https://exemplo.test/api/familiar/pacientes${caminho}`, {
      headers: { 'x-sessao': session_id },
      signal: controle.signal,
    });
    const resposta =
      tipo === 'carteira'
        ? await consultarCarteiraFamiliar(request, {
            autorizar: autorizado,
            consultar,
            cifra: { decifrar },
            cursor: { abrir: vi.fn(), emitir: vi.fn() },
          })
        : await consultarPacienteFamiliar(request, {
            autorizar: autorizado,
            consultar,
            cifra: { decifrar },
          });
    expect(resposta.status).toBe(401);
    expect(consultar).toHaveBeenCalledOnce();
    expect(decifrar).not.toHaveBeenCalled();
    expect(JSON.stringify(await resposta.json())).not.toContain('dados');
  },
);
