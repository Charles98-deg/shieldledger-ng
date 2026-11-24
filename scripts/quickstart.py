#!/usr/bin/env python3
"""One-paste quickstart for Windows, macOS and Linux. Standard library only.

    python scripts/quickstart.py          set up (skipping what is done) and start API + UI
    python scripts/quickstart.py --test   set up, then run the backend test suite instead

Steps: check Python/Node versions, copy .env.example to .env if missing, create backend/.venv and
pip install, npm ci in frontend (falling back to npm install if it fails), seed the database, start the API on :8000 and the UI on :5173,
open the browser. Ctrl+C stops both servers. Safe to re-run.
"""
import argparse
import hashlib
import os
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

# The Windows console may not be UTF-8; never crash on "₦" or "→".
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

WINDOWS = os.name == "nt"
ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = BACKEND / ".venv"
VENV_PY = VENV / ("Scripts/python.exe" if WINDOWS else "bin/python")
DB = BACKEND / "shieldledger.db"
API_PORT, UI_PORT = 8000, 5173
UI_URL = "http://localhost:%d" % UI_PORT

MIN_PYTHON = (3, 11)
# Vite 5's engines field: "^18.0.0 || >=20.0.0" (Node 19 is not supported).
NODE_RULE = "18.x or 20+"


def say(msg):
    print("==> " + msg, flush=True)


def fail(msg):
    print("\nERROR: " + msg, file=sys.stderr, flush=True)
    sys.exit(1)


def child_env():
    env = dict(os.environ)
    env.setdefault("APP_ENV", "dev")
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def run(cmd, cwd, shell=False):
    """Run a command, stream its output, stop with a clear message if it fails."""
    shown = cmd if isinstance(cmd, str) else " ".join(str(c) for c in cmd)
    try:
        subprocess.run(cmd, cwd=str(cwd), check=True, shell=shell, env=child_env())
    except FileNotFoundError:
        fail("could not run: %s" % shown)
    except subprocess.CalledProcessError as e:
        fail("this step failed (exit %s): %s" % (e.returncode, shown))


def run_logged(cmd, cwd, shell=False):
    """Run a command, stream its output live and also keep all of it. Returns (exit code, output)."""
    shown = cmd if isinstance(cmd, str) else " ".join(str(c) for c in cmd)
    try:
        proc = subprocess.Popen(cmd, cwd=str(cwd), shell=shell, env=child_env(), stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    except FileNotFoundError:
        fail("could not run: %s" % shown)
    lines = []
    for line in proc.stdout:
        print(line, end="", flush=True)
        lines.append(line)
    return proc.wait(), "".join(lines)


def print_full_output(title, output):
    """Reprint a failed step's complete output in one block, so the first error is not lost in scrollback."""
    bar = "-" * 60
    print("\n%s\n%s\n%s" % (bar, title, bar), file=sys.stderr)
    print(output.rstrip() or "(no output)", file=sys.stderr)
    print(bar, file=sys.stderr, flush=True)


def digest(*files):
    h = hashlib.sha256()
    for f in files:
        h.update(f.read_bytes() if f.exists() else b"")
    return h.hexdigest()


# --- checks -----------------------------------------------------------------------------------

def check_python():
    if sys.version_info < MIN_PYTHON:
        fail("Python %d.%d+ is needed; this is %s.\n  Install it from https://www.python.org/downloads/ "
             "(Windows: winget install Python.Python.3.12) and run the command again."
             % (MIN_PYTHON + (sys.version.split()[0],)))
    say("Python %s OK" % sys.version.split()[0])


def npm(*args):
    """npm command + shell flag. On Windows npm is npm.cmd, which only a shell finds."""
    if WINDOWS:
        return " ".join(("npm",) + args), True
    return ["npm", *args], False


def check_node():
    node = shutil.which("node")
    if not node:
        fail("Node.js %s is needed but `node` was not found.\n  Install the LTS from https://nodejs.org/ "
             "(Windows: winget install OpenJS.NodeJS.LTS), open a new terminal and run again." % NODE_RULE)
    out = subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip()
    try:
        major = int(out.lstrip("v").split(".")[0])
    except ValueError:
        fail("could not read the Node version from %r" % out)
    if major < 18 or major == 19:
        fail("Node %s is needed for Vite; this is %s.\n  Install the LTS from https://nodejs.org/ "
             "(Windows: winget install OpenJS.NodeJS.LTS)." % (NODE_RULE, out))
    if not shutil.which("npm"):
        fail("`npm` was not found. It ships with Node.js; reinstall Node from https://nodejs.org/.")
    say("Node %s OK" % out)


# --- setup steps (each skips itself when already done) ----------------------------------------

def ensure_env_file():
    env, example = ROOT / ".env", ROOT / ".env.example"
    if env.exists():
        say(".env present, keeping it")
    elif example.exists():
        shutil.copyfile(example, env)
        say("copied .env.example to .env (no API key needed)")


def ensure_venv():
    reqs = [BACKEND / "requirements.txt", BACKEND / "requirements-dev.txt"]
    marker = VENV / ".quickstart-reqs"
    want = digest(*reqs)
    if VENV_PY.exists() and marker.exists() and marker.read_text().strip() == want:
        say("backend/.venv up to date, skipping pip install")
        return
    if not VENV_PY.exists():
        say("creating backend/.venv")
        try:
            subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)
        except subprocess.CalledProcessError:
            hint = "" if WINDOWS else "\n  On Debian/Ubuntu: sudo apt install python3-venv (or python3.%d-venv)" % sys.version_info[1]
            fail("could not create the virtual environment." + hint)
    say("installing backend requirements (first run takes a minute)")
    run([str(VENV_PY), "-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", "requirements-dev.txt"], BACKEND)
    marker.write_text(want)


