/**
 * Medições de layout feitas no navegador real. Cada função devolve número, não veredito:
 * quem decide a aprovação é o teste, e o relatório registra o valor medido.
 *
 * As funções auxiliares são repetidas dentro de cada `evaluate` de propósito: o corpo do
 * `evaluate` é serializado e executado na página, onde o escopo deste módulo não existe.
 */
import type { Page } from '@playwright/test';

export type Alvo = { descricao: string; largura: number; altura: number };

export type Foco = {
  descricao: string;
  contorno: string;
  espessura: number;
  cor: string;
  sombra: string;
  visivel: boolean;
};

export type Campo = { descricao: string; rotulo: string; temRotulo: boolean; inputmode: string };

export type Largura = {
  documentoScrollWidth: number;
  documentoClientWidth: number;
  janelaInnerWidth: number;
  corpoScrollWidth: number;
  excesso: number;
  maisLargos: { descricao: string; direita: number }[];
};

const SELETOR_INTERATIVO =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="tab"], [role="button"], [tabindex]:not([tabindex="-1"])';

const SELETOR_CAMPO = 'input:not([type="hidden"]):not([type="submit"]), select, textarea';

export async function medirLargura(pagina: Page): Promise<Largura> {
  return pagina.evaluate(() => {
    const descreve = (elemento: Element): string => {
      const tag = elemento.tagName.toLowerCase();
      const tipo = elemento.getAttribute('type');
      const classe = elemento.getAttribute('class');
      const texto = (elemento.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const rotulo = elemento.getAttribute('aria-label') || texto;
      return `${tag}${tipo ? `[type=${tipo}]` : ''}${elemento.id ? `#${elemento.id}` : ''}${
        classe ? `.${classe.trim().split(/\s+/)[0]}` : ''
      }${rotulo ? ` «${rotulo}»` : ''}`;
    };
    const eVisivel = (elemento: Element): boolean => {
      const estilo = getComputedStyle(elemento);
      if (estilo.visibility === 'hidden' || estilo.display === 'none' || estilo.opacity === '0')
        return false;
      if (elemento.closest('[hidden]')) return false;
      const caixa = elemento.getBoundingClientRect();
      return caixa.width > 0 && caixa.height > 0;
    };
    const janela = window.innerWidth;
    const maisLargos: { descricao: string; direita: number }[] = [];
    for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
      if (!eVisivel(elemento)) continue;
      const direita = Math.round(elemento.getBoundingClientRect().right * 100) / 100;
      if (direita > janela + 0.5) maisLargos.push({ descricao: descreve(elemento), direita });
    }
    maisLargos.sort((a, b) => b.direita - a.direita);
    return {
      documentoScrollWidth: document.documentElement.scrollWidth,
      documentoClientWidth: document.documentElement.clientWidth,
      janelaInnerWidth: janela,
      corpoScrollWidth: document.body.scrollWidth,
      excesso: document.documentElement.scrollWidth - janela,
      maisLargos: maisLargos.slice(0, 5),
    };
  });
}

export async function medirAlvos(pagina: Page): Promise<Alvo[]> {
  return pagina.evaluate((seletor) => {
    const descreve = (elemento: Element): string => {
      const tag = elemento.tagName.toLowerCase();
      const tipo = elemento.getAttribute('type');
      const classe = elemento.getAttribute('class');
      const texto = (elemento.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const rotulo = elemento.getAttribute('aria-label') || texto;
      return `${tag}${tipo ? `[type=${tipo}]` : ''}${elemento.id ? `#${elemento.id}` : ''}${
        classe ? `.${classe.trim().split(/\s+/)[0]}` : ''
      }${rotulo ? ` «${rotulo}»` : ''}`;
    };
    const eVisivel = (elemento: Element): boolean => {
      const estilo = getComputedStyle(elemento);
      if (estilo.visibility === 'hidden' || estilo.display === 'none' || estilo.opacity === '0')
        return false;
      if (elemento.closest('[hidden]')) return false;
      const caixa = elemento.getBoundingClientRect();
      return caixa.width > 0 && caixa.height > 0;
    };
    const alvos: { descricao: string; largura: number; altura: number }[] = [];
    for (const elemento of Array.from(document.querySelectorAll(seletor))) {
      if (!eVisivel(elemento)) continue;
      const caixa = elemento.getBoundingClientRect();
      alvos.push({
        descricao: descreve(elemento),
        largura: Math.round(caixa.width * 100) / 100,
        altura: Math.round(caixa.height * 100) / 100,
      });
    }
    return alvos;
  }, SELETOR_INTERATIVO);
}

export async function medirCampos(pagina: Page): Promise<Campo[]> {
  return pagina.evaluate((seletor) => {
    const descreve = (elemento: Element): string => {
      const tag = elemento.tagName.toLowerCase();
      const tipo = elemento.getAttribute('type');
      return `${tag}${tipo ? `[type=${tipo}]` : ''}${elemento.id ? `#${elemento.id}` : ''}`;
    };
    const eVisivel = (elemento: Element): boolean => {
      const estilo = getComputedStyle(elemento);
      if (estilo.visibility === 'hidden' || estilo.display === 'none' || estilo.opacity === '0')
        return false;
      if (elemento.closest('[hidden]')) return false;
      const caixa = elemento.getBoundingClientRect();
      return caixa.width > 0 && caixa.height > 0;
    };
    const campos: { descricao: string; rotulo: string; temRotulo: boolean; inputmode: string }[] =
      [];
    for (const elemento of Array.from(document.querySelectorAll(seletor))) {
      if (!eVisivel(elemento)) continue;
      const campo = elemento as HTMLInputElement;
      const associados = Array.from(campo.labels ?? [])
        .map((etiqueta) => (etiqueta.textContent || '').trim())
        .filter(Boolean);
      const porId = campo.getAttribute('aria-labelledby');
      const referido = porId ? (document.getElementById(porId)?.textContent || '').trim() : '';
      const rotulo = associados.join(' / ') || campo.getAttribute('aria-label') || referido;
      campos.push({
        descricao: descreve(campo),
        rotulo,
        temRotulo: rotulo.length > 0,
        inputmode: campo.getAttribute('inputmode') || '',
      });
    }
    return campos;
  }, SELETOR_CAMPO);
}

/**
 * Percorre a ordem de tabulação e descreve a indicação visual de cada parada.
 *
 * Dois cuidados que mudam o resultado:
 *
 * - O ponto de partida da navegação sequencial é o último elemento focado, não o topo do
 *   documento. Sem zerar isso, a varredura começa no meio da página — ou termina de imediato,
 *   se o último clique tiver sido no último controle. Por isso o foco vai para o `body` antes.
 * - O campo de data do Chromium tem segmentos internos (dia, mês, ano e o botão do calendário)
 *   que consomem Tab mantendo o mesmo `activeElement`. A última dessas paradas sai do elemento
 *   e o contorno some. As paradas são agregadas por elemento: o elemento conta como focado de
 *   forma visível se em alguma parada sua a indicação apareceu.
 */
export async function percorrerFoco(pagina: Page, paradas: number): Promise<Foco[]> {
  await pagina.evaluate(() => {
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement) ativo.blur();
    document.body.tabIndex = -1;
    document.body.focus();
    window.scrollTo(0, 0);
  });
  const vistos: Foco[] = [];
  const porElemento = new Map<string, Foco>();
  for (let passo = 0; passo < paradas; passo += 1) {
    await pagina.keyboard.press('Tab');
    const parada = await pagina.evaluate(() => {
      const ativo = document.activeElement;
      if (!ativo || ativo === document.body || !(ativo instanceof HTMLElement)) return null;
      const tag = ativo.tagName.toLowerCase();
      const tipo = ativo.getAttribute('type');
      const texto = (ativo.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const rotulo = ativo.getAttribute('aria-label') || texto;
      const estilo = getComputedStyle(ativo);
      const espessura = Number.parseFloat(estilo.outlineWidth) || 0;
      const transparente =
        estilo.outlineColor === 'transparent' || /,\s*0\)$/.test(estilo.outlineColor);
      const porContorno = estilo.outlineStyle !== 'none' && espessura >= 1 && !transparente;
      const porSombra = estilo.boxShadow !== 'none' && estilo.boxShadow !== '';
      return {
        descricao: `${tag}${tipo ? `[type=${tipo}]` : ''}${ativo.id ? `#${ativo.id}` : ''}${
          rotulo ? ` «${rotulo}»` : ''
        }`,
        contorno: estilo.outlineStyle,
        espessura,
        cor: estilo.outlineColor,
        sombra: estilo.boxShadow,
        visivel: porContorno || porSombra,
      };
    });
    if (!parada) break;
    const anterior = porElemento.get(parada.descricao);
    if (anterior) {
      if (parada.visivel && !anterior.visivel) Object.assign(anterior, parada);
      // Voltou ao primeiro elemento depois de já ter passado por outros: a ordem deu a volta.
      if (vistos.length > 1 && parada.descricao === vistos[0].descricao) break;
      continue;
    }
    porElemento.set(parada.descricao, parada);
    vistos.push(parada);
  }
  await pagina.evaluate(() => {
    document.body.removeAttribute('tabindex');
  });
  return vistos;
}
