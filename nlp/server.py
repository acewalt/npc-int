#!/usr/bin/env python3
"""npc-int Spanish NLP bridge.

Full local profile:
  Stanza tokenize + MWT + POS/morphology + lemma + dependencies + NER + coref
  -> npc-int semantic role projection -> stable JSON contract.

The dependency-free heuristic backend exists only for CI/fallback.
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
from typing import Any, Dict, List, Optional, Tuple

BASE_PROCESSORS = "tokenize,mwt,pos,lemma,depparse,ner"
FULL_PROCESSORS = BASE_PROCESSORS + ",coref"
VERSION = "1.1"


def norm(text: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", (text or "").lower()) if unicodedata.category(c) != "Mn")


def feats_dict(value: Optional[str]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for piece in str(value or "").split("|"):
        if "=" in piece:
            k, v = piece.split("=", 1); out[k] = v
    return out


def feature_list(feats: Dict[str, str]) -> List[Dict[str, str]]:
    return [{"name": k, "value": v} for k, v in sorted(feats.items())]


def semantic_frame(sentence: Dict[str, Any]) -> Dict[str, Any]:
    toks = sentence["tokens"]
    root = next((t for t in toks if t.get("deprel") == "root"), None) or next((t for t in toks if t.get("upos") in {"VERB", "AUX"}), None)
    subjects = [t for t in toks if str(t.get("deprel", "")).startswith(("nsubj", "csubj"))]
    objects = [t for t in toks if t.get("deprel") in {"obj", "iobj"}]
    obliques = [t for t in toks if str(t.get("deprel", "")).startswith(("obl", "nmod"))]
    negated = any(norm(t.get("lemma") or t.get("text", "")) in {"no", "nunca", "jamas", "tampoco"} for t in toks)
    qwords = [t for t in toks if norm(t.get("lemma") or t.get("text", "")) in {"que", "quien", "cual", "como", "cuando", "donde", "cuanto"}]
    text = sentence.get("text", "")
    speech = "question" if "?" in text or "¿" in text or qwords else "statement"
    if not root and any(t.get("upos") == "INTJ" for t in toks): speech = "social"
    roles: List[Dict[str, Any]] = []
    if root:
        roles += [{"role": "agent", "text": t["text"], "token": t["id"], "confidence": .84} for t in subjects]
        for t in objects:
            roles.append({"role": "recipient" if t.get("deprel") == "iobj" else "patient", "text": t["text"], "token": t["id"], "confidence": .83})
        for t in obliques:
            roles.append({"role": "circumstance", "text": t["text"], "token": t["id"], "confidence": .6})
    return {
        "speechType": speech,
        "predicate": None if not root else {"token": root["id"], "text": root["text"], "lemma": root.get("lemma") or root["text"], "upos": root.get("upos"), "feats": root.get("feats") or {}},
        "roles": roles,
        "negated": negated,
        "questionWords": [t.get("lemma") or t["text"] for t in qwords],
        "confidence": .88 if root else .55,
        "source": "ud-semantic-projection",
    }


def compatible(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    af, bf = a.get("feats") or {}, b.get("feats") or {}
    return all(not af.get(k) or not bf.get(k) or af[k] == bf[k] for k in ("Gender", "Number"))


def heuristic_coref(sentences: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    mentions: List[Dict[str, Any]] = []; out: List[Dict[str, Any]] = []
    pronouns = {"el","ella","ellos","ellas","este","esta","estos","estas","ese","esa","esos","esas","lo","la","los","las","le","les","eso","esto","aquello"}
    for si, sentence in enumerate(sentences):
        for token in sentence["tokens"]:
            if token.get("upos") in {"NOUN","PROPN"}:
                mentions.append({"sentence": si, **token}); mentions = mentions[-32:]; continue
            if token.get("upos") != "PRON" or norm(token.get("text", "")) not in pronouns: continue
            candidates = [m for m in reversed(mentions) if compatible(token, m)]
            if not candidates: continue
            cand = candidates[0]
            out.append({"mention": token["text"], "mentionSentence": si, "mentionToken": token["id"], "antecedent": cand["text"], "antecedentSentence": cand["sentence"], "antecedentToken": cand["id"], "confidence": .55, "source": "npc-int-coref-heuristic", "status": "hypothesis"})
    return out


def stanza_coref(doc: Any) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    refs: List[Dict[str, Any]] = []; chains_json: List[Dict[str, Any]] = []
    for chain in getattr(doc, "coref", None) or []:
        mentions_json: List[Dict[str, Any]] = []
        rep = chain.mentions[chain.representative_index] if chain.representative_index is not None else None
        for mi, mention in enumerate(chain.mentions):
            start, end = mention.start_word, mention.end_word
            if isinstance(start, tuple) or isinstance(end, tuple):
                surface = "_"; token_id = 0
            else:
                words = doc.sentences[mention.sentence].words[start:end]
                surface = " ".join(w.text for w in words); token_id = int(start) + 1
            mentions_json.append({"sentence": mention.sentence, "startWord": start, "endWord": end, "text": surface, "representative": mi == chain.representative_index})
            if rep is not None and mi != chain.representative_index:
                rep_token = 0 if isinstance(rep.start_word, tuple) else int(rep.start_word) + 1
                refs.append({"mention": surface, "mentionSentence": mention.sentence, "mentionToken": token_id, "antecedent": chain.representative_text, "antecedentSentence": rep.sentence, "antecedentToken": rep_token, "confidence": 0.0, "source": "stanza-coref", "status": "model"})
        chains_json.append({"index": chain.index, "representative": chain.representative_text, "mentions": mentions_json, "source": "stanza-coref"})
    return refs, chains_json


class HeuristicAnalyzer:
    name = "heuristic"; model = "npc-int-regex-fallback"; coref_mode = "heuristic"
    token_re = re.compile(r"\w+(?:[-']\w+)*|[^\w\s]", re.UNICODE)
    verbs = {"soy":"ser","eres":"ser","es":"ser","estoy":"estar","estas":"estar","estás":"estar","quiero":"querer","quieres":"querer","hago":"hacer","haces":"hacer","puedo":"poder","puedes":"poder","recuerdo":"recordar","recuerdas":"recordar","entiendo":"entender","entiendes":"entender"}
    pron = {"yo","tu","tú","usted","el","él","ella","nosotros","ustedes","ellos","ellas","lo","la","le"}

    def analyze(self, text: str) -> Dict[str, Any]:
        raw = text or ""; sentences=[]; cursor=0
        pieces = re.split(r"(?<=[.!?])\s+", raw.strip()) if raw.strip() else []
        for si,piece in enumerate(pieces):
            s0=raw.find(piece,cursor); cursor=max(cursor,s0+len(piece)); tokens=[]; root=None
            for i,m in enumerate(self.token_re.finditer(piece),1):
                w=m.group(0); f=norm(w); upos="PUNCT" if re.fullmatch(r"[^\w\s]",w) else "X"; lemma=f; feats={}
                if f in self.pron: upos="PRON"
                if f in self.verbs:
                    upos="VERB";lemma=self.verbs[f];feats={"VerbForm":"Fin"};root=root or i
                    if f.endswith("s"): feats["Person"]="2"
                if f in {"no","nunca","tampoco"}: upos="ADV"
                tokens.append({"id":i,"text":w,"lemma":lemma,"upos":upos,"xpos":None,"feats":feats,"features":feature_list(feats),"head":0 if i==root else (root or 0),"deprel":"root" if i==root else ("advmod" if f=="no" else "dep"),"start":s0+m.start(),"end":s0+m.end(),"ner":None})
            item={"id":si,"text":piece,"tokens":tokens};item["semanticFrame"]=semantic_frame(item);sentences.append(item)
        refs=heuristic_coref(sentences)
        return {"ok":True,"language":"es","backend":self.name,"model":self.model,"processors":["regex-tokenize","heuristic-pos","semantic-projection"],"corefMode":"heuristic","text":raw,"sentences":sentences,"entities":[],"coreferences":refs,"coreferenceChains":[],"frames":[s["semanticFrame"] for s in sentences]}


class StanzaAnalyzer:
    name = "stanza"
    def __init__(self, model_dir: Optional[str]=None, use_gpu: bool=False, use_coref: bool=True):
        import stanza
        self.coref_error=None; self.coref_enabled=use_coref
        kwargs={"lang":"es","use_gpu":use_gpu,"verbose":False}
        if model_dir: kwargs["dir"]=str(Path(model_dir).expanduser().resolve())
        processors=FULL_PROCESSORS if use_coref else BASE_PROCESSORS
        try:
            self.pipeline=stanza.Pipeline(processors=processors,**kwargs)
        except Exception as exc:
            if not use_coref: raise
            self.coref_error=f"{type(exc).__name__}: {exc}"
            self.coref_enabled=False; processors=BASE_PROCESSORS
            self.pipeline=stanza.Pipeline(processors=processors,**kwargs)
        self.processors=processors; self.model=f"stanza-es:{processors}"; self.coref_mode="neural" if self.coref_enabled else "heuristic-fallback"

    @staticmethod
    def spans(sentence: Any) -> Dict[int,Tuple[Optional[int],Optional[int]]]:
        out={}
        for tok in sentence.tokens:
            for word in tok.words:
                wid=int(word.id) if isinstance(word.id,int) else int(word.id[0]);out[wid]=(getattr(tok,"start_char",None),getattr(tok,"end_char",None))
        return out

    def analyze(self,text:str)->Dict[str,Any]:
        doc=self.pipeline(text or "")
        entities=[{"text":e.text,"type":e.type,"start":getattr(e,"start_char",None),"end":getattr(e,"end_char",None),"source":"stanza-ner"} for e in (getattr(doc,"ents",[]) or [])]
        sentences=[]
        for si,s in enumerate(doc.sentences):
            spans=self.spans(s);tokens=[]
            for w in s.words:
                wid=int(w.id) if isinstance(w.id,int) else int(w.id[0]);start,end=spans.get(wid,(None,None));feats=feats_dict(getattr(w,"feats",None));ner=None
                if start is not None and end is not None:
                    hit=next((e for e in entities if e["start"] is not None and e["end"] is not None and e["start"]<end and e["end"]>start),None);ner=hit["type"] if hit else None
                tokens.append({"id":wid,"text":w.text,"lemma":w.lemma or w.text,"upos":w.upos,"xpos":w.xpos,"feats":feats,"features":feature_list(feats),"head":int(w.head or 0),"deprel":w.deprel,"start":start,"end":end,"ner":ner})
            item={"id":si,"text":getattr(s,"text",None) or " ".join(t["text"] for t in tokens),"tokens":tokens};item["semanticFrame"]=semantic_frame(item);sentences.append(item)
        refs=[];chains=[]
        if self.coref_enabled and getattr(doc,"coref",None): refs,chains=stanza_coref(doc)
        if not refs: refs=heuristic_coref(sentences)
        return {"ok":True,"language":"es","backend":self.name,"model":self.model,"processors":self.processors.split(","),"corefMode":"neural" if chains else "heuristic-fallback","corefFallbackReason":self.coref_error,"text":text or "","sentences":sentences,"entities":entities,"coreferences":refs,"coreferenceChains":chains,"frames":[s["semanticFrame"] for s in sentences]}


@dataclass
class AnalyzerRuntime:
    requested_backend:str;model_dir:Optional[str];use_gpu:bool;use_coref:bool;analyzer:Any=None;error:Optional[str]=None
    def load(self)->None:
        if self.requested_backend=="heuristic": self.analyzer=HeuristicAnalyzer();return
        try:self.analyzer=StanzaAnalyzer(self.model_dir,self.use_gpu,self.use_coref)
        except Exception as exc:
            self.error=f"{type(exc).__name__}: {exc}"
            if self.requested_backend=="stanza": raise
            self.analyzer=HeuristicAnalyzer()
    @property
    def backend(self):return getattr(self.analyzer,"name","unloaded")
    @property
    def model(self):return getattr(self.analyzer,"model","unloaded")


class Handler(BaseHTTPRequestHandler):
    runtime:AnalyzerRuntime
    def headers(self,status=200):
        self.send_response(status);self.send_header("Content-Type","application/json; charset=utf-8");self.send_header("Access-Control-Allow-Origin","*");self.send_header("Access-Control-Allow-Headers","Content-Type");self.send_header("Access-Control-Allow-Methods","GET,POST,OPTIONS");self.end_headers()
    def reply(self,obj,status=200):self.headers(status);self.wfile.write(json.dumps(obj,ensure_ascii=False).encode("utf-8"))
    def do_OPTIONS(self):self.headers(204)
    def do_GET(self):
        if self.path.rstrip("/")=="/health":
            a=self.runtime.analyzer
            self.reply({"ok":a is not None,"ready":a is not None,"service":"npc-int-nlp","version":VERSION,"requestedBackend":self.runtime.requested_backend,"backend":self.runtime.backend,"model":self.runtime.model,"corefMode":getattr(a,"coref_mode",None),"corefFallbackReason":getattr(a,"coref_error",None),"fallbackReason":self.runtime.error});return
        self.reply({"ok":False,"error":"not found"},404)
    def do_POST(self):
        if self.path.rstrip("/")!="/v1/analyze":self.reply({"ok":False,"error":"not found"},404);return
        try:
            n=int(self.headers.get("Content-Length","0") or 0);payload=json.loads(self.rfile.read(n) or b"{}");text=payload.get("text")
            if not isinstance(text,str):self.reply({"ok":False,"error":"field 'text' must be a string"},400);return
            if len(text)>50000:self.reply({"ok":False,"error":"text too large"},413);return
            t=time.perf_counter();result=self.runtime.analyzer.analyze(text);result["elapsedMs"]=round((time.perf_counter()-t)*1000,2);self.reply(result)
        except Exception as exc:self.reply({"ok":False,"error":f"{type(exc).__name__}: {exc}"},500)
    def log_message(self,fmt,*args):sys.stdout.write("[nlp] "+(fmt%args)+"\n")


def main()->int:
    p=argparse.ArgumentParser();p.add_argument("--host",default="127.0.0.1");p.add_argument("--port",type=int,default=8766);p.add_argument("--backend",choices=["auto","stanza","heuristic"],default="auto");p.add_argument("--model-dir",default=os.environ.get("STANZA_RESOURCES_DIR"));p.add_argument("--gpu",action="store_true");p.add_argument("--no-coref",action="store_true",help="Use the lighter pipeline without neural coreference");args=p.parse_args()
    runtime=AnalyzerRuntime(args.backend,args.model_dir,args.gpu,not args.no_coref);runtime.load();Handler.runtime=runtime;server=ThreadingHTTPServer((args.host,args.port),Handler)
    print(f"[nlp] http://{args.host}:{args.port} backend={runtime.backend} model={runtime.model} coref={getattr(runtime.analyzer,'coref_mode',None)}");print("[nlp] health=/health analyze=/v1/analyze")
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
    return 0

if __name__=="__main__":raise SystemExit(main())