def ensure_node_modules():
    lock = FRONTEND / "package-lock.json"
    marker = FRONTEND / "node_modules" / ".quickstart-lock"
    want = digest(lock, FRONTEND / "package.json")
    if marker.exists() and marker.read_text().strip() == want:
        say("frontend/node_modules up to date, skipping npm")
        return
    if lock.exists():
        say("npm ci in frontend (first run takes a minute)")
        argv, shell = npm("ci", "--no-audit", "--no-fund")
        code, output = run_logged(argv, FRONTEND, shell=shell)
        if code == 0:
            marker.write_text(want)
            return
        print_full_output("npm ci failed (exit %s). Full npm output:" % code, output)
        say("npm ci failed; falling back to npm install")
    else:
        say("no package-lock.json; running npm install in frontend (first run takes a minute)")
    argv, shell = npm("install", "--no-audit", "--no-fund")
    code, output = run_logged(argv, FRONTEND, shell=shell)
    if code != 0:
        print_full_output("npm install failed (exit %s). Full npm output:" % code, output)
        fail("npm could not install the frontend packages; see the full npm output above.\n"
             "  If it says 'Class extends value undefined is not a constructor or null', npm itself is damaged:\n"
             "  reinstall Node.js LTS from https://nodejs.org/ (or run its installer and choose Repair),\n"
             "  open a new terminal and run again.")
    say("npm install succeeded")
    # npm install may rewrite package-lock.json, so record the digest it leaves behind.
    marker.write_text(digest(lock, FRONTEND / "package.json"))


def db_seeded():
    if not DB.exists():
        return False
    try:
        con = sqlite3.connect(str(DB))
        try:
            return con.execute("SELECT COUNT(*) FROM vendors").fetchone()[0] > 0
        finally:
            con.close()
    except sqlite3.Error:
        return False


def ensure_seed():
    if db_seeded():
        say("database already seeded, skipping")
        return
    say("seeding the database with the fictional master data")
    run([str(VENV_PY), "-m", "app.cli", "seed"], BACKEND)


# --- servers ----------------------------------------------------------------------------------

def port_busy(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def start(cmd, cwd, shell=False):
    kw = {"cwd": str(cwd), "env": child_env(), "shell": shell}
    if WINDOWS:
        kw["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kw["start_new_session"] = True  # own process group, so we can stop npm *and* vite
    return subprocess.Popen(cmd, **kw)


def _group_alive(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


def stop(proc):
    """Stop a server and everything it started (npm -> vite), and wait until all of it is gone."""
    if WINDOWS:
        if proc.poll() is None:
            # /T stops the whole tree (cmd.exe -> npm -> node).
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True)
        proc.wait()
        return
    # POSIX: the child leads its own process group; signal the group, not just the leader,
    # and wait for the whole group, since vite can outlive npm for a moment while it shuts down.
    pgid = proc.pid
    if _group_alive(pgid):
        os.killpg(pgid, signal.SIGTERM)
    end = time.time() + 10
    while _group_alive(pgid) and time.time() < end:
        proc.poll()  # reap the leader so it doesn't linger as a zombie
        time.sleep(0.1)
    if _group_alive(pgid):
        os.killpg(pgid, signal.SIGKILL)
    proc.wait()


def wait_http(url, procs, timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        for p in procs:
            if p.poll() is not None:
                return False
        try:
            with urllib.request.urlopen(url, timeout=2):
                return True
        except Exception:
            time.sleep(0.5)
    return False


def serve():
    for port, what in ((API_PORT, "API"), (UI_PORT, "UI")):
        if port_busy(port):
            fail("port %d (%s) is already in use. Stop whatever is running there "
                 "(perhaps an earlier quickstart) and run again." % (port, what))
    say("starting API on :%d and UI on :%d" % (API_PORT, UI_PORT))
    api = start([str(VENV_PY), "-m", "uvicorn", "app.main:app", "--port", str(API_PORT)], BACKEND)
    argv, shell = npm("run", "dev", "--", "--port", str(UI_PORT), "--strictPort")
    ui = start(argv, FRONTEND, shell=shell)
    procs = [api, ui]
    try:
        ok = wait_http("http://127.0.0.1:%d/api/health" % API_PORT, procs) and wait_http(UI_URL, procs)
        if not ok:
            fail("a server did not start; see the output above.")
        print("\n" + "=" * 60)
        print("  ShieldLedger NG is running at %s" % UI_URL)
        print("  Click Load demo pack")
        print("  Press Ctrl+C to stop both servers.")
        print("=" * 60 + "\n", flush=True)
        if not os.environ.get("QUICKSTART_NO_BROWSER"):
            webbrowser.open(UI_URL)
        while all(p.poll() is None for p in procs):
            time.sleep(0.5)
        say("a server exited; stopping the other one")
    except KeyboardInterrupt:
        print()
        say("stopping servers")
    finally:
        for p in procs:
            stop(p)
        say("stopped")


def main():
    ap = argparse.ArgumentParser(description="ShieldLedger NG one-paste quickstart")
    ap.add_argument("--test", action="store_true", help="run the backend test suite instead of starting the servers")
    args = ap.parse_args()

    check_python()
    if not args.test:
        check_node()
    ensure_env_file()
    ensure_venv()
    if args.test:
        say("running the test suite")
        result = subprocess.run([str(VENV_PY), "-m", "pytest"], cwd=str(BACKEND), env=child_env())
        sys.exit(result.returncode)
    ensure_node_modules()
    ensure_seed()
    serve()


if __name__ == "__main__":
    main()
