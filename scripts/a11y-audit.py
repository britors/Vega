#!/usr/bin/env python3
"""Audita a árvore AT-SPI do vega-gtk em execução: percorre todos os
widgets e reporta quais elementos interativos (botões, entradas, itens de
lista, etc.) não têm nome acessível — a causa mais comum de um leitor de
tela anunciar "botão" sem dizer qual botão é.

Não substitui o roteiro manual (navegação real por teclado, Orca ouvido
por um humano, contraste, escala) — ver docs/migration/rust-gtk-qa.md —
mas cobre automaticamente a checagem mais objetiva e mais comum de pegar:
nome acessível ausente em elemento focável.

Uso:
  ./vega-gtk/target/release/vega-gtk &
  sleep 2
  python3 scripts/a11y-audit.py

Exige python3-gi com o typelib do Atspi (pacote costuma se chamar
python3-gobject ou python3-gi, mais at-spi2-core) e a app rodando com o
barramento AT-SPI ativo (padrão numa sessão GNOME normal).
"""
import sys

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

INTERACTIVE_ROLES = {
    "push button",
    "toggle button",
    "radio button",
    "check box",
    "menu item",
    "list item",
    "entry",
    "combo box",
    "link",
}


def audit(acc, depth, unnamed, verbose):
    try:
        role = acc.get_role_name()
    except Exception:
        return
    try:
        name = (acc.get_name() or "").strip()
    except Exception:
        name = ""
    if verbose:
        print("  " * depth + f"[{role}] name={name!r}")
    if role in INTERACTIVE_ROLES and not name:
        unnamed.append((role, depth))
    try:
        count = acc.get_child_count()
    except Exception:
        count = 0
    for i in range(count):
        try:
            child = acc.get_child_at_index(i)
        except Exception:
            continue
        if child is not None:
            audit(child, depth + 1, unnamed, verbose)


def main():
    verbose = "-v" in sys.argv[1:]
    Atspi.init()
    desktop = Atspi.get_desktop(0)
    app = None
    for i in range(desktop.get_child_count()):
        candidate = desktop.get_child_at_index(i)
        if candidate is not None and "vega" in (candidate.get_name() or "").lower():
            app = candidate
            break

    if app is None:
        print("Nenhum app com 'vega' no nome encontrado no barramento AT-SPI.", file=sys.stderr)
        print("A UI está rodando e com foco numa sessão com suporte a AT-SPI?", file=sys.stderr)
        return 2

    unnamed = []
    audit(app, 0, unnamed, verbose)

    if unnamed:
        print(f"FALHOU: {len(unnamed)} elemento(s) interativo(s) sem nome acessível:")
        for role, depth in unnamed:
            print(f"  profundidade {depth}: [{role}]")
        return 1

    print("OK: nenhum elemento interativo sem nome acessível.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
