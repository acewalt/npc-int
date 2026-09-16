#!/usr/bin/env python3
"""
npc-int <-> nanochat local bridge.

Runs a small HTTP server on localhost. It can start with:
- mock backend: validates the integration without PyTorch/checkpoints
- nanochat backend: loads Karpathy nanochat from neural/vendor/nanochat

Endpoints:
    GET  /health
    POST /v1/generate

The bridge is intentionally local-first and has no authentication. Do not bind
it to a public interface unless you add authentication/reverse-proxy controls.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_NANOCHAT_ROOT = ROOT / "neural" / "vendor" / "nanochat"


@dataclass
class BridgeConfig:
    backend: str
    nanochat_root: Path
    source: str
    model_tag: str | None
    step: int | None
    device_type: str
    temperature: float
    top_k: int
    max_tokens: int


class Backend:
    name = "base"

    def health(self) -> dict[str, Any]:
        return {"ready": True, "backend": self.name}

    def generate(self, request: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class MockBackend(Backend):
    name = "mock"

    def generate(self, request: dict[str, Any]) -> dict[str, Any]:
        task = str(request.get("task") or "utterance")
        prompt = str(request.get("prompt") or "").strip()
        context = request.get("context") or {}
        decision = context.get("decision") or {}
        action = decision.get("label") or decision.get("kind") or "responder"

        if task == "interpret":
            text = json.dumps(
                {
                    "intent": "unknown",
                    "tone": "neutral",
                    "summary": prompt[:160],
                    "confidence": 0.25,
                },
                ensure_ascii=False,
            )
        elif task == "reflect":
            text = f"Estoy evaluando la situación. Mi decisión actual es {action}."
        else:
            text = f"[mock] Expresaría de forma natural la decisión «{action}»."

        return {
            "ok": True,
            "text": text,
            "backend": self.name,
            "model": "mock",
            "finishReason": "stop",
        }


class NanochatBackend(Backend):
    name = "nanochat"

    def __init__(self, cfg: BridgeConfig):
        root = cfg.nanochat_root.resolve()
        if not root.exists():
            raise RuntimeError(
                f"No existe Nanochat en {root}. Ejecuta: python neural/setup_nanochat.py"
            )

        if str(root) not in sys.path:
            sys.path.insert(0, str(root))

        import torch  # noqa: F401
        from nanochat.common import compute_init, autodetect_device_type
        from nanochat.engine import Engine
        from nanochat.checkpoint_manager import load_model

        device_type = autodetect_device_type() if not cfg.device_type else cfg.device_type
        _ddp, _rank, _local_rank, _world_size, device = compute_init(device_type)
        model, tokenizer, meta = load_model(
            cfg.source,
            device,
            phase="eval",
            model_tag=cfg.model_tag,
            step=cfg.step,
        )

        self.cfg = cfg
        self.device_type = device_type
        self.device = str(device)
        self.model = model
        self.tokenizer = tokenizer
        self.meta = meta
        self.engine = Engine(model, tokenizer)
        self.bos = tokenizer.get_bos_token_id()
        self.user_start = tokenizer.encode_special("<|user_start|>")
        self.user_end = tokenizer.encode_special("<|user_end|>")
        self.assistant_start = tokenizer.encode_special("<|assistant_start|>")
        self.assistant_end = tokenizer.encode_special("<|assistant_end|>")
        self._lock = threading.Lock()

    def health(self) -> dict[str, Any]:
        return {
            "ready": True,
            "backend": self.name,
            "source": self.cfg.source,
            "device": self.device,
            "deviceType": self.device_type,
            "modelTag": self.cfg.model_tag,
            "step": self.cfg.step,
        }

    def _render_prompt(self, request: dict[str, Any]) -> str:
        prompt = str(request.get("prompt") or "").strip()
        if prompt:
            return prompt

        task = str(request.get("task") or "utterance")
        context = request.get("context") or {}
        return (
            "Eres la capa neuronal de lenguaje de un NPC. "
            "No decides acciones físicas: la decisión ya fue tomada por el motor simbólico.\n"
            f"Tarea: {task}\n"
            "Contexto JSON:\n"
            + json.dumps(context, ensure_ascii=False)
        )

    def generate(self, request: dict[str, Any]) -> dict[str, Any]:
        prompt = self._render_prompt(request)
        max_tokens = int(request.get("maxTokens") or self.cfg.max_tokens)
        max_tokens = max(1, min(max_tokens, 512))
        temperature = float(
            request.get("temperature")
            if request.get("temperature") is not None
            else self.cfg.temperature
        )
        top_k = int(request.get("topK") or self.cfg.top_k)

        conversation_tokens = [self.bos]
        conversation_tokens.append(self.user_start)
        conversation_tokens.extend(self.tokenizer.encode(prompt))
        conversation_tokens.append(self.user_end)
        conversation_tokens.append(self.assistant_start)

        response_tokens: list[int] = []
        finish_reason = "max_tokens"

        # A single nanochat Engine/model is shared by all HTTP requests. Serialize
        # generation because the engine owns mutable KV-cache state.
        with self._lock:
            for token_column, _token_masks in self.engine.generate(
                conversation_tokens,
                num_samples=1,
                max_tokens=max_tokens,
                temperature=temperature,
                top_k=top_k,
            ):
                token = token_column[0]
                if token == self.assistant_end:
                    finish_reason = "stop"
                    break
                response_tokens.append(token)

        text = self.tokenizer.decode(response_tokens).strip()
        return {
            "ok": True,
            "text": text,
            "backend": self.name,
            "model": str(self.cfg.model_tag or self.cfg.source),
            "finishReason": finish_reason,
        }


def make_backend(cfg: BridgeConfig) -> Backend:
    requested = cfg.backend.lower()
    if requested == "mock":
        return MockBackend()
    if requested == "nanochat":
        return NanochatBackend(cfg)
    if requested != "auto":
        raise ValueError(f"Backend desconocido: {cfg.backend}")

    try:
        return NanochatBackend(cfg)
    except Exception as exc:
        print(f"[bridge] nanochat no disponible: {exc}", file=sys.stderr)
        print("[bridge] usando backend mock", file=sys.stderr)
        return MockBackend()


def make_handler(backend: Backend):
    class Handler(BaseHTTPRequestHandler):
        server_version = "NpcIntNanochatBridge/0.1"

        def _cors(self) -> None:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

        def _json(self, status: int, payload: dict[str, Any]) -> None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self._cors()
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self) -> None:  # noqa: N802
            if self.path.rstrip("/") == "/health":
                self._json(200, {"ok": True, **backend.health()})
                return
            self._json(404, {"ok": False, "error": "not_found"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path.rstrip("/") != "/v1/generate":
                self._json(404, {"ok": False, "error": "not_found"})
                return

            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 2_000_000:
                    raise ValueError("invalid_content_length")
                body = self.rfile.read(length)
                request = json.loads(body.decode("utf-8"))
                if not isinstance(request, dict):
                    raise ValueError("request_must_be_object")
                response = backend.generate(request)
                self._json(200, response)
            except Exception as exc:
                self._json(
                    500,
                    {
                        "ok": False,
                        "text": "",
                        "backend": backend.name,
                        "error": f"{type(exc).__name__}: {exc}",
                    },
                )

        def log_message(self, fmt: str, *args: Any) -> None:
            print("[bridge] " + fmt % args)

    return Handler


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="npc-int local neural bridge")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--backend", choices=["auto", "mock", "nanochat"], default="auto")
    p.add_argument(
        "--nanochat-root",
        type=Path,
        default=Path(os.environ.get("NPCINT_NANOCHAT_ROOT", DEFAULT_NANOCHAT_ROOT)),
    )
    p.add_argument("--source", choices=["sft", "rl"], default="sft")
    p.add_argument("--model-tag", default=None)
    p.add_argument("--step", type=int, default=None)
    p.add_argument("--device-type", choices=["", "cuda", "cpu", "mps"], default="")
    p.add_argument("--temperature", type=float, default=0.6)
    p.add_argument("--top-k", type=int, default=50)
    p.add_argument("--max-tokens", type=int, default=160)
    return p.parse_args()


def main() -> None:
    args = parse_args()
    cfg = BridgeConfig(
        backend=args.backend,
        nanochat_root=args.nanochat_root,
        source=args.source,
        model_tag=args.model_tag,
        step=args.step,
        device_type=args.device_type,
        temperature=args.temperature,
        top_k=args.top_k,
        max_tokens=args.max_tokens,
    )
    backend = make_backend(cfg)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(backend))
    print(
        f"[bridge] http://{args.host}:{args.port} "
        f"backend={backend.name} health=/health generate=/v1/generate"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[bridge] detenido")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
