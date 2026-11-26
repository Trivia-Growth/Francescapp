import { useState } from 'react';
import type { CampoExtraCatalogo } from '../packages/contracts/src/plano-cuidado.ts';
import { contratosRotas } from '../packages/contracts/src/rotas.ts';
import type { ServicoPlanoCuidado } from './plano-cuidado.js';
import { Aba, Abas, FaixaAbas, PainelAba } from './componentes/ui/abas.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import { Superficie } from './componentes/ui/superficie.js';
import { CaixaDeMarcacao } from './telas/caixa-de-marcacao.js';
import { Formulario, marcado, valorDe } from './telas/formulario.js';
import { MolduraTela } from './telas/moldura-tela.js';
import { ilha } from './ponte/ilha.js';
import { Recuperacao, useCatalogoAdministrado } from './telas/catalogo-administrado.js';

type Aprovador = { usuario_id: string; ativo: boolean; versao: number };
type Colaborador = { usuario_id: string; rotulo: string; ativo: boolean };
type DadosPlano = {
  campos: readonly CampoExtraCatalogo[];
  aprovadores: readonly Aprovador[];
  equipe: readonly Colaborador[];
};
type EnvioPlano =
  | { tipo: 'campo'; entrada: Parameters<NonNullable<ServicoPlanoCuidado['gravarCampoExtra']>>[0] }
  | {
      tipo: 'aprovador';
      entrada: Parameters<NonNullable<ServicoPlanoCuidado['gravarAprovador']>>[0];
    };

const VAZIO: DadosPlano = { campos: [], aprovadores: [], equipe: [] };

/** Metadados globais. Cada escrita é reautorizada pelo servidor e pelo banco.
 *
 * A tela trata DOIS assuntos que não se misturam — o catálogo de campos adicionais e quem
 * pode aprovar —, e até aqui os dois eram empilhados numa rolagem só, separados apenas por
 * um `h3`. Agora cada um tem sua aba. A consulta continua sendo UMA, feita na montagem: as
 * duas abas leem os mesmos dados já carregados, então trocar de aba não refaz consulta
 * nenhuma nem remonta a moldura da tela (VIS-014). O envio sem confirmação fica fora das
 * abas de propósito: ele bloqueia os dois assuntos e precisa ser visto dos dois. */
