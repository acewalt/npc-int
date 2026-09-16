#!/usr/bin/env python3
"""Convierte un dump XML .bz2 de Wikipedia/MediaWiki en SQLite + FTS5.

Uso:
    python tools/build_wikipedia_sqlite.py eswiki-pages-articles.xml.bz2 data/wiki-es.db

El parser trabaja en streaming para no cargar el dump completo en RAM.
"""

from __future__ import annotations

import argparse
import bz2
import html
import re
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

RE_COMMENT = re.compile(r"<!--.*?-->", re.S)
RE_REF = re.compile(r"<ref\b[^>]*>.*?</ref\s*>|<ref\b[^>]*/\s*>", re.I | re.S)
RE_TEMPLATE = re.compile(r"\{\{[^{}]*\}\}")
RE_LINK = re.compile(r"\[\[([^\]|]+)\|([^\]]+)\]\]")
RE_LINK_SIMPLE = re.compile(r"\[\[([^\]]+)\]\]")
RE_EXT = re.compile(r"\[(?:https?|ftp)://[^\s\]]+\s*([^\]]*)\]", re.I)
RE_TAG = re.compile(r"<[^>]+>")
RE_HEADING = re.compile(r"^={2,}\s*(.*?)\s*={2,}$", re.M)
RE_SPACE = re.compile(r"[ \t\r\f\v]+")
RE_BLANKS = re.compile(r"\n{3,}")


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def child_text(node: ET.Element, name: str) -> str:
    for child in node.iter():
        if local(child.tag) == name:
            return child.text or ""
    return ""


def strip_templates(text: str) -> str:
    # Varias pasadas eliminan plantillas simples/anidadas poco profundas.
    old = None
    for _ in range(8):
        if text == old:
            break
        old = text
        text = RE_TEMPLATE.sub(" ", text)
    return text


def clean_wikitext(text: str) -> str:
    if not text:
        return ""
    text = RE_COMMENT.sub(" ", text)
    text = RE_REF.sub(" ", text)
    text = strip_templates(text)
    text = RE_LINK.sub(lambda m: m.group(2), text)
    text = RE_LINK_SIMPLE.sub(lambda m: m.group(1).split("#", 1)[0], text)
    text = RE_EXT.sub(lambda m: m.group(1) or " ", text)
    text = RE_HEADING.sub(lambda m: f"\n{m.group(1)}\n", text)
    text = RE_TAG.sub(" ", text)
    text = text.replace("'''", "").replace("''", "")
    text = html.unescape(text)
    text = RE_SPACE.sub(" ", text)
    text = RE_BLANKS.sub("\n\n", text)
    return text.strip()


def is_redirect(text: str) -> bool:
    head = text.lstrip()[:80].lower()
    return head.startswith("#redirect") or head.startswith("#redirección") or head.startswith("#redireccion")


def open_dump(path: Path):
    if path.suffix.lower() == ".bz2":
        return bz2.open(path, "rb")
    return path.open("rb")


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode=OFF;
        PRAGMA synchronous=OFF;
        PRAGMA temp_store=MEMORY;
        PRAGMA cache_size=-200000;

        CREATE TABLE IF NOT EXISTS meta(
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS articles(
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL UNIQUE,
            text TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'Wikipedia'
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
            title,
            text,
            content='articles',
            content_rowid='id',
            tokenize='unicode61 remove_diacritics 2'
        );
        """
    )


def add_article(conn: sqlite3.Connection, title: str, text: str) -> bool:
    cur = conn.execute(
        "INSERT OR IGNORE INTO articles(title,text,source) VALUES(?,?,?)",
        (title, text, "Wikipedia/eswiki"),
    )
    if cur.rowcount != 1:
        return False
    rowid = cur.lastrowid
    conn.execute(
        "INSERT INTO articles_fts(rowid,title,text) VALUES(?,?,?)",
        (rowid, title, text),
    )
    return True


def build(dump_path: Path, db_path: Path, limit: int | None, min_chars: int) -> None:
    if not dump_path.exists():
        raise SystemExit(f"No existe el dump: {dump_path}")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    init_db(conn)
    conn.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('language','es')")
    conn.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('source','Wikipedia/eswiki MediaWiki dump')")
    conn.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('dump_file',?)", (dump_path.name,))

    inserted = 0
    seen = 0
    started = time.time()

    with open_dump(dump_path) as stream:
        for _, elem in ET.iterparse(stream, events=("end",)):
            if local(elem.tag) != "page":
                continue

            seen += 1
            title = child_text(elem, "title").strip()
            ns = child_text(elem, "ns").strip()
            raw = child_text(elem, "text")

            if ns == "0" and title and raw and not is_redirect(raw):
                text = clean_wikitext(raw)
                if len(text) >= min_chars and add_article(conn, title, text):
                    inserted += 1
                    if inserted % 1000 == 0:
                        conn.commit()
                        elapsed = max(0.1, time.time() - started)
                        print(f"{inserted:,} artículos | {inserted/elapsed:.1f} art/s", file=sys.stderr)

            elem.clear()

            if limit is not None and inserted >= limit:
                break

    conn.commit()
    conn.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('articles',?)", (str(inserted),))
    conn.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('created_unix',?)", (str(int(time.time())),))
    conn.execute("INSERT INTO articles_fts(articles_fts) VALUES('optimize')")
    conn.commit()
    conn.close()

    size = db_path.stat().st_size / (1024**3)
    elapsed = time.time() - started
    print(f"Listo: {inserted:,} artículos -> {db_path} ({size:.2f} GiB) en {elapsed/60:.1f} min")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dump", type=Path, help="Dump MediaWiki XML o XML.bz2")
    ap.add_argument("output", type=Path, help="SQLite de salida")
    ap.add_argument("--limit", type=int, default=None, help="Procesar solo N artículos para pruebas")
    ap.add_argument("--min-chars", type=int, default=120, help="Descartar artículos demasiado cortos")
    args = ap.parse_args()
    build(args.dump, args.output, args.limit, args.min_chars)


if __name__ == "__main__":
    main()
