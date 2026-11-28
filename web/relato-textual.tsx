/** Formulário de relato textual da demonstração local. */
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  relatoTextualSchema,
  type RelatoTextual,
} from '../packages/contracts/src/relato-textual.ts';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { Formulario } from './telas/formulario.js';

const MENSAGEM_BLOQUEADO =
  'Gravação bloqueada por resultado incerto. Volte e abra os relatos novamente para consultar o servidor.';

/** Um controle do formulário, pelo invólucro desta tela — e não `document`, pela mesma
 *  razão de `web/anamnese.tsx`: as provas montam num `div` solto, que `document.getElementById`
 *  não enxerga. */
function controle(raiz: HTMLElement | null, id: string): HTMLElement | null {
  return raiz?.querySelector<HTMLElement>(`[id="${id}"]`) ?? null;
}

/** Protótipo isolado: sem armazenamento, envio, autorização ou rota. */
export function TelaRelatoTextual({
  salvar,
  bloqueado,
}: {
  salvar?: (relato: RelatoTextual) => Promise<void>;
  bloqueado: boolean;
}) {
  const envelope = useRef<HTMLDivElement>(null);

  const [aviso, definirAviso] = useState(bloqueado ? MENSAGEM_BLOQUEADO : '');
  const [salvamentoIncerto, definirSalvamentoIncerto] = useState(bloqueado);
  const [salvando, definirSalvando] = useState(false);
  const [revisaoDados, definirRevisaoDados] = useState<RelatoTextual | null>(null);

  const salvamentoIncertoRef = useRef(salvamentoIncerto);
  salvamentoIncertoRef.current = salvamentoIncerto;

  /* Ouvinte NATIVO, no invólucro de fora: alcança qualquer controle sem depender de uma
   * referência ao formulário, e reage à mesma atribuição crua de `.value` + `dispatchEvent`
   * que as provas usam (ver `web/anamnese.tsx`). A cada toque em qualquer campo: o aviso de
   * campo específico some, a revisão anterior deixa de valer, e o aviso de bloqueio
   * reaparece se o último salvamento continuar incerto. */
  useEffect(() => {
    const no = envelope.current;
    if (!no) return;
    const aoDigitar = (evento: Event) => {
      if (evento.target instanceof HTMLElement) evento.target.removeAttribute('aria-invalid');
      flushSync(() => {
        definirAviso(salvamentoIncertoRef.current ? MENSAGEM_BLOQUEADO : '');
        definirRevisaoDados(null);
      });
    };
    no.addEventListener('input', aoDigitar);
    return () => no.removeEventListener('input', aoDigitar);
  }, []);

  function aoEnviarFormulario(formulario: HTMLFormElement) {
    definirRevisaoDados(null);
    const preenchido = new FormData(formulario);
    const texto = (campo: string) => String(preenchido.get(campo) ?? '');
    const resultado = relatoTextualSchema.safeParse({
      dataAcontecimento: texto('data'),
      descricao: texto('descricao'),
      categoria: texto('categoria'),
      contexto: texto('contexto'),
      acaoTomada: texto('acao'),
      solicitacaoRetorno: preenchido.get('retorno') !== null,
    });
    const dataEl = controle(envelope.current, 'relato-data');
    const descricaoEl = controle(envelope.current, 'relato-descricao');
    if (!resultado.success) {
      const dataInvalida = resultado.error.issues.some(
        (problema) => problema.path[0] === 'dataAcontecimento',
      );
      const descricaoInvalida = resultado.error.issues.some(
        (problema) => problema.path[0] === 'descricao',
      );
      if (dataInvalida) dataEl?.setAttribute('aria-invalid', 'true');
      else dataEl?.removeAttribute('aria-invalid');
      if (descricaoInvalida) descricaoEl?.setAttribute('aria-invalid', 'true');
      else descricaoEl?.removeAttribute('aria-invalid');
      definirAviso(
        dataInvalida
          ? 'Informe uma data válida para revisar.'
          : 'Informe uma descrição para revisar.',
      );
      (dataInvalida ? dataEl : descricaoEl)?.focus();
      return;
    }
    definirAviso(
      salvamentoIncerto
        ? MENSAGEM_BLOQUEADO
        : salvar
          ? 'Confira os dados antes de guardar nesta prévia local.'
          : 'Dados prontos para revisão local. Nada foi salvo ou enviado.',
    );
    definirRevisaoDados(resultado.data);
  }

  async function aoClicarGuardar() {
    if (!salvar || !revisaoDados) return;
    const formulario = envelope.current?.querySelector('form');
    definirSalvando(true);
    try {
      await salvar(revisaoDados);
      formulario?.reset();
      flushSync(() => {
        definirSalvando(false);
        definirRevisaoDados(null);
        definirAviso('Relato fictício guardado neste computador.');
      });
    } catch (erro) {
      const incerto = !(
        erro instanceof Error && ['400', '401', '403', '404', '409'].includes(erro.message)
      );
      flushSync(() => {
        definirSalvando(false);
        definirSalvamentoIncerto(incerto);
        definirAviso(
          incerto
            ? 'Não foi possível confirmar o salvamento. Copie seu rascunho, volte e abra os relatos novamente para consultar o servidor.'
            : 'Não foi possível guardar. Confira a sessão ou a lista atualizada; seu rascunho permanece aqui.',
        );
      });
    }
  }

  return (
    <div ref={envelope}>
      <Formulario aoEnviar={aoEnviarFormulario} noValidate>
        <h2>Preparar relato</h2>
        <p>
          {salvar
            ? 'Demonstração local: use apenas dados fictícios. Relatos guardados ficam neste computador e não são enviados para atendimento.'
            : 'Demonstração local: use apenas dados fictícios. O relato não será salvo nem enviado e será perdido ao sair.'}
        </p>
        <p>Esta demonstração não é um canal de atendimento ou emergência.</p>
        <p>Data e descrição são obrigatórias. Os demais campos são opcionais.</p>
        <fieldset disabled={salvando} className="m-0 min-w-0 border-0 p-0 grid gap-4">
          <Campo
            id="relato-data"
            name="data"
            rotulo="Data do acontecimento (obrigatória)"
            tipo="date"
            required
          />
          <AreaTexto
            id="relato-descricao"
            name="descricao"
            rotulo="Descrição (obrigatória)"
            required
          />
          <Campo id="relato-categoria" name="categoria" rotulo="Categoria (opcional)" />
          <AreaTexto id="relato-contexto" name="contexto" rotulo="Contexto (opcional)" />
          <AreaTexto id="relato-acao" name="acao" rotulo="Ação tomada (opcional)" />
          <label htmlFor="relato-retorno">
            Solicitar retorno (opcional)
            <input id="relato-retorno" name="retorno" type="checkbox" />
          </label>
          <Botao peso="principal" tipo="submit">
            Revisar dados
          </Botao>
        </fieldset>
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já usam. */}
        <p role="status" aria-live="polite">
          {aviso}
        </p>
        <section>
          {revisaoDados ? (
            <>
              <h3>Revisão</h3>
              {salvar ? (
                <Botao
                  peso="secundario"
                  disabled={salvamentoIncerto}
                  aoAtivar={() => void aoClicarGuardar()}
                >
                  Guardar relato fictício nesta prévia
                </Botao>
              ) : null}
              <p>
                <strong>Data: </strong>
                {revisaoDados.dataAcontecimento}
              </p>
              <p>
                <strong>Descrição: </strong>
                {revisaoDados.descricao}
              </p>
              <p>
                <strong>Categoria: </strong>
                {revisaoDados.categoria || 'Não informada'}
              </p>
              <p>
                <strong>Contexto: </strong>
                {revisaoDados.contexto || 'Não informado'}
              </p>
              <p>
                <strong>Ação tomada: </strong>
                {revisaoDados.acaoTomada || 'Não informada'}
              </p>
              <p>
                <strong>Solicitação de retorno: </strong>
                {revisaoDados.solicitacaoRetorno ? 'Sim' : 'Não'}
              </p>
            </>
          ) : null}
        </section>
      </Formulario>
    </div>
  );
}
