import {
  contextoAutorizacaoCurtaSchema,
  type ContextoAutorizacaoCurta,
} from '../../../packages/contracts/src/autorizacao-curta.ts';
import { criarAtestadorOperacao } from './atestado-operacao.ts';
import { criarAutorizacaoCurta } from './autorizacao-curta.ts';
import { hashProvaGeracao } from './sessao/prova-geracao.ts';

/** Experimento não ligado ao runtime. É responsabilidade obrigatória do chamador
 * autenticar o contexto e autorizar a operação; este emissor não o faz. O
 * consultor deve usar canal isolado e restringir leitura ao vínculo informado.
 * O banco deve revalidar sessão, concessão e revogação e consumir atomicamente. */
export function criarEmissorAutorizacaoCurta(config: {
  keyId: string;
  chave: Uint8Array;
  consultar: (
    vinculo: Readonly<Pick<ContextoAutorizacaoCurta, 'usuario_id' | 'session_id' | 'geracao'>>,
  ) => Promise<string | null>;
  agora: () => number;
}) {
  const nucleo = criarAutorizacaoCurta(config);
  const canonicalizar = criarAtestadorOperacao(config).canonicalizar;
  const consultar = config.consultar;
  const agora = config.agora;
  return async (
    contexto: ContextoAutorizacaoCurta,
    prova: string,
    entrada: Record<string, unknown>,
  ) => {
    try {
      const validado = contextoAutorizacaoCurtaSchema.parse(contexto);
      const snapshot = JSON.parse(canonicalizar(entrada)) as Record<string, unknown>;
      const calculado = await hashProvaGeracao(prova);
      const armazenado = await consultar(
        Object.freeze({
          usuario_id: validado.usuario_id,
          session_id: validado.session_id,
          geracao: validado.geracao,
        }),
      );
      if (
        typeof armazenado !== 'string' ||
        !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(armazenado)
      )
        throw new Error();
      let diferenca = 0;
      for (let i = 0; i < 43; i += 1)
        diferenca |= calculado.charCodeAt(i) ^ armazenado.charCodeAt(i);
      if (diferenca !== 0) throw new Error();
      return await nucleo.emitir(validado, snapshot, agora());
    } catch {
      throw new Error('Autorização indisponível.');
    }
  };
}
