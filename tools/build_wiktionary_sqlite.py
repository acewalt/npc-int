#!/usr/bin/env python3
"""Convierte un dump XML(.bz2) de Wiktionary/Wikcionario en SQLite + FTS5.

No intenta convertir toda la gramática wiki a una estructura lingüística perfecta;
conserva una versión textual limpia de cada entrada para búsqueda local y futuras
etapas de análisis.

Uso:
    python tools/build_wiktionary_sqlite.py eswiktionary-pages-articles.xml.bz2 data/dictionary-es.db
"""

from __future__ import annotations

import argparse
import bz2
import html
import re
import sqlite3
import time
import xml.etree.ElementTree as ET
from pathlib import Path

RE_COMMENT = re.compile(r"<!--.*?-->", re.S)
RE_REF = re.compile(r"<ref\b[^>]*>.*?</ref\s*>|<ref\b[^>]*/\s*>", re.I | re.S)
RE_LINK = re.compile(r"\[\[([^\]|]+)\|([^\]]+)\]\]")
RE_LINK_SIMPLE = re.compile(r"\[\[([^\]]+)\]\]")
RE_EXT = re.compile(r"\[(?:https?|ftp)://[^\s\]]+\s*([^\]]*)\]", re.I)
RE_TEMPLATE = re.compile(r"\{\{([^{}|]+)(?:\|[^{}]*)?\}\}")
RE_TAG = re.compile(r"<[^>]+>")
RE_SPACE = re.compile(r"[ \t\r\f\v]+")
RE_BLANKS = re.compile(r"\n{3,}")


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def child_text(node: ET.Element, name: str) -> str:
    for child in node.iter():
        if local(child.tag) == name:
            return child.text or ""
    return ""


def clean(text: str) -> str:
    if not text:
        return ""
    text = RE_COMMENT.sub(" ", text)
    text = RE_REF.sub(" ", text)
    text = RE_LINK.sub(lambda m: m.group(2), text)
    text = RE_LINK_SIMPLE.sub(lambda m: m.group(1), text)
    text = RE_EXT.sub(lambda m: m.group(1) or " ", text)
    # En Wikcionario algunas plantillas contienen etiquetas útiles; conservamos
    # al menos su nombre en lugar de borrar todo a ciegas.
    for _ in range(6):
        new = RE_TEMPLATE.sub(lambda m: f" {m.group(1)} ", text)
        if new == text:
            break
        text = new
    text = RE_TAG.sub(" ", text)
    text = text.replace("'''", "").replace("''", "")
    text = re.sub(r"^={2,}\s*(.*?)\s*={2,}$", r"\n\1\n", text, flags=re.M)
    text = re.sub(r"^[#*:;]+\s*", "", text, flags=re.M)
    text = html.unescape(text)
    text = RE_SPACE.sub(" ", text)
    text = RE_BLANKS.sub("\n\n", text)
    return text.strip()


def open_dump(path: Path):
    return bz2.open(path, "rb") if path.suffix.lower() == ".bz2" else path.open("rb")


def build(dump_path: Path, db_path: Path, limit: int | None, min_chars: int) -> None:
    if not dump_path.exists():
        raise SystemExit(f"No existe el dump: {dump_path}")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        PRAGMA journal_mode=OFF;
        PRAGMA synchronous=OFF;
        PRAGMA temp_store=MEMORY;
        CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE entries(
            id INTEGER PRIMARY KEY,
            word TEXT NOT NULL UNIQUE,
            text TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'Wiktionary'
        );
        CREATE VIRTUAL TABLE entries_fts USING fts5(
            word,
            text,
            content='entries',
            content_rowid='id',
            tokenize='unicode61 remove_diacritics 2'
        );
        """
    )
    conn.execute("INSERT INTO meta VALUES('language','es')")
    conn.execute("INSERT INTO meta VALUES('source','Wiktionary/Wikcionario MediaWiki dump')")
    conn.execute("INSERT INTO meta VALUES('dump_file',?)", (dump_path.name,))

    count = 0
    started = time.time()
    with open_dump(dump_path) as stream:
        for _, elem in ET.iterparse(stream, events=("end",)):
            if local(elem.tag) != "page":
                continue
            title = child_text(elem, "title").strip()
            ns = child_text(elem, "ns").strip()
            raw = child_text(elem, "text")
            if ns == "0" and title and raw:
                text = clean(raw)
                if len(text) >= min_chars:
                    cur = conn.execute(
                        "INSERT OR IGNORE INTO entries(word,text,source) VALUES(?,?,?)",
                        (title, text, "Wiktionary/es"),
                    )
                    if cur.rowcount == 1:
                        conn.execute(
                            "INSERT INTO entries_fts(rowid,word,text) VALUES(?,?,?)",
                            (cur.lastrowid, title, text),
                        )
                        count += 1
                        if count % 2000 == 0:
                            conn.commit()
                            print(f"{count:,} entradas")
            elem.clear()
            if limit is not None and count >= limit:
                break

    conn.commit()
    conn.execute("INSERT OR REPLACE INTO meta VALUES('entries',?)", (str(count),))
    conn.execute("INSERT INTO entries_fts(entries_fts) VALUES('optimize')")
    conn.commit()
    conn.close()
    print(f"Listo: {count:,} entradas -> {db_path} ({(time.time()-started)/60:.1f} min)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dump", type=Path)
    ap.add_argument("output", type=Path)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--min-chars", type=int, default=40)
    args = ap.parse_args()
    build(args.dump, args.output, args.limit, args.min_chars)


if __name__ == "__main__":
    main()
