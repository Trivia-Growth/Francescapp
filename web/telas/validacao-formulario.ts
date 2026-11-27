import { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ZodType } from 'zod';

/* Helper único de validação de formulário: schema zod → erro por campo → foco no primeiro
   inválido. Decisão do dono de 27/11/2026: formulário nativo + zod + um helper, sem React
   Hook Form.

   O CONTRATO DE ANÚNCIO (o motivo de este arquivo existir): o erro de cada campo mora no
   `<p id="{id}-erro">` de `Campo`/`AreaTexto`, referenciado por `aria-describedby`, SEM
   região viva. A única via de anúncio é o foco: o leitor lê rótulo, "inválido" e a
   descrição do PRIMEIRO campo inválido. Uma região `aria-live` com a mesma frase a faria
   soar duas vezes — por isso a tela não deve repetir o erro em `status`/`alert`.
   Os demais erros ficam visíveis e são lidos quando o foco chega neles.
   Se o primeiro inválido já está focado, o foco sai e volta: sem isso um segundo envio
   inválido não muda nada para o leitor e o erro seria mudo. */

export type ErrosDeCampo = Readonly<Record<string, string>>;

export type ResultadoValidacao<T> = { ok: true; dados: T } | { ok: false; erros: ErrosDeCampo };

/** Texto quando o schema recusa algo que não é nenhum dos campos do formulário. É defeito
 *  da tela (contrato e formulário divergiram), mas não pode ser um envio mudo. */
export const ERRO_GERAL = '_geral';

/** `mensagens` diz, por campo, a frase em português. O schema decide SE é inválido; a
 *  mensagem padrão do zod (inglês, técnica) nunca chega à tela. */
export function validarCampos<T>(
  schema: ZodType<T>,
  entrada: Record<string, unknown>,
  mensagens: Readonly<Record<string, string>>,
): ResultadoValidacao<T> {
  const resultado = schema.safeParse(entrada);
  if (resultado.success) return { ok: true, dados: resultado.data };
  const erros: Record<string, string> = {};
  for (const problema of resultado.error.issues) {
    const campo = String(problema.path[0] ?? '');
    const chave = campo in mensagens ? campo : ERRO_GERAL;
    erros[chave] ??= mensagens[chave] ?? 'Confira os dados informados.';
  }
  return { ok: false, erros };
}

/** O primeiro controle, na ORDEM DO DOCUMENTO, cujo `name` tem erro. */
function primeiroInvalido(formulario: HTMLFormElement, erros: ErrosDeCampo): HTMLElement | null {
  for (const controle of formulario.elements) {
    if (
      (controle instanceof HTMLInputElement ||
        controle instanceof HTMLTextAreaElement ||
        controle instanceof HTMLSelectElement) &&
      controle.name in erros
    )
      return controle;
  }
  return null;
}

export function useValidacaoFormulario<T>(
  schema: ZodType<T>,
  mensagens: Readonly<Record<string, string>>,
) {
  const [erros, definirErros] = useState<ErrosDeCampo>({});

  /** Valida o formulário. Devolve os dados do contrato ou `null` — e, no `null`, já deixou
   *  os erros na tela e o foco no primeiro campo inválido. `extras` carrega o que não é
   *  campo (o `metodo` fixo do contrato). */
  const validar = useCallback(
    (formulario: HTMLFormElement, extras: Record<string, unknown> = {}): T | null => {
      const entrada: Record<string, unknown> = { ...extras };
      for (const [nome, valor] of new FormData(formulario)) entrada[nome] = String(valor);
      const resultado = validarCampos(schema, entrada, mensagens);
      // Síncrono de propósito: o foco só anuncia o que JÁ está no DOM.
      flushSync(() => definirErros(resultado.ok ? {} : resultado.erros));
      if (resultado.ok) return resultado.dados;
      const alvo = primeiroInvalido(formulario, resultado.erros);
      if (alvo) {
        if (alvo === document.activeElement) alvo.blur();
        alvo.focus();
      }
      return null;
    },
    [schema, mensagens],
  );

  /** Props para o campo `nome`: o erro, e a limpeza dele assim que a pessoa corrige. */
  const campo = useCallback(
    (nome: string) => ({
      erro: erros[nome],
      onInput: () =>
        definirErros((atuais) => {
          if (!(nome in atuais)) return atuais;
          const { [nome]: _removido, ...restantes } = atuais;
          return restantes;
        }),
    }),
    [erros],
  );

  return { validar, campo, erroGeral: erros[ERRO_GERAL] };
}
