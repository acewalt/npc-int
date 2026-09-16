#!/usr/bin/env python3
"""npc-int Spanish NLP bridge.

Endpoints:
  GET  /health
  POST /v1/analyze   {"text": "..."}

Backends:
  stanza     neural Spanish pipeline: tokenize,mwt,pos,lemma,depparse,ner
  heuristic  dependency-free fallback used for smoke tests
  auto       try stanza, otherwise heuristic

The neural model performs linguistic analysis. npc-int then adds lightweight,
explicit semantic post-processing (coreference hypotheses and semantic roles)
so game logic receives a stable JSON contract instead of Stanza objects.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

PROCESSORS = "tokenize,mwt,pos,lemma,depparse,ner"
VERSION = "1.0"


def feats_dict(value: Optional[str]) -> Dict[str, str]:
    if not value:
        return {}
    out: Dict[str, str] = {}
    for piece in str(value).split("|"):
        if "=" in piece:
            k, v = piece.split("=", 1)
            out[k] = v
    return out


def feature_list(feats: Dict[str, str]) -> List[Dict[str, str]]:
    return [{"name": k, "value": v} for k, v in sorted(feats.items())]


def norm(text: str) -> str:
    import unicodedata
    return "".join(
        c for c in unicodedata.normalize("NFD", (text or "").lower())
        if unicodedata.category(c) != "Mn"
    )


def span_text(tokens: List[Dict[str, Any]], ids: Iterable[int]) -> str:
    wanted = set(ids)
    parts = [t["text"] for t in tokens if t["id"] in wanted]
    return " ".join(parts)


def compatible(mention: Dict[str, Any], candidate: Dict[str, Any]) -> bool:
    mf = mention.get("feats") or {}
    cf = candidate.get("feats") or {}
    for key in ("Gender", "Number"):
        if mf.get(key) and cf.get(key) and mf[key] != cf[key]:
            return False
    return True


def coreference_hypotheses(sentences: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Small deterministic resolver on top of neural morphology/dependencies.

    These are explicitly hypotheses, not ground truth. This keeps the contract
    useful for game reasoning without pretending Spanish neural coreference is
    available in the selected Stanza pipeline.
    """
    mentions: List[Dict[str, Any]] = []
    refs: List[Dict[str, Any]] = []
    pronouns = {
        "el", "ella", "ellos", "ellas", "este", "esta", "estos", "estas",
        "ese", "esa", "esos", "esas", "aquel", "aquella", "lo", "la", "los",
        "las", "le", "les", "eso", "esto", "aquello",
    }
    for si, sentence in enumerate(sentences):
        for token in sentence["tokens"]:
            upos = token.get("upos")
            folded = norm(token.get("text", ""))
            if upos in {"NOUN", "PROPN"}:
                mentions.append({"sentence": si, **token})
                if len(mentions) > 32:
                    mentions.pop(0)
                continue
            if upos != "PRON" or folded not in pronouns:
                continue
            ranked: List[Tuple[float, Dict[str, Any]]] = []
            for cand in reversed(mentions):
                if not compatible(token, cand):
                    continue
                distance = (si - cand["sentence"]) * 20 + abs(token["id"] - cand["id"])
                score = max(0.15, 0.92 - 0.025 * distance)
                if cand.get("upos") == "PROPN":
                    score += 0.04
                ranked.append((min(score, 0.97), cand))
            if ranked:
                ranked.sort(key=lambda x: x[0], reverse=True)
                score, cand = ranked[0]
                refs.append({
                    "mention": token["text"],
                    "mentionSentence": si,
                    "mentionToken": token["id"],
                    "antecedent": cand["text"],
                    "antecedentSentence": cand["sentence"],
                    "antecedentToken": cand["id"],
                    "confidence": round(score, 3),
                    "source": "npc-int-coref-heuristic",
                    "status": "hypothesis",
                })
    return refs


