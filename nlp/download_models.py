#!/usr/bin/env python3
"""Download the Spanish Stanza processors used by npc-int.

This is deliberately separate from runtime startup so the server never downloads
large neural models unexpectedly.
"""
from __future__ import annotations

import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", dest="model_dir", default=None,
                        help="Optional Stanza model directory")
    parser.add_argument("--package", default="default")
    args = parser.parse_args()

    try:
        import stanza
    except ImportError as exc:
        raise SystemExit(
            "Stanza is not installed. Run: python -m pip install -r nlp/requirements.txt"
        ) from exc

    kwargs = {
        "lang": "es",
        "processors": "tokenize,mwt,pos,lemma,depparse,ner",
        "package": args.package,
        "verbose": True,
    }
    if args.model_dir:
        path = Path(args.model_dir).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        kwargs["model_dir"] = str(path)

    stanza.download(**kwargs)
    print("Spanish NLP models ready: tokenize,mwt,pos,lemma,depparse,ner")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
