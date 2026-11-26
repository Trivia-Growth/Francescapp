// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const idA = '10000000-0000-4000-8000-00000000000a';
const sessionId = '20000000-0000-4000-8000-000000000001';
const usuarioId = '30000000-0000-4000-8000-000000000001';
const envelope = (dados: unknown) => Response.json({ dados, request_id: idA });

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});

/** A volta à aba deve revalidar o vínculo antes de expor o rascunho. */
it('preserva rascunho familiar após validar vínculo e descarta após revogação', async () => {
  document.documentElement.innerHTML = readFileSync('web/index.html', 'utf8');
  sessionStorage.setItem('modo-acesso', 'familiar');
  sessionStorage.setItem('fluxo-familiar', 'AAAAAAAAAAAAAAAAAAAAAA');
  sessionStorage.setItem('sessao-familiar', sessionId);
  let consultasPaciente = 0;
  let resolverConsulta: ((resposta: Response) => void) | undefined;
  let bloquear = false;
  let revogado = false;
  let consultasDiario = 0;
  vi.stubGlobal('fetch', async (entrada: URL | string) => {
    const url = typeof entrada === 'string' ? new URL(entrada, window.location.origin) : entrada;
    if (url.pathname === '/api/familiar/sessao')
      return envelope({
        session_id: sessionId,
        usuario: { id: usuarioId, perfil: 'familia', ativo: true, versao: 1 },
        capacidades: [],
      });
    if (url.pathname === '/api/familiar/pacientes')
      return envelope({
        itens: [{ id: idA, nome: 'Paciente Vinculado', nome_preferencia: null, versao: 1 }],
        proximo_cursor: null,
      });
    if (url.pathname === `/api/familiar/pacientes/${idA}`) {
      consultasPaciente += 1;
      if (revogado)
        return Response.json(
          {
            erro: { codigo: 'sem_permissao', mensagem: 'Operação não permitida.' },
            request_id: idA,
          },
          { status: 403 },
        );
      if (bloquear)
        return new Promise<Response>((resolve) => {
          resolverConsulta = resolve;
        });
      return envelope({ id: idA, nome: 'Paciente Vinculado', nome_preferencia: null, versao: 1 });
    }
    if (url.pathname === `/api/pacientes/${idA}/diario`) {
      consultasDiario += 1;
      return envelope([]);
    }
    throw new Error(`Rota inesperada: ${url.pathname}`);
  });
  window.history.replaceState(null, '', `/#paciente/${idA}/diario`);
  await import('./main.js');
  await vi.waitFor(() => expect(consultasDiario).toBe(1));
  await vi.waitFor(() => expect(document.querySelector('textarea')).not.toBeNull());
  await new Promise((resolve) => setTimeout(resolve, 0));
  const texto = document.querySelector('textarea') as HTMLTextAreaElement;
  texto.value = 'Rascunho familiar fictício';
  texto.dispatchEvent(new Event('input', { bubbles: true }));
  bloquear = true;
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(resolverConsulta).toBeDefined());
  expect(document.getElementById('patients-view')?.hidden).toBe(true);
  resolverConsulta?.(
    envelope({ id: idA, nome: 'Paciente Vinculado', nome_preferencia: null, versao: 1 }),
  );
  await vi.waitFor(() => expect(document.getElementById('patients-view')?.hidden).toBe(false));
  expect(document.querySelector('textarea')).toBe(texto);
  expect(texto.value).toBe('Rascunho familiar fictício');
  expect(consultasPaciente).toBe(1);
  await vi.waitFor(() => expect(consultasDiario).toBe(2));

  bloquear = false;
  revogado = true;
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(document.querySelector('textarea')).toBeNull());
  expect(document.getElementById('patients-view')?.hidden).toBe(true);
  Reflect.deleteProperty(document, 'hidden');
  Reflect.deleteProperty(document, 'visibilityState');
});