def semantic_frame(sentence: Dict[str, Any]) -> Dict[str, Any]:
    toks = sentence["tokens"]
    root = next((t for t in toks if t.get("deprel") == "root"), None)
    if not root:
        root = next((t for t in toks if t.get("upos") in {"VERB", "AUX"}), None)
    predicate_id = root["id"] if root else None

    subjects = [t for t in toks if str(t.get("deprel", "")).startswith(("nsubj", "csubj"))]
    objects = [t for t in toks if t.get("deprel") in {"obj", "iobj"}]
    obliques = [t for t in toks if str(t.get("deprel", "")).startswith(("obl", "nmod"))]
    neg = any(
        norm(t.get("lemma") or t.get("text", "")) in {"no", "nunca", "jamas", "tampoco"}
        and t.get("upos") in {"ADV", "PART"}
        for t in toks
    )
    qwords = [
        t for t in toks
        if norm(t.get("lemma") or t.get("text", ""))
        in {"que", "quien", "cual", "como", "cuando", "donde", "cuanto"}
    ]
    text = sentence.get("text", "")
    speech = "question" if "?" in text or "¿" in text or qwords else "statement"
    if any(t.get("upos") == "INTJ" for t in toks) and not root:
        speech = "social"

    roles = []
    if root:
        for t in subjects:
            roles.append({"role": "agent", "text": t["text"], "token": t["id"], "confidence": 0.83})
        for t in objects:
            role = "recipient" if t.get("deprel") == "iobj" else "patient"
            roles.append({"role": role, "text": t["text"], "token": t["id"], "confidence": 0.82})
        for t in obliques:
            lemma = norm(t.get("lemma") or t.get("text", ""))
            role = "circumstance"
            if lemma in {"hoy", "ayer", "manana", "noche", "dia", "hora"}:
                role = "time"
            roles.append({"role": role, "text": t["text"], "token": t["id"], "confidence": 0.58})

    return {
        "speechType": speech,
        "predicate": None if not root else {
            "token": root["id"], "text": root["text"],
            "lemma": root.get("lemma") or root["text"],
            "upos": root.get("upos"), "feats": root.get("feats") or {},
        },
        "roles": roles,
        "negated": neg,
        "questionWords": [t.get("lemma") or t["text"] for t in qwords],
        "confidence": 0.86 if root else 0.55,
        "source": "ud-semantic-projection",
    }


class HeuristicAnalyzer:
    name = "heuristic"
    model = "npc-int-regex-fallback"

    TOKEN_RE = re.compile(r"\w+(?:[-']\w+)*|[^\w\s]", re.UNICODE)
    PRON = {"yo", "tu", "tú", "el", "él", "ella", "nosotros", "ustedes", "ellos", "ellas", "lo", "la", "le"}
    VERBS = {"soy": "ser", "eres": "ser", "es": "ser", "estoy": "estar", "estas": "estar", "estás": "estar", "esta": "estar", "está": "estar", "quiero": "querer", "quieres": "querer", "quiere": "querer", "hago": "hacer", "haces": "hacer", "hace": "hacer", "puedo": "poder", "puedes": "poder", "puede": "poder", "recuerdo": "recordar", "recuerdas": "recordar", "entiendo": "entender", "entiendes": "entender"}

    def analyze(self, text: str) -> Dict[str, Any]:
        raw = text or ""
        sentences = []
        cursor = 0
        pieces = re.split(r"(?<=[.!?])\s+", raw.strip()) if raw.strip() else []
        for si, piece in enumerate(pieces):
            start_sentence = raw.find(piece, cursor)
            cursor = max(cursor, start_sentence + len(piece))
            tokens = []
            root_id = None
            for i, m in enumerate(self.TOKEN_RE.finditer(piece), 1):
                word = m.group(0)
                w = norm(word)
                upos = "PUNCT" if re.fullmatch(r"[^\w\s]", word) else "X"
                lemma = w
                feats: Dict[str, str] = {}
                if w in self.PRON:
                    upos = "PRON"
                if w in self.VERBS:
                    upos = "VERB"; lemma = self.VERBS[w]; feats = {"VerbForm": "Fin"}
                    if root_id is None: root_id = i
                if w in {"no", "nunca", "tampoco"}:
                    upos = "ADV"
                tokens.append({
                    "id": i, "text": word, "lemma": lemma, "upos": upos, "xpos": None,
                    "feats": feats, "features": feature_list(feats),
                    "head": 0 if i == root_id else (root_id or 0),
                    "deprel": "root" if i == root_id else ("advmod" if w == "no" else "dep"),
                    "start": start_sentence + m.start(), "end": start_sentence + m.end(),
                    "ner": None,
                })
            sentence = {"id": si, "text": piece, "tokens": tokens}
            sentence["semanticFrame"] = semantic_frame(sentence)
            sentences.append(sentence)
        return {
            "ok": True, "language": "es", "backend": self.name, "model": self.model,
            "processors": ["regex-tokenize", "heuristic-pos", "semantic-projection"],
            "text": raw, "sentences": sentences, "entities": [],
            "coreferences": coreference_hypotheses(sentences),
            "frames": [s["semanticFrame"] for s in sentences],
        }


