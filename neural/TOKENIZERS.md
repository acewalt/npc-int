# Tokenizers de npc-int

`npc-int` usa **dos tokenizadores distintos** porque resuelven problemas diferentes.

## 1. Tokenizer lingüístico del cerebro simbólico

Archivos:

- `tokenizer.js`
- `tokenizer-refinement.js`
- `knowledge/tokenizer.es.json`
- `grammar-tokenizer-bridge.js`

Este tokenizer corre en el navegador y produce una representación lingüística estructurada. No convierte palabras en IDs de un Transformer. Su salida incluye:

- segmentación Unicode y por oraciones;
- offsets exactos de caracteres;
- URLs, email, fechas, horas, números, dinero, porcentajes, emoji, menciones y hashtags;
- expresiones multipalabra (MWE), por ejemplo `por qué`, `qué onda`, `sin embargo`, `tener en cuenta`;
- contracciones `al` / `del`;
- clíticos adjuntos, por ejemplo `dímelo -> decir + me + lo`;
- lema;
- UPOS compatible con Universal Dependencies;
- rasgos morfológicos (`Person`, `Number`, `Tense`, `Mood`, etc.);
- entidades;
- dependencias sintácticas aproximadas;
- frame semántico básico (predicado, sujeto, objeto, negación, interrogativo, modalidad).

Prueba desde la demo:

```text
/tokenize ¿Por qué NIA-01 no va al pasillo?
/tokenize Dímelo y después revisa la puerta.
/tokenize Qué onda, parce. Todo bien.
```

`grammar-tokenizer-bridge.js` hace que `grammar.js` use esta representación en vez de limitarse a separar palabras por espacios.

## 2. Tokenizer neuronal RustBPE / tiktoken

El Transformer necesita otra representación: **IDs subword aprendidos del corpus**.

`neural/training/train_npc_tokenizer.py` usa directamente `RustBPETokenizer` de la revisión fijada de Nanochat. Por tanto utiliza el mismo enfoque que Nanochat:

```text
texto de entrenamiento
       ↓
regex de pre-tokenización
       ↓
bytes
       ↓
BPE entrenado con rustbpe
       ↓
vocabulario aprendido
       ↓
tiktoken para inferencia rápida
       ↓
IDs enteros
```

El vocabulario por defecto es de **32 768 tokens**, incluyendo los tokens especiales de Nanochat:

```text
<|bos|>
<|user_start|>
<|user_end|>
<|assistant_start|>
<|assistant_end|>
<|python_start|>
<|python_end|>
<|output_start|>
<|output_end|>
```

### Preparación

Primero instala la revisión fijada de Nanochat:

```bash
python neural/setup_nanochat.py
cd neural/vendor/nanochat
uv sync --extra gpu
```

### Entrenar sobre los datos de npc-int

Desde la raíz del repo, usando el Python del entorno de Nanochat:

```powershell
.\neural\vendor\nanochat\.venv\Scripts\python.exe neural\training\train_npc_tokenizer.py --vocab-size 32768
```

Por defecto busca texto en:

```text
knowledge/wiki/
neural/datasets/
knowledge/
```

También se pueden indicar fuentes explícitamente:

```powershell
.\neural\vendor\nanochat\.venv\Scripts\python.exe neural\training\train_npc_tokenizer.py `
  --input knowledge/wiki `
  --input neural/datasets `
  --input corpus/conversaciones.txt `
  --vocab-size 32768 `
  --max-chars 200000000
```

Salida por defecto:

```text
neural/tokenizer/npc-int-es/
  tokenizer.pkl
  npc-int-tokenizer.json
```

El script ejecuta una prueba de **encode -> decode** sobre muestras reales del corpus y aborta si el round-trip no reproduce exactamente el texto.

## Por qué existen los dos

No deben fusionarse:

```text
                 TEXTO
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
TOKENIZER LINGÜÍSTICO      RUSTBPE
        │                     │
UPOS / lema / MWE          token IDs
morfología / entidades        │
dependencias                  ▼
        │                 Transformer
        ▼
Cerebro simbólico
```

El tokenizer lingüístico intenta conservar significado explícito y estructura útil para razonamiento depurable. El BPE optimiza la representación estadística que consume el Transformer. Usar uno para sustituir al otro empeoraría una de las dos tareas.
