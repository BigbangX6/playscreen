"""Scénario : lancer un jeu, menu en jeu, quitter ; répété pour chaque jeu de la liste.

Pour chaque tour :
  1. état de départ : les AUTRES launchers ouverts (pour vérifier qu'ils sont fermés au
     lancement), le launcher du jeu fermé ou ouvert (un tour sur deux) ;
  2. Playscreen redémarré, le jeu lancé à la manette depuis l'accueil (première tuile =
     dernier jeu joué ; le tout premier tour d'un jeu passe par l'API pour le placer là) ;
  3. vérifications : démarrage, jeu au premier plan, autres launchers fermés, launcher du
     jeu gardé, mémoire de Playscreen pendant la partie ;
  4. Select + Y → menu en jeu → B (Reprendre), deux fois ;
  5. Select + Y → « Quitter le jeu » : fin de partie, retour sur Playscreen, plus aucun
     processus du jeu. Sinon « Forcer la fermeture ».

    python -I tools\\banc\\scenario_lancement.py <tours par jeu> "Among Us" "Unrailed" ...
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I : dossier du script hors du chemin
import banc  # noqa: E402

STORES_WITH_LAUNCHER = ["steam", "epic", "battlenet"]


def prepare(store, launcher_open):
    """Autres launchers ouverts ; celui du jeu ouvert ou fermé."""
    for other in STORES_WITH_LAUNCHER:
        if other != store:
            banc.start_launcher(other, settle=0)
    if store in STORES_WITH_LAUNCHER:
        if launcher_open:
            banc.start_launcher(store)
        else:
            banc.close_launcher(store)
    time.sleep(10)  # launchers démarrés : leurs fenêtres s'ouvrent puis se réduisent


def most_recent(game_id):
    played = [g for g in banc.games() if g.get("lastPlayed")]
    played.sort(key=lambda g: g["lastPlayed"], reverse=True)
    return bool(played) and played[0]["id"] == game_id


def launch(game, events, label):
    mark = events.mark()
    banc.restart_playscreen()
    time.sleep(2)
    via_pad = most_recent(game["id"])
    if via_pad:
        # Une fenêtre de launcher qui démarre peut voler le premier plan : Playscreen d'abord.
        if not banc.playscreen_in_front():
            banc.open_playscreen()
        # Accueil : focus sur la première tuile (dernier jeu joué), A = « Jouer ».
        banc.pad("a")
    else:
        banc.api("POST", f"/games/{game['id']}/start")
    banc.check(f"{label} : lancement demandé ({'manette' if via_pad else 'API'})",
               events.wait("game.starting", mark, lambda d: d.get("gameId") == game["id"], 20))
    return mark


def one_round(game, n, events):
    store = game["store"]
    launcher_open = n % 2 == 1
    label = f"{game['name']} [{store}, launcher {'ouvert' if launcher_open else 'fermé'}]"
    banc.log(f"— {label}, tour {n + 1}")
    prepare(store, launcher_open)
    before = banc.launchers_running()
    mark = launch(game, events, label)
    started = events.wait("game.started", mark, lambda d: d.get("gameId") == game["id"], 240)
    if not banc.check(f"{label} : partie démarrée", started):
        banc.screenshot(f"echec_demarrage_{n}")
        banc.api("POST", f"/games/{game['id']}/stop?force=true")
        return
    t0 = time.time()
    install_dir = game.get("installDirectory")
    front = banc.wait_until(lambda: banc.game_in_front(install_dir), 60) if install_dir else banc.wait_until(lambda: not banc.playscreen_in_front(), 60)
    banc.check(f"{label} : jeu au premier plan", front, f"{time.time() - t0:.0f} s, devant : {banc.foreground()}")
    time.sleep(15)
    others = {s for s in before if s != store}
    still = banc.launchers_running() & others
    banc.check(f"{label} : autres launchers fermés", not still, f"avant {sorted(before)}, encore ouverts {sorted(still)}")
    if store in STORES_WITH_LAUNCHER:
        banc.check(f"{label} : launcher du jeu gardé", store in banc.launchers_running())
    mem = banc.memory()
    banc.check(f"{label} : mémoire Playscreen en jeu (Mo, privée)", True, mem["total_privee_mo"])
    banc.screenshot(f"en_jeu_{n}")

    for i in range(2):
        banc.pad("sely")
        banc.check(f"{label} : Select + Y ramène Playscreen", banc.wait_until(banc.playscreen_in_front, 10))
        time.sleep(1.5)
        banc.pad("b")
        ok = banc.wait_until(lambda: banc.game_in_front(install_dir) if install_dir else not banc.playscreen_in_front(), 10)
        banc.check(f"{label} : Reprendre remet le jeu devant", ok, banc.foreground())
        time.sleep(2)

    mark = events.mark()
    banc.pad("sely")
    banc.wait_until(banc.playscreen_in_front, 10)
    time.sleep(1.5)
    banc.pad("right wait:300 a")  # « Reprendre » → « Quitter le jeu »
    stopped = events.wait("game.stopped", mark, lambda d: d.get("gameId") == game["id"], 45)
    if not banc.check(f"{label} : « Quitter le jeu » termine la partie", stopped):
        banc.screenshot(f"echec_quitter_{n}")
        # « Forcer la fermeture » (menu toujours ouvert), puis confirmer (focus sur « Annuler »).
        banc.pad("sely wait:1500 right right wait:300 a wait:1000")
        banc.screenshot(f"forcer_{n}")
        banc.pad("left wait:300 a")
        banc.check(f"{label} : « Forcer la fermeture » termine la partie", events.wait("game.stopped", mark, timeout=30))
    banc.check(f"{label} : retour sur Playscreen", banc.wait_until(banc.playscreen_in_front, 15), banc.foreground())
    time.sleep(3)
    left = banc.game_processes(install_dir)
    banc.check(f"{label} : plus aucun processus du jeu", not left, left)


def main():
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    names = sys.argv[2:] or ["Among Us"]
    if not banc.setup():
        return
    events = banc.Events()
    time.sleep(1)
    for name in names:
        game = banc.game_by_name(name)
        if not banc.check(f"jeu trouvé : {name}", game and game["installed"]):
            continue
        for n in range(rounds):
            try:
                one_round(game, n, events)
            except Exception as e:  # un tour raté ne doit pas arrêter les suivants
                banc.check(f"{name} : tour {n + 1} sans erreur du banc", False, repr(e))
    banc.summary()


if __name__ == "__main__":
    main()
