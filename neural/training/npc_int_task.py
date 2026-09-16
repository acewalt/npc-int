"""Nanochat-compatible local JSONL task for npc-int conversations.

Each line must contain:
    {"messages": [{"role":"user","content":"..."}, {"role":"assistant","content":"..."}]}

An optional leading system message is allowed. This mirrors the conversation
shape consumed by nanochat's SFT tokenizer/render_conversation path.
"""
from __future__ import annotations

import json
from pathlib import Path

from tasks.common import Task


class NpcIntJsonl(Task):
    def __init__(self, path: str | Path, **kwargs):
        super().__init__(**kwargs)
        self.path = Path(path)
        if not self.path.exists():
            raise FileNotFoundError(self.path)
        self.rows = []
        with self.path.open("r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                self._validate(row, line_no)
                self.rows.append(row)

    @property
    def eval_type(self):
        return "generative"

    def num_examples(self):
        return len(self.rows)

    def get_example(self, index):
        row = self.rows[index]
        return {"messages": row["messages"]}

    def evaluate(self, problem, completion):
        # Training dataset only for now. We will add explicit NPC eval tasks later.
        return {}

    @staticmethod
    def _validate(row, line_no):
        messages = row.get("messages")
        if not isinstance(messages, list) or not messages:
            raise ValueError(f"línea {line_no}: messages debe ser una lista no vacía")

        start = 0
        if messages[0].get("role") == "system":
            if not isinstance(messages[0].get("content"), str):
                raise ValueError(f"línea {line_no}: system.content debe ser string")
            start = 1

        rest = messages[start:]
        if len(rest) < 2 or len(rest) % 2 != 0:
            raise ValueError(
                f"línea {line_no}: después del system deben alternar pares user/assistant"
            )

        for i, message in enumerate(rest):
            expected = "user" if i % 2 == 0 else "assistant"
            if message.get("role") != expected:
                raise ValueError(
                    f"línea {line_no}: mensaje {i} role={message.get('role')!r}; esperado {expected!r}"
                )
            if not isinstance(message.get("content"), str):
                raise ValueError(f"línea {line_no}: content debe ser string")
