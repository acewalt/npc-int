#!/usr/bin/env python3
"""Construye un corpus web de Wikipedia en español, dividido por temas.

Diseñado para GitHub Pages / npc-int:
- entrada: dump MediaWiki pages-articles XML o XML.bz2
- salida: JSON compacto dividido por temas y shards pequeños
- presupuesto total configurable (300 MiB por defecto)
- ningún shard se acerca al límite de 100 MiB de GitHub
- cada shard tiene un índice ligero paralelo para búsqueda bajo demanda

Ejemplo:
    python tools/build_wikipedia_web.py \
      eswiki-latest-pages-articles.xml.bz2 \
      knowledge/wiki \
      --target-mib 300 \
      --shard-mib 4

El tamaño objetivo es aproximado: el constructor termina al completar el shard
que hace alcanzar o superar el presupuesto.
"""

from __future__ import annotations

import argparse
import bz2
import hashlib
import html
import json
import re
import shutil
import sys
import time
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

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
RE_CATEGORY = re.compile(r"\[\[(?:Categoría|Categoria):([^\]|]+)(?:\|[^\]]*)?\]\]", re.I)
RE_WORD = re.compile(r"[a-záéíóúüñ0-9]{3,}", re.I)

STOP = {
    "que", "como", "para", "por", "con", "una", "uno", "unos", "unas", "del", "las", "los",
    "este", "esta", "estos", "estas", "entre", "sobre", "desde", "hasta", "tambien", "también",
    "fue", "son", "era", "ser", "sus", "han", "hay", "más", "mas", "muy", "sin", "cada", "donde",
    "cuando", "cual", "cuales", "tiene", "tienen", "parte", "puede", "pueden", "se", "al", "en", "de",
}


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def child_text(node: ET.Element, name: str) -> str:
    for child in node.iter():
        if local(child.tag) == name:
            return child.text or ""
    return ""


