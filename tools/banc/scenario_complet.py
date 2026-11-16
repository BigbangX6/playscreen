"""Scénario complet d'une partie, jeux enchaînés (série du 16 novembre 2026).

Pour chaque jeu :
  1. les autres launchers ouverts (ils doivent être fermés au lancement) ;
  2. lancement, jeu au premier plan, autres launchers fermés, mémoire de Playscreen ;
  3. jeu Steam : Select + Y → « Menu Steam » (menu manette de Steam), puis B pour le fermer ;
  4. Select + Y → Spotify (ou Discord, un jeu sur deux) depuis le centre rapide : la page
     s'ouvre devant ; Select + Y → retour au centre rapide → « Reprendre » : le jeu revient ;
  5. Select + Y → « Quitter le jeu » : fin de partie, plus aucun processus du jeu, retour sur
     Playscreen. Le jeu suivant est lancé aussitôt (jeux enchaînés).

    python -I tools\\banc\\scenario_complet.py "Among Us" "Fall Guys" ...
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I : dossier du script hors du chemin
import banc  # noqa: E402
from scenario_lancement import STORES_WITH_LAUNCHER, prepare  # noqa: E402

BROWSER_TITLE = "Playscreen – navigateur"


def in_front(install_dir):
    return banc.game_in_front(install_dir) if install_dir else not banc.playscreen_in_front()


def still_running(game, label, step):
    """La partie est-elle toujours en cours (sinon les appuis suivants iraient ailleurs) ?"""
    session = banc.api("GET", "/session")[1]
    ok = bool(session) and session.get("gameId") == game["id"]
    banc.check(f"{label} : partie toujours en cours avant {step}", ok, session)
    return ok


def back_to_quick_menu(label):
    banc.pad("sely")
    ok = banc.wait_until(banc.playscreen_in_front, 10)
    time.sleep(1.5)
    return banc.check(f"{label} : Select + Y ramène Playscreen (centre rapide)", ok, banc.foreground())


def one_game(game, index, events):
    store = game["store"]
    steam = store == "steam"
    install_dir = game.get("installDirectory")
    label = f"{game['name']} [{store}]"
    banc.log(f"— {label}")
    prepare(store, launcher_open=index % 2 == 1)
    if not banc.playscreen_in_front():
        banc.open_playscreen()
    before = banc.launchers_running()

    mark = events.mark()
    banc.api("POST", f"/games/{game['id']}/start")
    started = events.wait("game.started", mark, lambda d: d.get("gameId") == game["id"], 240)
    if not banc.check(f"{label} : partie démarrée", started):
        banc.screenshot(f"complet_echec_demarrage_{index}")
        banc.api("POST", f"/games/{game['id']}/stop?force=true")
        return
    t0 = time.time()
    front = banc.wait_until(lambda: in_front(install_dir), 90)
    banc.check(f"{label} : jeu au premier plan", front, f"{time.time() - t0:.0f} s, devant : {banc.foreground()}")
    time.sleep(15)
    still = banc.launchers_running() & {s for s in before if s != store}
    banc.check(f"{label} : autres launchers fermés", not still, f"avant {sorted(before)}, encore ouverts {sorted(still)}")
    time.sleep(max(0, 30 - (time.time() - t0)))
    mem = banc.memory()
    occupied = sum(g["travail_mo"] for g in mem.values() if isinstance(g, dict))
    banc.check(f"{label} : mémoire occupée par Playscreen en jeu < 400 Mo", occupied < 400, f"{occupied} Mo")
    banc.screenshot(f"complet_{index}_1_jeu")

    # Menu Steam (jeux Steam) : le menu manette de Steam s'ouvre par-dessus le jeu.
    if steam:
        if back_to_quick_menu(label):
            banc.pad("right wait:300 a")
            time.sleep(4)
            banc.screenshot(f"complet_{index}_2_menu_steam")
            banc.check(f"{label} : « Menu Steam » remet le jeu devant (menu Steam par-dessus)", in_front(install_dir), banc.foreground())
            # Un seul B : un second B arriverait dans le jeu (Worms se fermait).
            banc.pad("b")
            time.sleep(2)

    # Spotify ou Discord pendant la partie, puis retour et « Reprendre ».
    if not still_running(game, label, "le navigateur"):
        return
    # Spotify seulement : l'enchaînement vers « Ouvrir » de Discord passait parfois sur les
    # réglages du PC (sortie audio changée le 16/11) ; Discord est testé à part.
    site = "Spotify"
    if back_to_quick_menu(label):
        # Discord et Spotify déjà ouverts en fond (cartes avec « × Fermer ») : bas → « Fermer »
        # de Discord, droite → « Fermer » de Spotify, bas → « Ouvrir » de Spotify (gauche :
        # celui de Discord).
        banc.pad("down wait:400 right wait:400 down wait:400 a")
        opened = banc.wait_until(lambda: banc.foreground()[0] == BROWSER_TITLE, 15)
        if not banc.check(f"{label} : {site} s'ouvre devant pendant la partie", opened, banc.foreground()):
            # Rien d'autre à l'aveugle (réglages du PC tout près) : on ferme le centre rapide.
            banc.screenshot(f"complet_echec_{site.lower()}_{index}")
            banc.pad("b")
            time.sleep(2)
            opened = None
        time.sleep(6)
        banc.screenshot(f"complet_{index}_3_{site.lower()}")
        if opened and back_to_quick_menu(label):
            banc.screenshot(f"complet_{index}_4_retour")
            banc.pad("a")  # focus sur « Reprendre » à l'ouverture du centre rapide
            ok = banc.wait_until(lambda: in_front(install_dir), 15)
            banc.check(f"{label} : « Reprendre » après {site} remet le jeu devant", ok, banc.foreground())
            time.sleep(3)

    # Quitter le jeu depuis le menu en jeu.
    if not still_running(game, label, "Quitter"):
        return
    mark = events.mark()
    if back_to_quick_menu(label):
        banc.pad(("right wait:300 right wait:300 a") if steam else ("right wait:300 a"))
    stopped = events.wait("game.stopped", mark, lambda d: d.get("gameId") == game["id"], 60)
    if not banc.check(f"{label} : « Quitter le jeu » termine la partie", stopped):
        banc.screenshot(f"complet_echec_quitter_{index}")
        banc.api("POST", f"/games/{game['id']}/stop?force=true")
        events.wait("game.stopped", mark, timeout=30)
    banc.check(f"{label} : retour sur Playscreen", banc.wait_until(banc.playscreen_in_front, 15), banc.foreground())
    time.sleep(4)
    left = banc.game_processes(install_dir) if install_dir else []
    banc.check(f"{label} : plus aucun processus du jeu", not left, left)


def main():
    names = sys.argv[1:] or ["Among Us"]
    if not banc.setup():
        return
    events = banc.Events()
    time.sleep(1)
    banc.open_playscreen()
    for index, name in enumerate(names):
        game = banc.game_by_name(name)
        if not banc.check(f"jeu trouvé et installé : {name}", game and game["installed"]):
            continue
        try:
            one_game(game, index, events)
        except Exception as e:  # un jeu raté ne doit pas arrêter les suivants
            banc.check(f"{name} : sans erreur du banc", False, repr(e))
    banc.summary()


if __name__ == "__main__":
    main()
