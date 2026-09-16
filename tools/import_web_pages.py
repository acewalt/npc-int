#!/usr/bin/env python3
"""Crea un pack JSON de conocimiento a partir de páginas web accesibles.

Instalación:
    pip install requests beautifulsoup4

Uso:
    python tools/import_web_pages.py knowledge/web.es.json https://ejemplo.com/pagina1 https://ejemplo.com/pagina2

Usa únicamente contenido que tengas derecho a descargar/reutilizar y conserva la
procedencia. Este script no intenta saltarse autenticación, paywalls ni bloqueos.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError as exc:
    raise SystemExit("Faltan dependencias. Ejecuta: pip install requests beautifulsoup4") from exc

SPACE = re.compile(r"[ \t\r\f\v]+")
BLANKS = re.compile(r"\n{3,}")


def clean_text(text: str) -> str:
    lines=[]
    for line in text.splitlines():
        line=SPACE.sub(" ",line).strip()
        if line:
            lines.append(line)
    return BLANKS.sub("\n\n","\n".join(lines)).strip()


def fetch_page(url: str, timeout: int=20) -> dict:
    headers={"User-Agent":"npc-int-knowledge-importer/0.1 (+local research tool)"}
    r=requests.get(url,headers=headers,timeout=timeout)
    r.raise_for_status()
    if "text/html" not in r.headers.get("content-type",""):
        raise ValueError("la URL no devolvió HTML")

    soup=BeautifulSoup(r.text,"html.parser")
    for tag in soup(["script","style","noscript","svg","nav","footer","form","aside"]):
        tag.decompose()

    title=(soup.title.get_text(" ",strip=True) if soup.title else urlparse(url).netloc).strip()
    root=soup.find("article") or soup.find("main") or soup.body or soup
    text=clean_text(root.get_text("\n",strip=True))
    if len(text)<120:
        raise ValueError("muy poco texto útil después de limpiar la página")

    return {
        "id":"web:"+str(abs(hash(url))),
        "title":title,
        "aliases":[title],
        "text":text,
        "tags":["web",urlparse(url).netloc],
        "source":url,
    }


def main() -> None:
    ap=argparse.ArgumentParser()
    ap.add_argument("output",type=Path)
    ap.add_argument("urls",nargs="+")
    ap.add_argument("--max-chars",type=int,default=12000,help="Máximo texto conservado por página")
    args=ap.parse_args()

    entries=[]
    for url in args.urls:
        try:
            item=fetch_page(url)
            item["text"]=item["text"][:args.max_chars]
            entries.append(item)
            print(f"OK  {item['title']} <- {url}",file=sys.stderr)
        except Exception as exc:
            print(f"ERROR {url}: {exc}",file=sys.stderr)

    payload={
        "name":"npc-int imported web knowledge",
        "license":"La licencia depende de cada URL; revisar antes de redistribuir.",
        "entries":entries,
    }
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"Guardadas {len(entries)} páginas en {args.output}")


if __name__=="__main__":
    main()
