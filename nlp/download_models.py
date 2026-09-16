#!/usr/bin/env python3
"""Download the Spanish Stanza processors used by npc-int.

Downloads are explicit so runtime startup never pulls large neural models
unexpectedly. The full profile includes Spanish coreference resolution.
"""
from __future__ import annotations

import argparse
from pathlib import Path

BASE_PROCESSORS = "tokenize,mwt,pos,lemma,depparse,ner"
FULL_PROCESSORS = BASE_PROCESSORS + ",coref"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", dest="model_dir", default=None,
                        help="Optional Stanza model directory")
    parser.add_argument("--package", default="default")
    parser.add_argument("--no-coref", action="store_true",
                        help="Download only the lighter base pipeline")
    args = parser.parse_args()

    try:
        import stanza
    except ImportError as exc:
        raise SystemExit(
            "Stanza is not installed. Run: python -m pip install -r nlp/requirements.txt"
        ) from exc

    processors = BASE_PROCESSORS if args.no_coref else FULL_PROCESSORS
    kwargs = {
        "lang": "es",
        "processors": processors,
        "package": args.package,
        "verbose": True,
    }
    if args.model_dir:
        path = Path(args.model_dir).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        kwargs["model_dir"] = str(path)

    stanza.download(**kwargs)
    print(f"Spanish NLP models ready: {processors}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
