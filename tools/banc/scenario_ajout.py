"""Scénario : ajouter un jeu hors launcher à la manette, plusieurs fois.

Chaque tour : accueil → Bibliothèque → onglet « Autre » (LB depuis « Tous ») → tuile
« Ajouter un jeu » → Parcourir → dossier du jeu → fichier → « Ajouter ». Vérifie l'ajout
par l'API (bon fichier, icône, jaquette trouvée), puis le retire. Un tour sur deux passe par
les Suggestions (raccourci .lnk posé sur le Bureau) au lieu de Parcourir.

    python -I tools\\banc\\scenario_ajout.py [tours]
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I : dossier du script hors du chemin
import banc  # noqa: E402

GAMES = [
    (r"C:\Games\Shattered Pixel Dungeon", "Shattered Pixel Dungeon.exe"),
    (r"C:\Games\OpenTTD\openttd-15.3-windows-win64", "openttd.exe"),
]
DESKTOP = os.path.join(os.environ["USERPROFILE"], "Desktop")


def make_shortcut(target, name):
    """Raccourci .lnk sur le Bureau (comme le laisse un installateur de jeu)."""
    import win32com.client
    path = os.path.join(DESKTOP, name + ".lnk")
    link = win32com.client.Dispatch("WScript.Shell").CreateShortcut(path)
    link.TargetPath = target
    link.WorkingDirectory = os.path.dirname(target)
    link.Save()
    return path


def remove_existing(path):
    for g in banc.games():
        if g["store"] == "other" and g.get("installDirectory", "").lower() == os.path.dirname(path).lower():
            banc.api("DELETE", f"/games/{g['id']}")


def go_add_screen():
    banc.restart_playscreen()
    time.sleep(2)
    # Onglet « Autre » : les applications déjà ajoutées, puis la tuile « Ajouter un jeu ».
    others = sum(1 for g in banc.games() if g["store"] == "other")
    banc.pad("down down " + "right " * 15 + "a wait:1500 lb wait:800 " + "right " * others + "a wait:2000")


def index_in(listing_path, wanted_path, with_parent_row=True):
    """Position d'une entrée dans la liste affichée (ligne « Dossier précédent » comprise)."""
    status, listing = banc.api("GET", "/files" + ("?" + banc.q({"path": listing_path}) if listing_path else ""))
    paths = [e["path"].rstrip("\\").lower() for e in listing["entries"]]
    offset = 1 if (with_parent_row and listing_path) else 0
    return offset + paths.index(wanted_path.rstrip("\\").lower())


def browse_and_add(folder, exe):
    """Parcourir : racine → Games (C:) → dossier(s) → fichier → Ajouter."""
    banc.pad("rb wait:1200")
    # Racine : la ligne « Games (C:) ».
    banc.pad("down " * index_in(None, r"C:\Games") + "a wait:1000")
    current = r"C:\Games"
    for part in os.path.relpath(folder, current).split(os.sep):
        nxt = os.path.join(current, part)
        banc.pad("down " * index_in(current, nxt) + "a wait:1000")
        current = nxt
    banc.pad("down " * index_in(current, os.path.join(current, exe)) + "a wait:1200")
    banc.screenshot("confirmation")
    banc.pad("a")


def suggest_and_add(lnk_name):
    status, candidates = banc.api("GET", "/apps/candidates")
    names = [c["name"] for c in candidates]
    banc.pad("down " * names.index(lnk_name) + "a wait:1200 a")


def one_round(n, events):
    folder, exe = GAMES[n % len(GAMES)]
    path = os.path.join(folder, exe)
    remove_existing(path)
    via_suggestion = n % 2 == 1
    lnk = None
    if via_suggestion:
        lnk = make_shortcut(path, "OpenTTD" if "openttd" in exe else os.path.splitext(exe)[0])
    mark = events.mark()
    go_add_screen()
    if via_suggestion:
        suggest_and_add(os.path.splitext(os.path.basename(lnk))[0])
    else:
        browse_and_add(folder, exe)
    added = events.wait("library.updated", mark, lambda d: d.get("added"), timeout=20)
    how = "suggestion .lnk" if via_suggestion else "parcourir"
    if not banc.check(f"ajout à la manette ({how})", added, exe):
        banc.screenshot(f"echec_ajout_{n}")
        return
    game_id = added["added"][0]
    status, game = banc.api("GET", f"/games/{game_id}")
    banc.check("ajouté comme jeu hors launcher, installé", status == 200 and game["store"] == "other" and game["installed"], game.get("name"))
    banc.check("dossier du jeu retenu", (game.get("installDirectory") or "").lower() == folder.lower(), game.get("installDirectory"))
    banc.check("icône de l'exécutable", (game.get("media") or {}).get("icon"))
    banc.check("page du jeu affichée après l'ajout", banc.wait_until(banc.playscreen_in_front, 5))
    cover = banc.wait_until(lambda: (banc.api("GET", f"/games/{game_id}")[1].get("media") or {}).get("cover"), 90, 2)
    banc.check("jaquette trouvée automatiquement", cover, banc.api("GET", f"/games/{game_id}")[1]["name"])
    banc.screenshot(f"page_jeu_{n}")
    status, _ = banc.api("DELETE", f"/games/{game_id}")
    banc.check("retiré de la bibliothèque", status == 204, status)
    if lnk and os.path.exists(lnk):
        os.remove(lnk)


def main():
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    if not banc.setup():
        return
    events = banc.Events()
    time.sleep(1)
    banc.check("Playscreen ouvert par Select + Y", banc.open_playscreen())
    for n in range(rounds):
        banc.log(f"— Tour {n + 1}/{rounds}")
        one_round(n, events)
    banc.summary()


if __name__ == "__main__":
    main()
