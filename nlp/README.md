# npc-int NLP español

Esta carpeta contiene la capa lingüística híbrida de `npc-int`.

## Objetivo

La Page conserva un tokenizer determinista en JavaScript para que la demo nunca dependa de un servidor. Cuando el servicio NLP local está activo, el flujo pasa a ser:

```text
texto
  ↓
Stanza español
  ├─ tokenización
  ├─ MWT
  ├─ POS / UPOS
  ├─ morfología
  ├─ lematización
  ├─ dependencias UD
  └─ NER
  ↓
postprocesado npc-int
  ├─ roles semánticos aproximados
  ├─ negación
  ├─ tipo de acto
  └─ hipótesis de coreferencia
  ↓
semantic-interpreter.js
  ↓
DialogueAct
  ↓
memoria / cognición / respuesta
```

El resolvedor de coreferencia y los roles semánticos añadidos por `npc-int` son hipótesis explícitas. No se presentan como una salida neuronal nativa de Stanza.

## Instalación

Desde la raíz del repositorio:

```bash
python -m venv .venv-nlp
```

Windows PowerShell:

```powershell
.\.venv-nlp\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -r nlp\requirements.txt
python nlp\download_models.py
```

Linux/macOS:

```bash
source .venv-nlp/bin/activate
python -m pip install -U pip
python -m pip install -r nlp/requirements.txt
python nlp/download_models.py
```

## Ejecutar

CPU:

```bash
python nlp/server.py --backend stanza
```

CUDA, si la instalación local de PyTorch/Stanza dispone de soporte compatible:

```bash
python nlp/server.py --backend stanza --gpu
```

Servicio por defecto:

```text
http://127.0.0.1:8766
GET  /health
POST /v1/analyze
```

En la demo:

```text
/nlp check
/nlp on
/nlp status
/nlp analyze ¿Qué estás haciendo ahora?
/nlp last
/nlp off
```

`/nlp on` no desactiva el tokenizer JS. Si el bridge deja de responder, la demo conserva sus capas locales como fallback.

## Backend de pruebas

Para probar el contrato sin descargar modelos:

```bash
python nlp/server.py --backend heuristic
```

Ese backend no pretende sustituir al modelo neuronal; solo mantiene el contrato HTTP y permite CI/pruebas de integración.

## Contrato

Una respuesta contiene, entre otros campos:

```json
{
  "backend": "stanza",
  "sentences": [
    {
      "tokens": [
        {
          "text": "quieres",
          "lemma": "querer",
          "upos": "VERB",
          "features": [
            {"name":"Person","value":"2"}
          ],
          "head": 0,
          "deprel": "root"
        }
      ],
      "semanticFrame": {
        "speechType": "question",
        "predicate": {"lemma":"querer"},
        "roles": []
      }
    }
  ],
  "entities": [],
  "coreferences": [],
  "frames": []
}
```

El mismo contrato está representado en `src/NpcInt.Core/NlpModels.cs`, y Unity puede consumirlo con `unity/NlpBridgeClient.cs`.

## Separación respecto a Nanochat

Los puertos son distintos a propósito:

```text
8766  NLP español / comprensión estructurada
8765  Nanochat / generación neuronal
```

El NLP ayuda a decidir qué quiso decir el jugador. Nanochat ayuda a redactar o realizar interpretación neuronal adicional. Ninguno ejecuta acciones físicas directamente; esas siguen pasando por `NpcInt.Core` y el ciclo mental.
