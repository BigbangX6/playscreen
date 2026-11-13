"""Manette Xbox virtuelle permanente pour les tests (ViGEmBus + vgamepad).

La manette reste branchée tant que ce serveur tourne. On lui envoie des suites de
commandes séparées par des espaces, en POST sur http://127.0.0.1:47901/ :

    a b x y up down left right start select lb rb ls rs   appui bref (120 ms)
    sely selx selstart                                    Select + Y / X / Start ensemble
    hold:a:800                                            maintenir un bouton 800 ms
    lt rt                                                 gâchette appuyée brièvement
    lstick:x,y,ms  rstick:x,y,ms                          stick (-1 à 1) pendant ms
    wait:ms                                               pause

Exemple : curl -d "down down a wait:500 b" http://127.0.0.1:47901/

Lancer avec le Python 3.12 de l'utilisateur :
    %LOCALAPPDATA%\\Programs\\Python\\Python312\\python.exe -I tools\\banc\\pad_server.py
"""

import http.server
import threading
import time

import vgamepad as vg

B = vg.XUSB_BUTTON
BUTTONS = {
    "a": B.XUSB_GAMEPAD_A,
    "b": B.XUSB_GAMEPAD_B,
    "x": B.XUSB_GAMEPAD_X,
    "y": B.XUSB_GAMEPAD_Y,
    "up": B.XUSB_GAMEPAD_DPAD_UP,
    "down": B.XUSB_GAMEPAD_DPAD_DOWN,
    "left": B.XUSB_GAMEPAD_DPAD_LEFT,
    "right": B.XUSB_GAMEPAD_DPAD_RIGHT,
    "start": B.XUSB_GAMEPAD_START,
    "select": B.XUSB_GAMEPAD_BACK,
    "lb": B.XUSB_GAMEPAD_LEFT_SHOULDER,
    "rb": B.XUSB_GAMEPAD_RIGHT_SHOULDER,
    "ls": B.XUSB_GAMEPAD_LEFT_THUMB,
    "rs": B.XUSB_GAMEPAD_RIGHT_THUMB,
}
COMBOS = {"sely": ["select", "y"], "selx": ["select", "x"], "selstart": ["select", "start"]}
PRESS_MS = 120
GAP_MS = 180

pad = vg.VX360Gamepad()
lock = threading.Lock()


def press(names, ms=PRESS_MS):
    for n in names:
        pad.press_button(BUTTONS[n])
    pad.update()
    time.sleep(ms / 1000)
    for n in names:
        pad.release_button(BUTTONS[n])
    pad.update()


def run(sequence: str):
    for cmd in sequence.split():
        if cmd in BUTTONS:
            press([cmd])
        elif cmd in COMBOS:
            press(COMBOS[cmd])
        elif cmd.startswith("hold:"):
            _, name, ms = cmd.split(":")
            press(COMBOS.get(name, [name]), int(ms))
        elif cmd in ("lt", "rt"):
            setter = pad.left_trigger_float if cmd == "lt" else pad.right_trigger_float
            setter(1.0)
            pad.update()
            time.sleep(PRESS_MS / 1000)
            setter(0.0)
            pad.update()
        elif cmd.startswith(("lstick:", "rstick:")):
            kind, args = cmd.split(":")
            x, y, ms = args.split(",")
            setter = pad.left_joystick_float if kind == "lstick" else pad.right_joystick_float
            setter(float(x), float(y))
            pad.update()
            time.sleep(int(ms) / 1000)
            setter(0.0, 0.0)
            pad.update()
        elif cmd.startswith("wait:"):
            time.sleep(int(cmd[5:]) / 1000)
            continue
        else:
            raise ValueError(f"commande inconnue : {cmd}")
        time.sleep(GAP_MS / 1000)


class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        try:
            with lock:
                run(body)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
        except Exception as e:  # réponse lisible pour le banc de test
            self.send_response(400)
            self.end_headers()
            self.wfile.write(str(e).encode())

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    pad.reset()
    pad.update()
    http.server.ThreadingHTTPServer(("127.0.0.1", 47901), Handler).serve_forever()
