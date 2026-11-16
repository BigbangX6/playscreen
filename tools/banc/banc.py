"""Banc de test de Playscreen : outils communs aux scénarios (tools/banc/scenarios_*.py).

- moteur : appels de l'API avec le jeton de %LOCALAPPDATA%\\Playscreen\\engine.json,
  événements (SSE) suivis dans un fil ;
- manette : suites de boutons envoyées à pad_server.py (manette Xbox virtuelle) ;
- Windows : fenêtre au premier plan, programmes lancés, mémoire, captures d'écran ;
- rapport : chaque vérification est notée (réussie / échouée, avec la raison) dans
  tools/banc/rapports/<date>.jsonl, et résumée à la fin.

Lancer avec le Python 3.12 de l'utilisateur (vgamepad, psutil, pywin32, Pillow) :
    %LOCALAPPDATA%\\Programs\\Python\\Python312\\python.exe -I tools\\banc\\<scénario>.py
"""

import ctypes
import datetime
import json
import os
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import psutil
import win32gui
import win32process
from PIL import ImageGrab

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Version installée (Program Files) si elle existe, sinon le paquet de développement.
INSTALLED = os.path.join(os.environ.get("ProgramW6432", r"C:\Program Files"), "Playscreen")
DIST = INSTALLED if os.path.exists(os.path.join(INSTALLED, "Playscreen.exe")) else os.path.join(ROOT, "dist", "Playscreen")
DATA = os.path.join(os.environ["LOCALAPPDATA"], "Playscreen")
REPORTS = os.path.join(os.path.dirname(__file__), "rapports")
PAD_URL = "http://127.0.0.1:47901/"

# Captures complètes avec l'affichage à 125 % : le processus doit être « DPI-aware ».
ctypes.windll.user32.SetProcessDPIAware()

# ——— Rapport ———

os.makedirs(REPORTS, exist_ok=True)
RUN = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
_results = []


def log(message):
    print(f"[{datetime.datetime.now():%H:%M:%S}] {message}", flush=True)


