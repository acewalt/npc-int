#!/usr/bin/env python3
"""Train npc-int's neural subword tokenizer using Nanochat's RustBPE implementation.

This is intentionally separate from the browser linguistic tokenizer:
- tokenizer.js: lexical/morphological NLP representation for the symbolic brain.
- this script: learned byte-level BPE IDs for Nanochat/Transformer training.

The resulting tokenizer is fully compatible with the pinned Nanochat revision because
we instantiate nanochat.tokenizer.RustBPETokenizer directly.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Iterable, Iterator

ROOT = Path(__file__).resolve().parents[2]
NANOCHAT = ROOT / "neural" / "vendor" / "nanochat"


def add_nanochat_to_path() -> None:
    if not NANOCHAT.exists():
        raise SystemExit(
            "Nanochat no está instalado en neural/vendor/nanochat. "
            "Ejecuta primero: python neural/setup_nanochat.py"
        )
    sys.path.insert(0, str(NANOCHAT))


def strings_from_json(value) -> Iterator[str]:
    """Extract useful natural-language strings without serialising JSON syntax."""
    if isinstance(value, str):
        text = value.strip()
        if len(text) >= 2:
            yield text
        return
    if isinstance(value, list):
        for item in value:
            yield from strings_from_json(item)
        return
    if not isinstance(value, dict):
        return

    preferred = ("text", "content", "summary", "title", "description", "meaning", "definition")
    emitted = set()
    for key in preferred:
        if key in value:
            for text in strings_from_json(value[key]):
                if text not in emitted:
                    emitted.add(text)
                    yield text

    # Conversation datasets are especially important for the tokenizer's chat vocabulary.
    messages = value.get("messages")
    if isinstance(messages, list):
        for msg in messages:
            if isinstance(msg, dict) and isinstance(msg.get("content"), str):
                text = msg["content"].strip()
                if text and text not in emitted:
                    emitted.add(text)
                    yield text

    # Generic fallback for knowledge JSON whose text lives under other field names.
    for key, child in value.items():
        if key in preferred or key == "messages":
            continue
        if isinstance(child, (list, dict)):
            yield from strings_from_json(child)


def iter_file(path: Path) -> Iterator[str]:
    suffix = path.suffix.lower()
    try:
        if suffix in {".txt", ".md"}:
            with path.open("r", encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    text = line.strip()
                    if text:
                        yield text
        elif suffix == ".jsonl":
            with path.open("r", encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        yield line
                        continue
                    yield from strings_from_json(obj)
        elif suffix == ".json":
            with path.open("r", encoding="utf-8", errors="ignore") as fh:
                obj = json.load(fh)
            yield from strings_from_json(obj)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"[skip] {path}: {exc}", file=sys.stderr)


def iter_paths(paths: list[Path]) -> Iterator[str]:
    supported = {".txt", ".md", ".json", ".jsonl"}
    for source in paths:
        if source.is_file():
            if source.suffix.lower() in supported:
                yield from iter_file(source)
            continue
        if not source.exists():
            continue
        for path in sorted(source.rglob("*")):
            if path.is_file() and path.suffix.lower() in supported:
                yield from iter_file(path)


class Corpus:
    def __init__(self, paths: list[Path], max_chars: int):
        self.paths = paths
        self.max_chars = max_chars
        self.docs = 0
        self.chars = 0
        self.first_samples: list[str] = []

    def __iter__(self) -> Iterator[str]:
        self.docs = 0
        self.chars = 0
        self.first_samples.clear()
        for text in iter_paths(self.paths):
            remaining = self.max_chars - self.chars if self.max_chars > 0 else None
            if remaining is not None and remaining <= 0:
                break
            if remaining is not None and len(text) > remaining:
                text = text[:remaining]
            if not text:
                continue
            self.docs += 1
            self.chars += len(text)
            if len(self.first_samples) < 8:
                self.first_samples.append(text)
            yield text


def default_inputs() -> list[Path]:
    candidates = [
        ROOT / "knowledge" / "wiki",
        ROOT / "neural" / "datasets",
        ROOT / "knowledge",
    ]
    return [p for p in candidates if p.exists()]


def main() -> int:
    parser = argparse.ArgumentParser(description="Train npc-int/Nanochat RustBPE tokenizer")
    parser.add_argument("--input", action="append", default=[], help="File or directory; repeatable")
    parser.add_argument("--output", default="neural/tokenizer/npc-int-es", help="Tokenizer output directory")
    parser.add_argument("--vocab-size", type=int, default=32768, help="Total vocabulary including Nanochat special tokens")
    parser.add_argument("--max-chars", type=int, default=200_000_000, help="Maximum training characters; 0 = unlimited")
    args = parser.parse_args()

    add_nanochat_to_path()
    from nanochat.tokenizer import RustBPETokenizer, SPECIAL_TOKENS, SPLIT_PATTERN

    sources = [Path(p).resolve() for p in args.input] if args.input else default_inputs()
    if not sources:
        raise SystemExit("No encontré corpus. Usa --input <archivo-o-carpeta>.")

    output = (ROOT / args.output).resolve() if not Path(args.output).is_absolute() else Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    print("npc-int neural tokenizer")
    print(f"vocab_size={args.vocab_size}")
    print(f"max_chars={args.max_chars or 'unlimited'}")
    for source in sources:
        print(f"source={source}")

    corpus = Corpus(sources, args.max_chars)
    tokenizer = RustBPETokenizer.train_from_iterator(iter(corpus), vocab_size=args.vocab_size)
    tokenizer.save(str(output))

    # Round-trip sanity test over a few real corpus samples.
    checks = []
    for sample in corpus.first_samples[:5]:
        ids = tokenizer.encode(sample)
        decoded = tokenizer.decode(ids)
        checks.append({
            "chars": len(sample),
            "tokens": len(ids),
            "roundtrip": decoded == sample,
            "preview": sample[:120],
        })
        if decoded != sample:
            raise RuntimeError("Tokenizer round-trip failed")

    metadata = {
        "format": "nanochat-rustbpe-tiktoken",
        "vocab_size": tokenizer.get_vocab_size(),
        "requested_vocab_size": args.vocab_size,
        "special_tokens": list(SPECIAL_TOKENS),
        "split_pattern": SPLIT_PATTERN,
        "documents_seen": corpus.docs,
        "characters_seen": corpus.chars,
        "sources": [str(p) for p in sources],
        "roundtrip_checks": checks,
    }
    with (output / "npc-int-tokenizer.json").open("w", encoding="utf-8") as fh:
        json.dump(metadata, fh, ensure_ascii=False, indent=2)

    print(f"saved={output}")
    print(f"documents={corpus.docs:,} chars={corpus.chars:,} vocab={tokenizer.get_vocab_size():,}")
    print("roundtrip=ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
