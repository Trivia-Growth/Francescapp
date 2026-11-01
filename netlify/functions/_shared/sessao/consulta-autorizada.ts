import {
  autorizacaoCurtaSchema,
  contextoAutorizacaoCurtaSchema,
} from '../../../../packages/contracts/src/autorizacao-curta.ts';
import { sessaoAtualSchema } from '../../../../packages/contracts/src/identidade.ts';
import type { criarEmissorAutorizacaoCurta } from '../../../../supabase/functions/_shared/emissor-autorizacao-curta.ts';
import type { criarTransporteHttpSessaoComProva } from './http-prova.ts';

type Identidade = Awaited<
  ReturnType<ReturnType<typeof criarTransporteHttpSessaoComProva>['lerIdentidadeDaConsulta']>
>;
type Autorizacao = ReturnType<typeof autorizacaoCurtaSchema.parse>;
type Dependencias = {
  emitir: ReturnType<typeof criarEmissorAutorizacaoCurta>;
  consultar: (
    entrada: Readonly<{ autorizacao: Autorizacao; entradaCanonica: string; jwt: string }>,
  ) => Promise<unknown>;
};

/** Composição experimental, sem rota: a autoridade deve verificar a prova por canal
 * isolado; a consulta deve verificar assinatura, vínculo e consumo atômico no banco.
 * Este adaptador não garante esses controles nem substitui a revisão S-02. */
export function criarConsultaAutorizada({ emitir, consultar }: Dependencias) {
  return async (identidade: Identidade) => {
    try {
      const prova = identidade.prova;
      const jwt = identidade.jwt;
      const contexto = Object.freeze(
        contextoAutorizacaoCurtaSchema.parse({
          usuario_id: identidade.usuarioId,
          session_id: identidade.sessionId,
          geracao: identidade.geracao,
          operacao: 'sessao_atual',
          audiencia: 'api.consultar_sessao_atual',
        }),
      );
      if (
        !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(prova) ||
        typeof jwt !== 'string' ||
        !/^[A-Za-z0-9_.-]+$/.test(jwt)
      )
        throw new Error();
      const resposta = await emitir(contexto, prova, Object.freeze({}));
      const autorizacao = Object.freeze(autorizacaoCurtaSchema.parse(resposta.autorizacao));
      if (
        resposta.entradaCanonica !== '{}' ||
        autorizacao.usuario_id !== contexto.usuario_id ||
        autorizacao.session_id !== contexto.session_id ||
        autorizacao.geracao !== contexto.geracao ||
        autorizacao.operacao !== contexto.operacao ||
        autorizacao.audiencia !== contexto.audiencia
      )
        throw new Error();
      const entrada = Object.freeze(
        Object.defineProperties(
          { entradaCanonica: resposta.entradaCanonica },
          {
            autorizacao: { value: autorizacao, enumerable: false },
            jwt: { value: jwt, enumerable: false },
          },
        ),
      ) as Readonly<{ autorizacao: Autorizacao; entradaCanonica: string; jwt: string }>;
      const resultado = await consultar(entrada);
      if (resultado === null) return null;
      const dados = sessaoAtualSchema.parse(resultado);
      if (!dados.usuario.ativo || dados.usuario.id !== contexto.usuario_id) throw new Error();
      return dados;
    } catch {
      throw new Error('Consulta indisponível.');
    }
  };
}
