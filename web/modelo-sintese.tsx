/** Campos de FR-009 compartilhados por Diário e Passagem de turno, em React (VIS-018).
 *  Envio e autorização ficam no chamador.
 *
 *  Era a costura mais arriscada da migração: os dois consumidores, já em React, montavam
 *  estes campos à mão dentro de um contêiner com ref — DOM escrito
 *  por fora numa árvore que o React também governa, a direção que produziu os
 *  `NotFoundError`. Agora os campos são componente da mesma árvore.
 *
 *  O que não mudou: os ids (`<prefixo>-<campo>`, que as provas e a captura de rascunho da
 *  Passagem usam), a área como seleção das áreas configuradas — ou texto livre quando a
 *  leitura delas falha, para o campo não sumir da tela —, e a validação pelo contrato
 *  `conteudoEvolucaoDiarioSchema`. Os controles são não controlados: o DOM é dono do valor,
 *  e `lerSintese` lê do documento, como antes. */
import {
  type ConteudoEvolucaoDiario,
  conteudoEvolucaoDiarioSchema,
} from '../packages/contracts/src/diario.ts';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { Campo } from './componentes/ui/campo.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import './estilos/tema.css';

export type CampoSintese =
  | 'area'
  | 'data'
  | 'atividade'
  | 'observacoes'
  | 'progresso'
  | 'orientacao'
  | 'proximo'
  | 'objetivo';
export type ValoresSintese = Partial<Record<CampoSintese, string>>;
export const CAMPOS_SINTESE: readonly CampoSintese[] = [
  'area',
  'data',
  'atividade',
  'observacoes',
  'progresso',
  'orientacao',
  'proximo',
  'objetivo',
];

const idDe = (prefixo: string, campo: CampoSintese) => `${prefixo}-${campo}`;

export function CamposSintese({
  areas,
  prefixo,
  iniciais = {},
  desabilitado = false,
}: {
  areas: readonly string[];
  prefixo: string;
  /** Valor com que cada controle nasce. Trocar exige remontar (chave nova). */
  iniciais?: ValoresSintese;
  desabilitado?: boolean;
}) {
  const id = (campo: CampoSintese) => idDe(prefixo, campo);
  const texto = (campo: CampoSintese, rotulo: string) => (
    <AreaTexto
      id={id(campo)}
      rotulo={rotulo}
      defaultValue={iniciais[campo] ?? ''}
      disabled={desabilitado}
    />
  );
  return (
    <>
      {areas.length ? (
        <SelecaoAprimorada
          id={id('area')}
          rotulo="Área (obrigatória)"
          defaultValue={
            iniciais.area !== undefined && areas.includes(iniciais.area) ? iniciais.area : areas[0]
          }
          disabled={desabilitado}
        >
          {areas.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
          ))}
        </SelecaoAprimorada>
      ) : (
        <Campo
          id={id('area')}
          rotulo="Área (obrigatória)"
          defaultValue={iniciais.area ?? ''}
          disabled={desabilitado}
        />
      )}
      <CampoData
        id={id('data')}
        rotulo="Data do atendimento (obrigatória)"
        defaultValue={iniciais.data ?? ''}
        disabled={desabilitado}
      />
      {texto('atividade', 'Atividade (obrigatória para publicar)')}
      {texto('observacoes', 'Observações compartilháveis')}
      {texto('progresso', 'Progresso')}
      {texto('orientacao', 'Orientação')}
      {texto('proximo', 'Próximo passo')}
      <Campo
        id={id('objetivo')}
        rotulo="Objetivo relacionado"
        defaultValue={iniciais.objetivo ?? ''}
        disabled={desabilitado}
      />
    </>
  );
}

/** O controle de um campo da síntese, procurado dentro de `raiz`. */
export function controleSintese(
  raiz: ParentNode | null | undefined,
  prefixo: string,
  campo: CampoSintese,
) {
  return (
    raiz?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      `[id="${idDe(prefixo, campo)}"]`,
    ) ?? null
  );
}

/** Lê e valida a síntese pelo contrato. `undefined` quando falta o obrigatório ou o
 *  conteúdo não passa no contrato — quem chama diz à pessoa o que conferir. */
export function lerSintese(
  raiz: ParentNode | null | undefined,
  prefixo: string,
): ConteudoEvolucaoDiario | undefined {
  const valor = (campo: CampoSintese) => controleSintese(raiz, prefixo, campo)?.value ?? '';
  const aparado = (campo: CampoSintese) => valor(campo).trim();
  const valores = {
    data: valor('data'),
    area: aparado('area'),
    ...(aparado('atividade') ? { atividade: aparado('atividade') } : {}),
    ...(aparado('observacoes') ? { observacoesCompartilhaveis: aparado('observacoes') } : {}),
    ...(aparado('progresso') ? { progresso: aparado('progresso') } : {}),
    ...(aparado('orientacao') ? { orientacao: aparado('orientacao') } : {}),
    ...(aparado('proximo') ? { proximoPasso: aparado('proximo') } : {}),
    ...(aparado('objetivo') ? { objetivoRelacionado: aparado('objetivo') } : {}),
  };
  const validado = conteudoEvolucaoDiarioSchema.safeParse(valores);
  return validado.success ? validado.data : undefined;
}