class StanzaAnalyzer:
    name = "stanza"

    def __init__(self, model_dir: Optional[str] = None, use_gpu: bool = False):
        import stanza
        kwargs: Dict[str, Any] = {
            "lang": "es",
            "processors": PROCESSORS,
            "use_gpu": use_gpu,
            "verbose": False,
        }
        if model_dir:
            kwargs["dir"] = str(Path(model_dir).expanduser().resolve())
        self.pipeline = stanza.Pipeline(**kwargs)
        self.model = f"stanza-es:{PROCESSORS}"

    @staticmethod
    def _spans(sentence: Any) -> Dict[int, Tuple[Optional[int], Optional[int]]]:
        spans: Dict[int, Tuple[Optional[int], Optional[int]]] = {}
        for token in sentence.tokens:
            start = getattr(token, "start_char", None)
            end = getattr(token, "end_char", None)
            for word in token.words:
                wid = int(word.id) if isinstance(word.id, int) else int(word.id[0])
                spans[wid] = (start, end)
        return spans

    def analyze(self, text: str) -> Dict[str, Any]:
        doc = self.pipeline(text or "")
        entities = []
        for ent in getattr(doc, "ents", []) or []:
            entities.append({
                "text": ent.text, "type": ent.type,
                "start": getattr(ent, "start_char", None),
                "end": getattr(ent, "end_char", None),
                "source": "stanza-ner",
            })

        sentences: List[Dict[str, Any]] = []
        for si, sentence in enumerate(doc.sentences):
            spans = self._spans(sentence)
            tokens: List[Dict[str, Any]] = []
            for word in sentence.words:
                wid = int(word.id) if isinstance(word.id, int) else int(word.id[0])
                start, end = spans.get(wid, (None, None))
                feats = feats_dict(getattr(word, "feats", None))
                ner = None
                if start is not None and end is not None:
                    overlap = [e for e in entities if e["start"] is not None and e["end"] is not None and e["start"] < end and e["end"] > start]
                    if overlap:
                        ner = overlap[0]["type"]
                tokens.append({
                    "id": wid,
                    "text": word.text,
                    "lemma": word.lemma or word.text,
                    "upos": word.upos,
                    "xpos": word.xpos,
                    "feats": feats,
                    "features": feature_list(feats),
                    "head": int(word.head or 0),
                    "deprel": word.deprel,
                    "start": start,
                    "end": end,
                    "ner": ner,
                })
            sentence_text = getattr(sentence, "text", None) or " ".join(t["text"] for t in tokens)
            item = {"id": si, "text": sentence_text, "tokens": tokens}
            item["semanticFrame"] = semantic_frame(item)
            sentences.append(item)

        return {
            "ok": True,
            "language": "es",
            "backend": self.name,
            "model": self.model,
            "processors": PROCESSORS.split(","),
            "text": text or "",
            "sentences": sentences,
            "entities": entities,
            "coreferences": coreference_hypotheses(sentences),
            "frames": [s["semanticFrame"] for s in sentences],
        }


@dataclass
class AnalyzerRuntime:
    requested_backend: str
    model_dir: Optional[str]
    use_gpu: bool
    analyzer: Any = None
    error: Optional[str] = None

    def load(self) -> None:
        requested = self.requested_backend
        if requested == "heuristic":
            self.analyzer = HeuristicAnalyzer(); self.error = None; return
        try:
            self.analyzer = StanzaAnalyzer(self.model_dir, self.use_gpu)
            self.error = None
        except Exception as exc:
            self.error = f"{type(exc).__name__}: {exc}"
            if requested == "stanza":
                raise
            self.analyzer = HeuristicAnalyzer()

    @property
    def backend(self) -> str:
        return getattr(self.analyzer, "name", "unloaded")

    @property
    def model(self) -> str:
        return getattr(self.analyzer, "model", "unloaded")


class Handler(BaseHTTPRequestHandler):
    runtime: AnalyzerRuntime

    def _headers(self, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def _json(self, obj: Dict[str, Any], status: int = 200) -> None:
        self._headers(status)
        self.wfile.write(json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self) -> None:
        self._headers(204)

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/health":
            self._json({
                "ok": self.runtime.analyzer is not None,
                "ready": self.runtime.analyzer is not None,
                "service": "npc-int-nlp",
                "version": VERSION,
                "requestedBackend": self.runtime.requested_backend,
                "backend": self.runtime.backend,
                "model": self.runtime.model,
                "fallbackReason": self.runtime.error,
            })
            return
        self._json({"ok": False, "error": "not found"}, 404)

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/v1/analyze":
            self._json({"ok": False, "error": "not found"}, 404); return
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
            payload = json.loads(self.rfile.read(length) or b"{}")
            text = payload.get("text")
            if not isinstance(text, str):
                self._json({"ok": False, "error": "field 'text' must be a string"}, 400); return
            if len(text) > 50_000:
                self._json({"ok": False, "error": "text too large"}, 413); return
            t0 = time.perf_counter()
            result = self.runtime.analyzer.analyze(text)
            result["elapsedMs"] = round((time.perf_counter() - t0) * 1000, 2)
            self._json(result)
        except Exception as exc:
            self._json({"ok": False, "error": f"{type(exc).__name__}: {exc}"}, 500)

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stdout.write("[nlp] " + (fmt % args) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--backend", choices=["auto", "stanza", "heuristic"], default="auto")
    parser.add_argument("--model-dir", default=os.environ.get("STANZA_RESOURCES_DIR"))
    parser.add_argument("--gpu", action="store_true", help="Ask Stanza/PyTorch to use CUDA")
    args = parser.parse_args()

    runtime = AnalyzerRuntime(args.backend, args.model_dir, args.gpu)
    runtime.load()
    Handler.runtime = runtime
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[nlp] http://{args.host}:{args.port} backend={runtime.backend} model={runtime.model}")
    if runtime.error:
        print(f"[nlp] auto fallback reason: {runtime.error}")
    print("[nlp] health=/health analyze=/v1/analyze")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