function Tela({
  servico,
  acessoPerdido,
  consultarEquipe,
}: {
  servico: ServicoPlanoCuidado;
  acessoPerdido: (erro: unknown) => void;
  consultarEquipe: () => Promise<readonly Colaborador[]>;
}) {
  const catalogo = useCatalogoAdministrado<DadosPlano, EnvioPlano>(
    {
      consultar: async () => {
        if (!servico.consultarCatalogo || !servico.consultarAprovadores)
          throw new Error('Serviço indisponível.');
        const [campos, aprovadores, equipe] = await Promise.all([
          servico.consultarCatalogo(),
          servico.consultarAprovadores(),
          consultarEquipe(),
        ]);
        return { campos, aprovadores, equipe };
      },
      // Sem camada `async` por cima: a promessa do serviço é devolvida como está, para
      // que a resposta — inclusive a recusa — chegue no mesmo instante em que chegaria
      // sem este despacho. Um `await` aqui só acrescentaria uma volta de espera.
      gravar: (envio, chave) => {
        if (envio.tipo === 'campo') {
          if (!servico.gravarCampoExtra) return Promise.reject(new Error('Serviço indisponível.'));
          return servico.gravarCampoExtra(envio.entrada, chave);
        }
        if (!servico.gravarAprovador) return Promise.reject(new Error('Serviço indisponível.'));
        return servico.gravarAprovador(envio.entrada, chave);
      },
    },
    acessoPerdido,
    {
      carregando: 'Carregando catálogo e aprovadores…',
      atualizado: 'Catálogo e aprovadores atualizados.',
      salvando: 'Salvando alteração…',
    },
    (envio, dados) =>
      envio.tipo === 'campo'
        ? dados.campos.some(
            (campo) =>
              campo.campo_id === envio.entrada.campo_id &&
              campo.versao === envio.entrada.versao_esperada + 1 &&
              campo.nome === envio.entrada.nome &&
              campo.tipo === envio.entrada.tipo &&
              campo.ativo === envio.entrada.ativo &&
              JSON.stringify(campo.opcoes) === JSON.stringify(envio.entrada.opcoes),
          )
        : dados.aprovadores.some(
            (item) =>
              item.usuario_id === envio.entrada.usuario_id_aprovador &&
              item.versao === envio.entrada.versao_esperada + 1 &&
              item.ativo === envio.entrada.ativo,
          ),
    VAZIO,
  );
  if (catalogo.perdido) return null;

  const { campos, aprovadores, equipe } = catalogo.dados;

  const enviarCampo = (entrada: unknown) => {
    if (catalogo.bloqueado || !servico.gravarCampoExtra) return;
    const dados = contratosRotas.gravarCampoExtraPlano.entrada.safeParse(entrada);
    if (!dados.success) {
      catalogo.avisar('Confira nome, tipo e opções (1 a 20 opções, até 120 caracteres cada).');
      return;
    }
    catalogo.enviar({ tipo: 'campo', entrada: dados.data });
  };

  const enviarAprovador = (id: string, ativo: boolean, versao: number) => {
    if (catalogo.bloqueado || !servico.gravarAprovador) return;
    const entrada = contratosRotas.gravarAprovadorPlano.entrada.safeParse({
      usuario_id_aprovador: id,
      ativo,
      versao_esperada: versao,
    });
    if (!entrada.success) {
      catalogo.avisar('Informe um identificador de colaborador válido.');
      return;
    }
    catalogo.enviar({ tipo: 'aprovador', entrada: entrada.data });
  };

  return (
    <MolduraTela
      titulo="Plano de cuidado — administração"
      explicacao="Campos globais opcionais para todos os objetivos. Aprovação registra um carimbo e não impede o cuidado."
      acao={<Botao aoAtivar={catalogo.atualizar}>Atualizar catálogo e aprovadores</Botao>}
      status={catalogo.status}
      ocupado={catalogo.ocupado}
      antes={
        <Recuperacao
          alvo={
            catalogo.tentativa === null
              ? null
              : catalogo.tentativa.entrada.tipo === 'campo'
                ? `Campo: ${catalogo.tentativa.entrada.entrada.nome}`
                : 'Indicação de aprovador'
          }
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
          <Abas defaultValue="campos">
            <FaixaAbas aria-label="Assuntos do plano de cuidado">
              <Aba value="campos">Campos adicionais</Aba>
              <Aba value="aprovadores" estado={String(aprovadores.length)}>
                Aprovadores
              </Aba>
            </FaixaAbas>
            <PainelAba value="campos" className="grid gap-4">
              <Superficie titulo="Novo campo adicional" key={`novo-${String(catalogo.geracao)}`}>
                <FormularioCampo bloqueado={catalogo.bloqueado} aoEnviar={enviarCampo} />
              </Superficie>
              {campos.length === 0 ? (
                <EstadoVazio
                  titulo="Nenhum campo cadastrado."
                  texto="Crie um campo opcional acima."
                />
              ) : (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {campos.map((campo) => (
                    <li key={`${campo.campo_id}-${String(campo.versao)}`}>
                      <details className="rounded-cartao border border-borda bg-superficie px-5 py-4">
                        <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-semibold">
                          <span>{campo.nome}</span>
                          <MarcaEstado tom={campo.ativo ? 'padrao' : 'contorno'}>
                            {campo.ativo ? 'ativo' : 'desativado'}
                          </MarcaEstado>
                        </summary>
                        <div className="pt-4">
                          <FormularioCampo
                            campo={campo}
                            bloqueado={catalogo.bloqueado}
                            aoEnviar={enviarCampo}
                          />
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </PainelAba>
            <PainelAba value="aprovadores" className="grid gap-4">
              <Superficie
                titulo="Indicar aprovador"
                descricao="Administradores podem aprovar por padrão. Selecione um colaborador para indicar ou reativar um aprovador extra."
                key={`aprovador-${String(catalogo.geracao)}`}
              >
                <Formulario
                  aoEnviar={(formulario) => {
                    const escolhido = valorDe(formulario, 'colaborador').trim();
                    const existente = aprovadores.find((item) => item.usuario_id === escolhido);
                    enviarAprovador(escolhido, true, existente?.versao ?? 0);
                  }}
                >
                  <fieldset
                    disabled={catalogo.bloqueado}
                    className="m-0 grid justify-items-start gap-2 border-0 p-0"
                  >
                    <legend className="sr-only">Indicar aprovador</legend>
                    <SelecaoSimples
                      id="plano-aprovador-colaborador"
                      name="colaborador"
                      rotulo="Colaborador"
                      required
                      defaultValue=""
                      classeEnvelope="mb-0 w-full max-w-[42ch]"
                    >
                      <option value="">Selecione um colaborador</option>
                      {equipe
                        .filter((pessoa) => pessoa.ativo)
                        .map((pessoa) => (
                          <option key={pessoa.usuario_id} value={pessoa.usuario_id}>
                            {pessoa.rotulo}
                          </option>
                        ))}
                    </SelecaoSimples>
                    <Botao peso="principal" tipo="submit">
                      Indicar aprovador
                    </Botao>
                  </fieldset>
                </Formulario>
              </Superficie>
              {aprovadores.length === 0 ? (
                <EstadoVazio titulo="Nenhum aprovador extra indicado." />
              ) : (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {aprovadores.map((aprovador) => (
                    <li
                      key={aprovador.usuario_id}
                      className="flex flex-wrap items-center gap-3 rounded-cartao border border-borda bg-superficie px-5 py-4"
                    >
                      <span className="min-w-0 flex-1 font-semibold">
                        {equipe.find((pessoa) => pessoa.usuario_id === aprovador.usuario_id)
                          ?.rotulo ?? 'Colaborador sem identificação disponível'}
                      </span>
                      <MarcaEstado tom={aprovador.ativo ? 'padrao' : 'contorno'}>
                        {aprovador.ativo ? 'ativo' : 'desativado'}
                      </MarcaEstado>
                      <Botao
                        peso="discreto"
                        disabled={catalogo.bloqueado}
                        aoAtivar={() =>
                          enviarAprovador(aprovador.usuario_id, !aprovador.ativo, aprovador.versao)
                        }
                      >
                        {aprovador.ativo ? 'Remover indicação' : 'Reativar indicação'}
                      </Botao>
                    </li>
                  ))}
                </ul>
              )}
            </PainelAba>
          </Abas>
        </>
      )}
    </MolduraTela>
  );
}

function FormularioCampo({
  campo,
  bloqueado,
  aoEnviar,
}: {
  campo?: CampoExtraCatalogo;
  bloqueado: boolean;
  aoEnviar: (entrada: unknown) => void;
}) {
  const [tipo, definirTipo] = useState<string>(campo?.tipo ?? 'texto');
  const identificador = `plano-campo-${campo?.campo_id ?? 'novo'}`;
  const eLista = tipo === 'lista';
  return (
    <Formulario
      aoEnviar={(formulario) =>
        aoEnviar({
          campo_id: campo?.campo_id ?? crypto.randomUUID(),
          nome: valorDe(formulario, 'nome'),
          tipo: valorDe(formulario, 'tipo'),
          opcoes:
            valorDe(formulario, 'tipo') === 'lista'
              ? valorDe(formulario, 'opcoes')
                  .split('\n')
                  .map((opcao) => opcao.trim())
                  .filter(Boolean)
              : null,
          ativo: marcado(formulario, 'ativo'),
          versao_esperada: campo?.versao ?? 0,
        })
      }
    >
      <fieldset disabled={bloqueado} className="m-0 grid justify-items-start gap-2 border-0 p-0">
        <legend className="sr-only">
          {campo ? `Editar ${campo.nome}` : 'Novo campo adicional'}
        </legend>
        <div className="grid w-full gap-x-5 sm:grid-cols-2">
          <Campo
            id={`${identificador}-nome`}
            name="nome"
            rotulo="Nome"
            defaultValue={campo?.nome ?? ''}
            required
            maxLength={120}
          />
          <SelecaoSimples
            id={`${identificador}-tipo`}
            name="tipo"
            rotulo="Tipo"
            defaultValue={campo?.tipo ?? 'texto'}
            onChange={(evento) => definirTipo(evento.target.value)}
          >
            <option value="texto">Texto</option>
            <option value="numero">Número</option>
            <option value="data">Data</option>
            <option value="lista">Lista de opções</option>
          </SelecaoSimples>
          {/* Fica montado e escondido: o controle continua existindo quando o tipo volta
              a ser lista, e a opção já escrita não se perde na ida e volta. */}
          <div hidden={!eLista} className="sm:col-span-2">
            <AreaTexto
              id={`${identificador}-opcoes`}
              name="opcoes"
              rotulo="Opções (uma por linha, de 1 a 20)"
              defaultValue={campo?.opcoes?.join('\n') ?? ''}
              required={eLista}
            />
          </div>
        </div>
        <CaixaDeMarcacao
          id={`${identificador}-ativo`}
          name="ativo"
          rotulo="Campo ativo"
          defaultChecked={campo?.ativo ?? true}
        />
        <Botao peso="principal" tipo="submit">
          {campo ? 'Salvar campo' : 'Criar campo'}
        </Botao>
      </fieldset>
    </Formulario>
  );
}

export function montarAdministracaoPlano(
  raiz: HTMLElement,
  servico: ServicoPlanoCuidado,
  acessoPerdido: (erro: unknown) => void,
  consultarEquipe: () => Promise<readonly Colaborador[]>,
): () => void {
  return ilha(
    raiz,
    <Tela servico={servico} acessoPerdido={acessoPerdido} consultarEquipe={consultarEquipe} />,
  );
}
