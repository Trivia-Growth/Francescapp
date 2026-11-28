import { useState } from 'react';
import {
  gravarCampoExtraEscopoSchema,
  type CampoExtraCatalogoGeneralizado,
  type EscopoCampoExtra,
  type GravarCampoExtraEscopo,
  type TipoCampoExtra,
} from '../packages/contracts/src/campo-extra-catalogo.ts';
import type {
  ComIdentidade,
  ServicoModeloFormulario,
} from './servico-catalogo-administrado-http.ts';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { Superficie } from './componentes/ui/superficie.js';
import { CaixaDeMarcacao } from './telas/caixa-de-marcacao.js';
import { Formulario, marcado, valorDe } from './telas/formulario.js';
import { MolduraTela } from './telas/moldura-tela.js';
import { Recuperacao, useCatalogoAdministrado } from './telas/catalogo-administrado.js';
import { leituraPorSessao } from './consultas.js';

const rotulosDeTipo: readonly (readonly [TipoCampoExtra, string])[] = [
  ['texto', 'Texto curto'],
  ['texto_longo', 'Texto longo'],
  ['numero', 'Número'],
  ['data', 'Data'],
  ['booleano', 'Sim ou não'],
  ['lista', 'Lista de opções'],
];

/** FR-078. Modelo da ficha de plantão: acrescentar campo, definir a ordem, marcar
 * obrigatoriedade, escolher a visibilidade e desativar — inclusive campos de fábrica.
 * Nada é apagado: desativar mantém a resposta antiga legível. Cada escrita é
 * reautorizada pelo servidor e pelo banco; esconder controle aqui não é autorizar. */