def check(name, ok, detail=""):
    """Note une vérification. Renvoie ok, pour enchaîner."""
    _results.append({"run": RUN, "at": time.time(), "check": name, "ok": bool(ok), "detail": str(detail)})
    with open(os.path.join(REPORTS, f"{RUN}.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(_results[-1], ensure_ascii=False) + "\n")
    log(f"{'OK ' if ok else 'ÉCHEC'} {name} {('— ' + str(detail)) if detail else ''}")
    return ok


def summary():
    passed = sum(r["ok"] for r in _results)
    log(f"Bilan : {passed}/{len(_results)} vérifications réussies")
    by_name = {}
    for r in _results:
        by_name.setdefault(r["check"], []).append(r["ok"])
    for name, oks in by_name.items():
        if not all(oks):
            log(f"  {name} : {sum(oks)}/{len(oks)}")
    return passed == len(_results)


# ——— Moteur ———

def engine():
    with open(os.path.join(DATA, "engine.json"), encoding="utf-8") as f:
        return json.load(f)


def api(method, path, timeout=30):
    """Appel de l'API ; renvoie (statut, corps décodé ou None)."""
    e = engine()
    url = f"http://127.0.0.1:{e['port']}/api/v0{path}"
    req = urllib.request.Request(url, method=method, data=b"" if method in ("POST", "DELETE") else None,
                                 headers={"Authorization": f"Bearer {e['token']}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            return r.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as err:
        body = err.read()
        try:
            return err.code, json.loads(body)
        except ValueError:
            return err.code, None


def q(params):
    return urllib.parse.urlencode(params)


def engine_ready():
    try:
        status, body = api("GET", "/status", timeout=3)
        return status == 200 and body and body.get("ready")
    except Exception:
        return False


def games():
    return api("GET", "/games")[1]


def game_by_name(name):
    for g in games():
        if g["name"].lower() == name.lower():
            return g
    return None


class Events:
    """Événements du moteur reçus en direct (SSE), avec l'heure de réception."""

    def __init__(self):
        self.items = []
        self._stop = False
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        while not self._stop:
            try:
                e = engine()
                url = f"http://127.0.0.1:{e['port']}/api/v0/events?access_token={e['token']}"
                with urllib.request.urlopen(url, timeout=3600) as r:
                    kind = None
                    for raw in r:
                        line = raw.decode("utf-8").rstrip("\r\n")
                        if line.startswith("event:"):
                            kind = line[6:].strip()
                        elif line.startswith("data:") and kind:
                            try:
                                data = json.loads(line[5:])
                            except ValueError:
                                data = line[5:]
                            self.items.append((time.time(), kind, data))
                            kind = None
            except Exception:
                time.sleep(1)

    def mark(self):
        return len(self.items)

    def wait(self, kind, since, predicate=lambda d: True, timeout=60):
        """Attend un événement reçu après `since` (renvoie ses données, ou None)."""
        end = time.time() + timeout
        while time.time() < end:
            for _, k, d in self.items[since:]:
                if k == kind and predicate(d):
                    return d
            time.sleep(0.2)
        return None

    def kinds(self, since):
        return [k for _, k, _ in self.items[since:]]


# ——— Manette ———

def pad(sequence):
    req = urllib.request.Request(PAD_URL, data=sequence.encode(), method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode()


def pad_ready():
    try:
        return pad("wait:1") == "ok"
    except Exception:
        return False


def start_pad():
    if pad_ready():
        return True
    py = os.path.join(os.environ["LOCALAPPDATA"], "Programs", "Python", "Python312", "pythonw.exe")
    subprocess.Popen([py, "-I", os.path.join(os.path.dirname(__file__), "pad_server.py")])
    return wait_until(pad_ready, 15)


# ——— Windows ———

def wait_until(condition, timeout=30, every=0.5):
    end = time.time() + timeout
    while time.time() < end:
        try:
            value = condition()
            if value:
                return value
        except Exception:
            pass
        time.sleep(every)
    return None


def foreground():
    """(titre, nom du programme) de la fenêtre au premier plan."""
    hwnd = win32gui.GetForegroundWindow()
    title = win32gui.GetWindowText(hwnd)
    try:
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        exe = psutil.Process(pid).name()
    except Exception:
        exe = "?"
    return title, exe


def playscreen_in_front():
    return foreground()[0] == "Playscreen"


def running(*names):
    """Noms (en minuscules) des programmes demandés qui tournent."""
    wanted = {n.lower() for n in names}
    return {p.info["name"].lower() for p in psutil.process_iter(["name"]) if (p.info["name"] or "").lower() in wanted}


LAUNCHER_PROCESSES = {
    "steam": ["steam.exe"],
    "epic": ["EpicGamesLauncher.exe"],
    "battlenet": ["Battle.net.exe"],
    "xbox": ["XboxPcApp.exe"],
}


def launchers_running():
    return {store for store, exes in LAUNCHER_PROCESSES.items() if running(*exes)}


def screenshot(name):
    path = os.path.join(REPORTS, f"{RUN}_{name}.png")
    ImageGrab.grab(all_screens=False).save(path)
    return path


def memory():
    """Mémoire (Mo, ensemble de travail et privée) de Playscreen et de ce qu'il lance."""
    groups = {"interface": [], "webview": [], "moteur": [], "navigateur moteur": [], "sentinelle": []}
    procs = {p.pid: p for p in psutil.process_iter(["name", "ppid"])}
    ui_pids = {pid for pid, p in procs.items() if (p.info["name"] or "").lower() == "playscreen.exe"}

    def descends_from_ui(p, depth=0):
        if depth > 6 or p is None:
            return False
        if p.pid in ui_pids:
            return True
        return descends_from_ui(procs.get(p.info["ppid"]), depth + 1)

    for pid, p in procs.items():
        name = (p.info["name"] or "").lower()
        key = None
        if name == "playscreen.exe":
            key = "interface"
        elif name == "msedgewebview2.exe" and descends_from_ui(p):
            key = "webview"
        elif name == "playnite.desktopapp.exe":
            key = "moteur"
        elif name.startswith("playnite.browserprocess") or name.startswith("cefsharp"):
            key = "navigateur moteur"
        elif name == "playscreen-sentinel.exe":
            key = "sentinelle"
        if key:
            try:
                m = p.memory_full_info()
                groups[key].append((m.rss, getattr(m, "private", m.uss)))
            except Exception:
                pass
    result = {k: {"processus": len(v), "travail_mo": round(sum(a for a, _ in v) / 2**20), "privee_mo": round(sum(b for _, b in v) / 2**20)} for k, v in groups.items()}
    result["total_privee_mo"] = sum(g["privee_mo"] for g in result.values() if isinstance(g, dict))
    return result


# ——— Démarrage de Playscreen ———

def start_engine():
    if engine_ready():
        return True
    subprocess.Popen(["cmd", "/c", os.path.join(DIST, "start-engine.cmd")], creationflags=subprocess.CREATE_NO_WINDOW)
    return wait_until(engine_ready, 90, 1)


def start_sentinel():
    if running("playscreen-sentinel.exe"):
        return True
    subprocess.Popen([os.path.join(DIST, "Sentinelle", "playscreen-sentinel.exe")])
    return wait_until(lambda: running("playscreen-sentinel.exe"), 10)


def open_playscreen():
    """Select + Y jusqu'à ce que Playscreen soit devant (lancé ou ramené)."""
    for _ in range(3):
        pad("sely")
        if wait_until(playscreen_in_front, 20):
            time.sleep(1.5)
            return True
    return False


def setup():
    ok = start_pad() and start_engine() and start_sentinel()
    check("préparation (manette virtuelle, moteur, sentinelle)", ok)
    return ok


def stop_engine():
    exe = os.path.join(DIST, "Playnite", "Playnite.DesktopApp.exe")
    if running("playnite.desktopapp.exe"):
        subprocess.run([exe, "--shutdown"], timeout=60)
        wait_until(lambda: not running("playnite.desktopapp.exe"), 30)
    for p in psutil.process_iter(["name"]):
        if (p.info["name"] or "").lower() == "playnite.desktopapp.exe":
            p.kill()


def deploy_bridge():
    """Arrête le moteur, copie la passerelle recompilée (dossier Release de bridge), redémarre."""
    import shutil
    stop_engine()
    src = os.path.join(ROOT, "bridge", "bin", "Release", "net462")
    dst = os.path.join(DIST, "Playnite", "Extensions", "Playscreen_Bridge")
    for name in os.listdir(src):
        if os.path.isfile(os.path.join(src, name)):
            shutil.copy2(os.path.join(src, name), dst)
    return start_engine()


def restart_playscreen():
    """Ferme Playscreen puis le rouvre par Select + Y : il repart de l'accueil, focus connu."""
    for p in psutil.process_iter(["name"]):
        if (p.info["name"] or "").lower() == "playscreen.exe":
            p.kill()
    wait_until(lambda: not running("playscreen.exe"), 10)
    time.sleep(1)
    return open_playscreen()


# ——— Launchers ———

LAUNCHER_EXES = {
    "steam": r"C:\Program Files (x86)\Steam\steam.exe",
    "epic": r"C:\Program Files (x86)\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe",
    "battlenet": r"C:\Program Files (x86)\Battle.net\Battle.net.exe",
}


def kill(*names):
    wanted = {n.lower() for n in names}
    for p in psutil.process_iter(["name"]):
        if (p.info["name"] or "").lower() in wanted:
            try:
                p.kill()
            except Exception:
                pass


def close_launcher(store):
    if store == "steam" and running("steam.exe"):
        subprocess.Popen([LAUNCHER_EXES["steam"], "-shutdown"])
        if not wait_until(lambda: not running("steam.exe"), 40):
            kill("steam.exe", "steamwebhelper.exe")
    elif store == "epic":
        kill("EpicGamesLauncher.exe", "EpicWebHelper.exe")
    elif store == "battlenet":
        kill("Battle.net.exe")
    return wait_until(lambda: store not in launchers_running(), 20)


def start_launcher(store, settle=25):
    """Démarre le launcher (réduit si possible) et lui laisse le temps d'être prêt."""
    if store in launchers_running():
        return True
    args = {"steam": ["-silent"], "epic": ["-silent"], "battlenet": []}[store]
    subprocess.Popen([LAUNCHER_EXES[store]] + args)
    ok = wait_until(lambda: store in launchers_running(), 30)
    time.sleep(settle)
    return ok


def game_processes(install_dir):
    """Processus dont l'exécutable est dans le dossier du jeu."""
    if not install_dir:
        return []
    prefix = install_dir.rstrip("\\").lower() + "\\"
    found = []
    for p in psutil.process_iter(["exe", "name"]):
        exe = (p.info["exe"] or "").lower()
        if exe.startswith(prefix):
            found.append(p.info["name"])
    return found


def game_in_front(install_dir):
    hwnd = win32gui.GetForegroundWindow()
    try:
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        exe = psutil.Process(pid).exe().lower()
    except Exception:
        return False
    if not install_dir:
        return False
    prefix = install_dir.rstrip("\\").lower() + "\\"
    if exe.startswith(prefix):
        return True
    # Appli du Microsoft Store : sa fenêtre appartient à ApplicationFrameHost, le jeu est dans
    # une fenêtre enfant.
    if exe.endswith("\\applicationframehost.exe"):
        found = []

        def child(h, _):
            try:
                _, cpid = win32process.GetWindowThreadProcessId(h)
                if psutil.Process(cpid).exe().lower().startswith(prefix):
                    found.append(h)
            except Exception:
                pass
            return True

        win32gui.EnumChildWindows(hwnd, child, None)
        return bool(found)
    return False


def cursor():
    return win32gui.GetCursorPos()


def stick_mouse_to(x, y, tolerance=15, tries=150):
    """Mode souris de la sentinelle : pousse le stick gauche jusqu'à amener le curseur en (x, y)."""
    for _ in range(tries):
        cx, cy = cursor()
        dx, dy = x - cx, y - cy
        if abs(dx) <= tolerance and abs(dy) <= tolerance:
            return True
        dist = max(abs(dx), abs(dy))
        # Pousser fort de loin, doucement de près (la sentinelle accélère avec l'inclinaison).
        strength = 1.0 if dist > 300 else 0.6 if dist > 80 else 0.45
        ms = 250 if dist > 300 else 120 if dist > 80 else 90
        sx, sy = dx / dist * strength, -dy / dist * strength  # stick : y vers le haut
        pad(f"lstick:{sx:.2f},{sy:.2f},{ms}")
    return False
