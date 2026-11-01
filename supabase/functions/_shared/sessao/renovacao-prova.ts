import { campoCifradoSchema } from '../../../../packages/contracts/src/index.ts';
import type { CampoCifrado } from '../cifra-autenticada.ts';
import { criarRenovadorAuth } from './auth-renovacao.ts';
import type { criarCifraRefresh } from './cifra-refresh.ts';
import { criarProvaGeracao, hashProvaGeracao } from './prova-geracao.ts';

type Contexto = Readonly<{
  usuarioId: string;
  sessionId: string;
  geracao: number;
  tentativaId: string;
  provaAtualHash: string;
}>;
type Transicao = Contexto & Readonly<{ envelope: CampoCifrado; proximaProvaHash: string }>;
type Inicio = Contexto & Readonly<{ envelope: CampoCifrado }>;

/** Porta experimental. Hashes são credenciais sensíveis, nunca logar nem expor.
 * Confirmações devem consultar o primário em transações independentes, esperar
 * transações em trânsito e verificar tentativa, envelope e autoridade vigente.
 * Iniciar bloqueia reutilização da geração em caso de falha. Persistir deixa a
 * geração indisponível; liberar exige mesma tentativa/envelope/hash e autoridade
 * vigente. Confirmar só é verdadeiro para a transição já liberada.
 * Ainda não existe implementação SQL revisada desta porta. */
export type PersistenciaRenovacaoComProva = Readonly<{
  iniciar: (entrada: Contexto) => Promise<{ envelope: CampoCifrado } | null>;
  confirmarInicio: (entrada: Inicio) => Promise<boolean>;
  persistir: (entrada: Transicao) => Promise<boolean>;
  confirmarPersistencia: (entrada: Transicao) => Promise<boolean>;
  liberar: (entrada: Transicao) => Promise<boolean>;
  confirmar: (entrada: Transicao) => Promise<boolean>;
}>;

/** Módulo server-only experimental, ainda não conectado a rota ou banco. */
export function criarRenovacaoComProva(
  dependencias: Readonly<{
    auth: Parameters<typeof criarRenovadorAuth>[0];
    cifra: ReturnType<typeof criarCifraRefresh>;
    persistencia: PersistenciaRenovacaoComProva;
  }>,
) {
  const auth = criarRenovadorAuth(dependencias.auth);
  const cifrar = dependencias.cifra.cifrar.bind(dependencias.cifra);
  const decifrar = dependencias.cifra.decifrar.bind(dependencias.cifra);
  const persistencia = dependencias.persistencia;
  const iniciar = persistencia.iniciar.bind(persistencia);
  const confirmarInicio = persistencia.confirmarInicio.bind(persistencia);
  const persistir = persistencia.persistir.bind(persistencia);
  const confirmarPersistencia = persistencia.confirmarPersistencia.bind(persistencia);
  const liberar = persistencia.liberar.bind(persistencia);
  const confirmar = persistencia.confirmar.bind(persistencia);
  return async (
    entrada: Readonly<{ usuarioId: string; sessionId: string; geracao: number; prova: string }>,
  ) => {
    try {
      const { usuarioId, sessionId, geracao, prova } = entrada;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (
        typeof usuarioId !== 'string' ||
        !uuid.test(usuarioId) ||
        typeof sessionId !== 'string' ||
        !uuid.test(sessionId) ||
        !Number.isSafeInteger(geracao) ||
        geracao < 1 ||
        geracao >= Number.MAX_SAFE_INTEGER ||
        typeof prova !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(prova)
      )
        throw new Error();
      const contexto: Contexto = Object.freeze({
        usuarioId,
        sessionId,
        geracao,
        tentativaId: crypto.randomUUID(),
        provaAtualHash: await hashProvaGeracao(prova),
      });
      const estado = await iniciar(contexto);
      if (!estado) throw new Error();
      const envelopeAnterior = Object.freeze(campoCifradoSchema.parse(estado.envelope));
      if (
        (await confirmarInicio(Object.freeze({ ...contexto, envelope: envelopeAnterior }))) !== true
      )
        throw new Error();
      const refresh = await decifrar(envelopeAnterior, { usuario: usuarioId, sessao: sessionId });
      const novo = await auth(refresh, { usuarioId, sessionId });
      const proxima = await criarProvaGeracao();
      const envelope = Object.freeze(
        campoCifradoSchema.parse(
          await cifrar(novo.refreshToken, { usuario: usuarioId, sessao: sessionId }),
        ),
      );
      const transicao: Transicao = Object.freeze({
        ...contexto,
        envelope,
        proximaProvaHash: proxima.provaHash,
      });
      let aceita = false;
      try {
        aceita = (await persistir(transicao)) === true;
      } catch {
        // Resultado incerto também precisa de confirmação independente.
        aceita = true;
      }
      if (!aceita || (await confirmarPersistencia(transicao)) !== true) throw new Error();
      try {
        if ((await liberar(transicao)) !== true) throw new Error();
      } catch {
        /* confirmação autoritativa decide */
      }
      if ((await confirmar(transicao)) !== true) throw new Error();
      return { accessToken: novo.accessToken, geracao: geracao + 1, prova: proxima.prova };
    } catch {
      throw new Error('Não foi possível renovar a sessão.');
    }
  };
}
