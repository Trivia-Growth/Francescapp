import { criarCatalogoResponsaveis, type ResponsavelOpcao } from './acompanhamento-caso.js';
import { aoEsquecerSessao } from './api.js';

type Identidade = { usuario_id: string; session_id: string };
type Listar = Parameters<typeof criarCatalogoResponsaveis>[0];
export type CatalogoResponsaveis = () => Promise<ResponsavelOpcao[]>;

/** A lista da equipe que a casca reaproveita (filtros da Carteira, responsável do caso
 *  novo, nomes na Auditoria e na Configuração, aprovadores do Plano de cuidado): uma
 *  consulta por SESSÃO, não por usuário.
 *
 *  Defeito corrigido na fatia 9b (28/11/2026): o catálogo era guardado por `usuario.id` e
 *  sobrevivia à saída. Quem saía e entrava de novo com a mesma conta, numa sessão nova,
 *  continuava vendo a lista lida na sessão anterior, e os nomes guardados também não eram
 *  apagados. Agora:
 *  1. o dono é conta + sessão: mudou qualquer um dos dois, o catálogo é outro;
 *  2. `aoEsquecerSessao` (revogação, novo acesso, saída) esquece catálogo e nomes;
 *  3. uma resposta que chega depois de a identidade mudar não grava nomes. */
export function criarEquipePorSessao(listar: Listar) {
  let dono: string | null = null;
  let catalogo: CatalogoResponsaveis | null = null;
  let nomes = new Map<string, string>();

  const esquecer = () => {
    dono = null;
    catalogo = null;
    nomes = new Map();
  };
  aoEsquecerSessao(esquecer);

  const para = (identidade: Identidade): CatalogoResponsaveis => {
    const atual = `${identidade.usuario_id}|${identidade.session_id}`;
    if (dono !== atual || !catalogo) {
      esquecer();
      dono = atual;
      catalogo = criarCatalogoResponsaveis(listar);
    }
    return catalogo;
  };

  return {
    /** O catálogo desta identidade, criado na primeira vez que ela pede. */
    para,
    /** Lê a equipe para os nomes, sem esperar; a falha só deixa o identificador à mostra. */
    carregarNomes(identidade: Identidade): void {
      const deste = para(identidade);
      void deste()
        .then((lista) => {
          if (catalogo === deste)
            nomes = new Map(lista.map((item) => [item.usuario_id, item.rotulo]));
        })
        .catch(() => {
          /* sem a equipe carregada, a tela mostra o identificador */
        });
    },
    nome: (usuarioId: string): string | undefined => nomes.get(usuarioId),
  };
}