export function TelaModeloFichaPlantao({
  servico,
  acessoPerdido,
}: {
  servico: ServicoModeloFormulario & ComIdentidade & { escopo: EscopoCampoExtra };
  acessoPerdido: (erro: unknown) => void;
}) {
  // Cache de leitura (`web/consultas.ts`), montado uma vez por tela: a volta mostra o que
  // esta identidade já leu, sem GET; Atualizar, salvar e repetir releem sempre.
  const [emCache] = useState(() =>
    leituraPorSessao(servico.identidade, ['admin', 'modelo-formulario', servico.escopo], () =>
      servico.consultar(),
    ),
  );
  const catalogo = useCatalogoAdministrado<
    readonly CampoExtraCatalogoGeneralizado[],
    GravarCampoExtraEscopo
  >(
    { ...servico, consultar: emCache.consultar },
    acessoPerdido,
    {
      carregando: 'Carregando o modelo da ficha…',
      atualizado: 'Modelo da ficha atualizado.',
      salvando: 'Salvando alteração do modelo…',
    },
    (entrada, campos) =>
      campos.some(
        (campo) =>
          campo.campo_id === entrada.campo_id &&
          campo.versao === entrada.versao_esperada + 1 &&
          campo.nome === entrada.nome &&
          campo.tipo === entrada.tipo &&
          campo.ativo === entrada.ativo &&
          campo.ordem === entrada.ordem &&
          campo.obrigatorio === entrada.obrigatorio &&
          campo.visibilidade === entrada.visibilidade,
      ),
    [],
    emCache.leitura,
  );
  if (catalogo.perdido) return null;

  const enviar = (entrada: unknown) => {
    if (catalogo.bloqueado) return;
    const dados = gravarCampoExtraEscopoSchema.safeParse(entrada);
    if (!dados.success) {
      catalogo.avisar(
        'Confira nome, tipo, posição e opções (1 a 20 opções, até 120 caracteres cada).',
      );
      return;
    }
    catalogo.enviar(dados.data);
  };

  const proxima = catalogo.dados.reduce((maior, campo) => Math.max(maior, campo.ordem), 0) + 1;

  return (
    <MolduraTela
      titulo="Ficha de plantão — modelo"
      explicacao="Campos da ficha preenchida ao fim do plantão. Desativar um campo não apaga nenhuma resposta já gravada: ela continua legível na ficha antiga, marcada como de campo desativado. Obrigatoriedade vale para fichas novas."
      acao={
        // `aria-disabled`, não `disabled`: o foco fica no botão durante a consulta.
        <Botao aria-disabled={catalogo.ocupado} aoAtivar={catalogo.atualizar}>
          Atualizar modelo
        </Botao>
      }
      status={catalogo.status}
      ocupado={catalogo.ocupado}
      antes={
        <Recuperacao
          alvo={catalogo.tentativa ? `Campo: ${catalogo.tentativa.entrada.nome}` : null}
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
          <Superficie titulo="Novo campo" key={`novo-${String(catalogo.geracao)}`}>
            <FormularioCampo
              proximaOrdem={proxima}
              bloqueado={catalogo.bloqueado}
              aoEnviar={enviar}
            />
          </Superficie>
          <Superficie titulo="Campos da ficha" plana>
            {catalogo.dados.length === 0 ? (
              <EstadoVazio
                titulo="Nenhum campo no modelo."
                texto="Crie o primeiro campo da ficha acima."
              />
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {catalogo.dados.map((campo) => (
                  <li key={`${campo.campo_id}-${String(campo.versao)}`}>
                    <details className="rounded-cartao border border-borda bg-superficie px-5 py-4">
                      <summary className="flex min-h-controle-md cursor-pointer flex-wrap items-center gap-2 py-2 font-semibold">
                        <span>{campo.nome}</span>
                        <MarcaEstado tom="suave">{`posição ${String(campo.ordem)}`}</MarcaEstado>
                        <MarcaEstado tom={campo.ativo ? 'padrao' : 'contorno'}>
                          {campo.ativo ? 'ativo' : 'desativado'}
                        </MarcaEstado>
                        <MarcaEstado tom="suave">
                          {campo.obrigatorio ? 'obrigatório' : 'opcional'}
                        </MarcaEstado>
                        <MarcaEstado tom="suave">
                          {campo.visibilidade === 'compartilhavel' ? 'compartilhável' : 'interno'}
                        </MarcaEstado>
                        {campo.de_fabrica ? (
                          <MarcaEstado tom="suave">de fábrica</MarcaEstado>
                        ) : null}
                      </summary>
                      <div className="pt-4">
                        <FormularioCampo
                          campo={campo}
                          proximaOrdem={proxima}
                          bloqueado={catalogo.bloqueado}
                          aoEnviar={enviar}
                        />
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

function FormularioCampo({
  campo,
  proximaOrdem,
  bloqueado,
  aoEnviar,
}: {
  campo?: CampoExtraCatalogoGeneralizado;
  proximaOrdem: number;
  bloqueado: boolean;
  aoEnviar: (entrada: unknown) => void;
}) {
  const [tipo, definirTipo] = useState<string>(campo?.tipo ?? 'texto_longo');
  const identificador = `modelo-ficha-${campo?.campo_id ?? 'novo'}`;
  const eLista = tipo === 'lista';
  return (
    <Formulario
      aoEnviar={(formulario) =>
        aoEnviar({
          campo_id: campo?.campo_id ?? crypto.randomUUID(),
          escopo: 'ficha_plantao',
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
          ordem: Number(valorDe(formulario, 'ordem')),
          obrigatorio: marcado(formulario, 'obrigatorio'),
          visibilidade: valorDe(formulario, 'visibilidade'),
          versao_esperada: campo?.versao ?? 0,
        })
      }
    >
      <fieldset disabled={bloqueado} className="m-0 grid justify-items-start gap-2 border-0 p-0">
        <legend className="sr-only">
          {campo ? `Editar ${campo.nome}` : 'Novo campo da ficha'}
        </legend>
        <div className="grid w-full gap-x-5 sm:grid-cols-2">
          <Campo
            id={`${identificador}-nome`}
            name="nome"
            rotulo="Nome do campo"
            defaultValue={campo?.nome ?? ''}
            required
            maxLength={120}
          />
          <SelecaoAprimorada
            id={`${identificador}-tipo`}
            name="tipo"
            rotulo="Tipo"
            defaultValue={campo?.tipo ?? 'texto_longo'}
            onChange={(evento) => definirTipo(evento.target.value)}
          >
            {rotulosDeTipo.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </SelecaoAprimorada>
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
          <Campo
            id={`${identificador}-ordem`}
            name="ordem"
            rotulo="Posição na ficha"
            tipo="number"
            min={0}
            max={999999999}
            defaultValue={String(campo?.ordem ?? proximaOrdem)}
            required
          />
          <SelecaoAprimorada
            id={`${identificador}-visibilidade`}
            name="visibilidade"
            rotulo="Quem pode ler"
            defaultValue={campo?.visibilidade ?? 'interna'}
          >
            <option value="interna">Nota interna da equipe</option>
            <option value="compartilhavel">Pode ser compartilhado com a família</option>
          </SelecaoAprimorada>
        </div>
        <CaixaDeMarcacao
          id={`${identificador}-obrigatorio`}
          name="obrigatorio"
          rotulo="Preenchimento obrigatório"
          defaultChecked={campo?.obrigatorio ?? false}
        />
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
