#!/usr/bin/env python3
"""Clone/update the pinned nanochat revision used by npc-int."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "neural" / "nanochat.lock.json"
DEFAULT_DEST = ROOT / "neural" / "vendor" / "nanochat"


def run(*args: str, cwd: Path | None = None) -> str:
    p = subprocess.run(
        list(args),
        cwd=cwd,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    return p.stdout.strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dest", type=Path, default=DEFAULT_DEST)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    cfg = json.loads(LOCK.read_text(encoding="utf-8"))
    repo = cfg["repository"]
    commit = cfg["commit"]
    dest = args.dest.resolve()

    if shutil.which("git") is None:
        raise SystemExit("git no está disponible en PATH.")

    if dest.exists() and not (dest / ".git").exists():
        if not args.force:
            raise SystemExit(
                f"{dest} existe pero no es un checkout Git. Usa --force para reemplazarlo."
            )
        shutil.rmtree(dest)

    dest.parent.mkdir(parents=True, exist_ok=True)

    if not dest.exists():
        print(f"Clonando {repo} -> {dest}")
        run("git", "clone", "--filter=blob:none", "--no-checkout", repo, str(dest))

    print(f"Fijando Nanochat en {commit}")
    run("git", "fetch", "--depth", "1", "origin", commit, cwd=dest)
    run("git", "checkout", "--detach", commit, cwd=dest)

    actual = run("git", "rev-parse", "HEAD", cwd=dest)
    if actual != commit:
        raise SystemExit(f"Revision inesperada: {actual}")

    print("Nanochat listo.")
    print("Siguiente paso:")
    print(f"  cd {dest}")
    print("  uv sync")
    print("Después vuelve a npc-int y ejecuta:")
    print("  python neural/bridge/server.py --backend auto")


if __name__ == "__main__":
    main()
