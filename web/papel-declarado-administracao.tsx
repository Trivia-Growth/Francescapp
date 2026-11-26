import {
  gravarPapelDeclaradoSchema,
  type GravarPapelDeclarado,
  type PapelDeclarado,
} from '../packages/contracts/src/papel-declarado.ts';
import type { ServicoPapelDeclarado } from './servico-catalogo-administrado-http.ts';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { Superficie } from './componentes/ui/superficie.js';
import { Formulario, valorDe } from './telas/formulario.js';
import { MolduraTela } from './telas/moldura-tela.js';
import { ilha } from './ponte/ilha.js';
import { Recuperacao, useCatalogoAdministrado } from './telas/catalogo-administrado.js';

/** FR-079. Catálogo de papéis declarados do profissional. É rótulo impresso na ficha:
 * não concede, amplia nem restringe acesso nenhum — perfil e vínculo com o caso
 * continuam sendo os únicos controles. Desativar um papel não reescreve ficha antiga. */
function Tela({
  servico,
  acessoPerdido,
}: {
  servico: ServicoPapelDeclarado;
  acessoPerdido: (erro: unknown) => void;
}) {
  const catalogo = useCatalogoAdministrado<readonly PapelDeclarado[], GravarPapelDeclarado>(
    servico,
    acessoPerdido,
    {
      carregando: 'Carregando papéis declarados…',
      atualizado: 'Catálogo de papéis atualizado.',
      salvando: 'Salvando papel…',
    },
    (entrada, papeis) =>
      papeis.some(
        (papel) =>
          papel.papel_id === entrada.papel_id &&
          papel.versao === entrada.versao_esperada + 1 &&
          papel.nome === entrada.nome &&
          papel.ativo === entrada.ativo,
      ),
    [],
  );
  if (catalogo.perdido) return null;

  const enviar = (entrada: unknown) => {
    if (catalogo.bloqueado) return;
    const dados = gravarPapelDeclaradoSchema.safeParse(entrada);
    if (!dados.success) {
      catalogo.avisar('Informe um nome de papel com 1 a 80 caracteres.');
      return;
    }
    catalogo.enviar(dados.data);
  };

  return (
    <MolduraTela
      titulo="Papéis declarados"
      explicacao="Termos que o profissional escolhe ao assinar a ficha de plantão, como Acompanhante terapêutico e Enfermeira. O papel é rótulo do registro: não dá, tira nem amplia acesso — quem decide acesso continua sendo o perfil e o vínculo com o caso. Desativar um papel não altera ficha já gravada."
      acao={<Botao aoAtivar={catalogo.atualizar}>Atualizar catálogo de papéis</Botao>}
      status={catalogo.status}
      ocupado={catalogo.ocupado}
      antes={
        <Recuperacao
          alvo={catalogo.tentativa ? `Papel: ${catalogo.tentativa.entrada.nome}` : null}
          podeRepetir={!catalogo.ocupado && catalogo.tentativa?.consultada === true}
          aoRepetir={catalogo.repetir}
        />
      }
    >
      {/* Nada de conteúdo antes da primeira leitura concluída: a região fica
          vazia de propósito e o esqueleto da folha desenha a forma do que vem,
          em vez de oferecer um formulário sobre dados que ainda não existem. */}
      {catalogo.geracao === 0 ? null : (
        <>
          <Superficie titulo="Novo papel" key={`novo-${String(catalogo.geracao)}`}>
            <FormularioPapel bloqueado={catalogo.bloqueado} aoEnviar={enviar} />
          </Superficie>
          <Superficie titulo="Papéis do catálogo" plana>
            {catalogo.dados.length === 0 ? (
              <EstadoVazio
                titulo="Nenhum papel no catálogo."
                texto="Crie o primeiro papel acima."
              />
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {catalogo.dados.map((papel) => (
                  <li key={`${papel.papel_id}-${String(papel.versao)}`}>
                    <details className="rounded-cartao border border-borda bg-superficie px-5 py-4">
                      <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-semibold">
                        <span>{papel.nome}</span>
                        <MarcaEstado tom={papel.ativo ? 'padrao' : 'contorno'}>
                          {papel.ativo ? 'ativo' : 'desativado'}
                        </MarcaEstado>
                        {papel.de_fabrica ? (
                          <MarcaEstado tom="suave">de fábrica</MarcaEstado>
                        ) : null}
                      </summary>
                      <div className="grid justify-items-start gap-2 pt-4">
                        <FormularioPapel
                          papel={papel}
                          bloqueado={catalogo.bloqueado}
                          aoEnviar={enviar}
                        />
                        <Botao
                          disabled={catalogo.bloqueado}
                          aoAtivar={() =>
                            enviar({
                              papel_id: papel.papel_id,
                              nome: papel.nome,
                              ativo: !papel.ativo,
                              versao_esperada: papel.versao,
                            })
                          }
                        >
                          {papel.ativo ? 'Desativar papel' : 'Reativar papel'}
                        </Botao>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Superficie>
        </>
      )}
    </MolduraTela>
  );
}

function FormularioPapel({
  papel,
  bloqueado,
  aoEnviar,
}: {
  papel?: PapelDeclarado;
  bloqueado: boolean;
  aoEnviar: (entrada: unknown) => void;
}) {
  const identificador = `papel-${papel?.papel_id ?? 'novo'}`;
  return (
    <Formulario
      aoEnviar={(formulario) =>
        aoEnviar({
          papel_id: papel?.papel_id ?? crypto.randomUUID(),
          nome: valorDe(formulario, 'nome'),
          ativo: papel?.ativo ?? true,
          versao_esperada: papel?.versao ?? 0,
        })
      }
    >
      <fieldset disabled={bloqueado} className="m-0 grid justify-items-start gap-2 border-0 p-0">
        <legend className="sr-only">{papel ? `Renomear ${papel.nome}` : 'Novo papel'}</legend>
        <Campo
          id={identificador}
          rotulo="Nome do papel"
          name="nome"
          defaultValue={papel?.nome ?? ''}
          required
          maxLength={80}
          classeEnvelope="mb-0 w-full max-w-[42ch]"
        />
        <Botao peso="principal" tipo="submit">
          {papel ? 'Salvar nome' : 'Criar papel'}
        </Botao>
      </fieldset>
    </Formulario>
  );
}

export function montarPapelDeclaradoAdministracao(
  raiz: HTMLElement,
  servico: ServicoPapelDeclarado,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  return ilha(raiz, <Tela servico={servico} acessoPerdido={acessoPerdido} />);
}
