"""Ajusta o desenho do circunflexo de â, ê e ô no subconjunto latino distribuído."""

from argparse import ArgumentParser
from pathlib import Path

from fontTools.ttLib import TTFont


def ajustar(origem: Path, destino: Path) -> None:
    # Unidades da fonte, em que 1000 = 1 em. Altera só o último contorno.
    deslocamento_horizontal = {"â": 22, "ê": -24, "ô": 0}

    with TTFont(origem, recalcTimestamp=False) as fonte:
        nomes = fonte.getBestCmap()
        glifos = fonte["glyf"]
        for letra, horizontal in deslocamento_horizontal.items():
            glifo = glifos[nomes[ord(letra)]]
            inicio = glifo.endPtsOfContours[-2] + 1
            acento = glifo.coordinates[inicio:]
            base_acento = min(y for _, y in acento)
            if base_acento < 470:
                raise ValueError(f"Contorno do circunflexo fora da posição esperada: {letra}")
            centro = (min(x for x, _ in acento) + max(x for x, _ in acento)) / 2
            # Mantém a forma de circunflexo nos títulos de 20 a 40 px.
            for indice, (x, y) in enumerate(acento, inicio):
                glifo.coordinates[indice] = (
                    round(centro + (x - centro) * 1.28 + horizontal),
                    round(420 + (y - base_acento) * 0.53),
                )
        fonte.save(destino)


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("original", type=Path)
    parser.add_argument("ajustada", type=Path)
    caminhos = parser.parse_args()
    ajustar(caminhos.original, caminhos.ajustada)