def norm(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", text).strip()


def strip_templates(text: str) -> str:
    old = None
    for _ in range(10):
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
    text = RE_CATEGORY.sub(" ", text)
    text = strip_templates(text)
    text = RE_LINK.sub(lambda m: m.group(2), text)
    text = RE_LINK_SIMPLE.sub(lambda m: m.group(1).split("#", 1)[0], text)
    text = RE_EXT.sub(lambda m: m.group(1) or " ", text)
    text = RE_HEADING.sub(lambda m: f"\n\n## {m.group(1)}\n", text)
    text = RE_TAG.sub(" ", text)
    text = text.replace("'''", "").replace("''", "")
    text = html.unescape(text)
    text = RE_SPACE.sub(" ", text)
    text = RE_BLANKS.sub("\n\n", text)
    return text.strip()


def is_redirect(text: str) -> bool:
    head = text.lstrip()[:100].lower()
    return head.startswith("#redirect") or head.startswith("#redirección") or head.startswith("#redireccion")


def open_dump(path: Path):
    return bz2.open(path, "rb") if path.suffix.lower() == ".bz2" else path.open("rb")


def keywords(text: str, limit: int = 18) -> list[str]:
    words = [norm(x) for x in RE_WORD.findall(text)]
    counts = Counter(w for w in words if len(w) > 2 and w not in STOP)
    return [w for w, _ in counts.most_common(limit)]


def chunk_text(text: str, max_chars: int = 1450, overlap_chars: int = 140) -> Iterable[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    current = ""
    for p in paragraphs:
        if len(p) > max_chars:
            if current:
                yield current.strip()
                current = ""
            start = 0
            while start < len(p):
                end = min(len(p), start + max_chars)
                piece = p[start:end].strip()
                if piece:
                    yield piece
                if end >= len(p):
                    break
                start = max(start + 1, end - overlap_chars)
            continue
        candidate = p if not current else current + "\n\n" + p
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                yield current.strip()
            tail = current[-overlap_chars:].strip() if overlap_chars and current else ""
            current = (tail + "\n\n" + p).strip() if tail else p
    if current:
        yield current.strip()


@dataclass
class TopicConfig:
    key: str
    label: str
    keywords: list[str]


@dataclass
class TopicWriter:
    key: str
    label: str
    root: Path
    shard_limit: int
    shard_no: int = 0
    buffer: list[dict] = field(default_factory=list)
    buffer_bytes: int = 2
    bytes_written: int = 0
    chunks_written: int = 0
    articles: set[str] = field(default_factory=set)
    files: list[dict] = field(default_factory=list)

    def add(self, record: dict) -> int:
        encoded = json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        projected = self.buffer_bytes + len(encoded) + 1
        flushed = 0
        if self.buffer and projected > self.shard_limit:
            flushed = self.flush()
        self.buffer.append(record)
        self.buffer_bytes += len(encoded) + 1
        self.articles.add(record["article"])
        return flushed

    def flush(self) -> int:
        if not self.buffer:
            return 0
        folder = self.root / self.key
        folder.mkdir(parents=True, exist_ok=True)
        data_name = f"part-{self.shard_no:05d}.json"
        index_name = f"part-{self.shard_no:05d}.index.json"
        data_path = folder / data_name
        index_path = folder / index_name

        data_bytes = json.dumps(self.buffer, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        data_path.write_bytes(data_bytes)

        idx = [
            {
                "id": r["id"],
                "title": r["title"],
                "terms": r["terms"],
                "article": r["article"],
            }
            for r in self.buffer
        ]
        index_bytes = json.dumps(idx, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        index_path.write_bytes(index_bytes)

        written = len(data_bytes) + len(index_bytes)
        self.bytes_written += written
        self.chunks_written += len(self.buffer)
        self.files.append({
            "data": f"{self.key}/{data_name}",
            "index": f"{self.key}/{index_name}",
            "bytes": written,
            "chunks": len(self.buffer),
        })
        self.shard_no += 1
        self.buffer = []
        self.buffer_bytes = 2
        return written


def load_topics(path: Path) -> list[TopicConfig]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for key, cfg in raw["topics"].items():
        out.append(TopicConfig(key=key, label=cfg.get("label", key), keywords=[norm(x) for x in cfg.get("keywords", [])]))
    return out


def classify(title: str, categories: list[str], lead: str, topics: list[TopicConfig]) -> str:
    title_n = norm(title)
    cats_n = " ".join(norm(x) for x in categories)
    lead_n = norm(lead[:1800])
    scores: dict[str, int] = defaultdict(int)
    for topic in topics:
        if topic.key == "otros":
            continue
        for kw in topic.keywords:
            if not kw:
                continue
            if kw in title_n:
                scores[topic.key] += 12
            if kw in cats_n:
                scores[topic.key] += 7
            if kw in lead_n:
                scores[topic.key] += 2
    if not scores:
        return "otros"
    best_key, best_score = max(scores.items(), key=lambda x: x[1])
    return best_key if best_score >= 2 else "otros"


def article_id(title: str) -> str:
    return hashlib.sha1(title.encode("utf-8")).hexdigest()[:14]


def build(
    dump_path: Path,
    output: Path,
    topic_map: Path,
    target_mib: int,
    shard_mib: int,
    max_chunk_chars: int,
    min_article_chars: int,
    max_chunks_per_article: int,
) -> None:
    if not dump_path.exists():
        raise SystemExit(f"No existe el dump: {dump_path}")
    topics = load_topics(topic_map)
    labels = {t.key: t.label for t in topics}

    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=True)

    shard_limit = shard_mib * 1024 * 1024
    target_bytes = target_mib * 1024 * 1024
    writers = {
        t.key: TopicWriter(t.key, t.label, output, shard_limit)
        for t in topics
    }
    if "otros" not in writers:
        writers["otros"] = TopicWriter("otros", "Conocimiento general", output, shard_limit)

    total_written = 0
    seen = 0
    kept_articles = 0
    kept_chunks = 0
    started = time.time()
    stop = False

    with open_dump(dump_path) as stream:
        for _, elem in ET.iterparse(stream, events=("end",)):
            if local(elem.tag) != "page":
                continue
            seen += 1
            title = child_text(elem, "title").strip()
            ns = child_text(elem, "ns").strip()
            raw = child_text(elem, "text")

            if ns == "0" and title and raw and not is_redirect(raw):
                categories = [x.strip() for x in RE_CATEGORY.findall(raw)]
                clean = clean_wikitext(raw)
                if len(clean) >= min_article_chars:
                    topic = classify(title, categories, clean, topics)
                    aid = article_id(title)
                    chunks = list(chunk_text(clean, max_chunk_chars))[:max_chunks_per_article]
                    if chunks:
                        kept_articles += 1
                    for i, chunk in enumerate(chunks):
                        record = {
                            "id": f"{aid}:{i}",
                            "article": aid,
                            "title": title,
                            "topic": topic,
                            "chunk": i,
                            "text": chunk,
                            "terms": keywords(title + " " + " ".join(categories) + " " + chunk[:700]),
                            "source": "Wikipedia/eswiki",
                        }
                        total_written += writers[topic].add(record)
                        kept_chunks += 1

                        # Solo comprobamos el límite cuando se cierra un shard real.
                        if total_written >= target_bytes:
                            stop = True
                            break

            elem.clear()
            if stop:
                break

            if seen % 5000 == 0:
                elapsed = max(0.1, time.time() - started)
                print(
                    f"vistas={seen:,} artículos={kept_articles:,} chunks={kept_chunks:,} "
                    f"escritos={total_written/1024/1024:.1f} MiB ({seen/elapsed:.1f} páginas/s)",
                    file=sys.stderr,
                )

    # Cerramos buffers pendientes. Puede superar ligeramente el objetivo.
    for writer in writers.values():
        total_written += writer.flush()

    manifest_topics = {}
    for key, writer in writers.items():
        if not writer.files:
            continue
        manifest_topics[key] = {
            "label": labels.get(key, writer.label),
            "files": writer.files,
            "chunks": writer.chunks_written,
            "articles": len(writer.articles),
            "bytes": writer.bytes_written,
        }

    manifest = {
        "version": 1,
        "language": "es",
        "source": "Wikipedia/eswiki pages-articles",
        "target_mib": target_mib,
        "actual_mib": round(total_written / 1024 / 1024, 2),
        "shard_mib": shard_mib,
        "articles": kept_articles,
        "chunks": kept_chunks,
        "topics": manifest_topics,
        "generated_unix": int(time.time()),
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    elapsed = time.time() - started
    print(
        f"Listo: {kept_articles:,} artículos / {kept_chunks:,} chunks / "
        f"{total_written/1024/1024:.1f} MiB en {elapsed/60:.1f} min -> {output}",
        file=sys.stderr,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dump", type=Path)
    ap.add_argument("output", type=Path)
    ap.add_argument("--topics", type=Path, default=Path("knowledge/topic-map.es.json"))
    ap.add_argument("--target-mib", type=int, default=300)
    ap.add_argument("--shard-mib", type=int, default=4)
    ap.add_argument("--chunk-chars", type=int, default=1450)
    ap.add_argument("--min-article-chars", type=int, default=180)
    ap.add_argument("--max-chunks-per-article", type=int, default=12)
    args = ap.parse_args()
    if args.shard_mib >= 90:
        raise SystemExit("Usa shards menores de 90 MiB; 4 MiB es el valor recomendado.")
    build(
        args.dump,
        args.output,
        args.topics,
        args.target_mib,
        args.shard_mib,
        args.chunk_chars,
        args.min_article_chars,
        args.max_chunks_per_article,
    )


if __name__ == "__main__":
    main()
