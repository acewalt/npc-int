# npc-int Neural / Nanochat

Esta carpeta integra Nanochat como **capa neuronal de lenguaje**, no como sustituto del cerebro de `NpcInt.Core`.

```text
percepción -> memoria/estado/objetivos -> MentalCycleEngine -> decisión
                                                     |
                                                     v
                                              NeuralPromptBuilder
                                                     |
                                                     v
                                               Nanochat bridge
                                                     |
                                                     v
                                              frase natural del NPC
```

La acción sigue perteneciendo al motor simbólico. Nanochat recibe la decisión y la expresa de forma natural. Más adelante también puede usarse como analizador semántico/pragmático, pero su salida debe convertirse en hipótesis o datos estructurados antes de afectar acciones físicas.


## Qwen3-0.6B directamente en GitHub Pages

La terminal web también puede usar **Qwen3-0.6B** como realizador de lenguaje sin servidor local. El navegador descarga `onnx-community/Qwen3-0.6B-ONNX` desde Hugging Face y lo ejecuta con Transformers.js + WebGPU.

El flujo web es:

```text
mensaje -> npc-int simbólico -> memoria / relación / cognición / responsePlan
                                                |
                                                v
                                      borrador simbólico
                                                |
                                                v
                                     Qwen3-0.6B WebGPU
                                                |
                                                v
                                      respuesta natural
```

Qwen no decide las acciones del NPC. Recibe un contexto compacto con la decisión y el borrador ya producidos por `npc-int`, y se limita a expresarlos con mayor naturalidad.

Comandos de la terminal:

```text
/neural qwen       activa Qwen3-0.6B y lo carga en WebGPU
/neural status     muestra backend, modelo, progreso y estado
/neural off        vuelve a respuestas puramente simbólicas
/neural reset      descarga el worker de memoria; los archivos pueden seguir en caché
/neural bridge     usa nuevamente el bridge HTTP local
/neural endpoint http://127.0.0.1:8765
```

La primera carga descarga varios cientos de MB. Los pesos **no están incluidos en este repositorio**. Si WebGPU no está disponible o la carga falla, la conversación conserva el fallback simbólico.

## Revisión fijada

`nanochat.lock.json` fija una revisión concreta de `karpathy/nanochat`. El checkout de Nanochat **no se sube** a este repo; `setup_nanochat.py` lo coloca en `neural/vendor/nanochat` y `.gitignore` lo excluye.

Esto evita mezclar el historial y pesos de Nanochat con `npc-int`, y permite actualizarlo deliberadamente cuando cambie su API.

## 1. Probar el bridge sin modelo

Desde la raíz de `npc-int`:

```bash
python neural/bridge/server.py --backend mock
```

Prueba:

```bash
curl http://127.0.0.1:8765/health
```

Y una generación:

```bash
curl -X POST http://127.0.0.1:8765/v1/generate \
  -H "Content-Type: application/json" \
  -d '{"task":"utterance","context":{"decision":{"label":"preguntar por la llave"}}}'
```

El backend `mock` sirve para verificar Unity -> HTTP -> bridge -> respuesta antes de instalar PyTorch o disponer de un checkpoint.

## 2. Instalar Nanochat fijado

```bash
python neural/setup_nanochat.py
```

Después instala sus dependencias dentro de su propio entorno. Para CUDA:

```bash
cd neural/vendor/nanochat
uv sync --extra gpu
```

Para CPU:

```bash
uv sync --extra cpu
```

Nanochat requiere Python >= 3.10. Sus artefactos/checkpoints se gestionan mediante `NANOCHAT_BASE_DIR` (por defecto, el comportamiento upstream usa la caché del usuario).

### Windows + CUDA

Después de `uv sync --extra gpu`, ejecuta el bridge usando el Python del entorno de Nanochat:

```powershell
.\neural\vendor\nanochat\.venv\Scripts\python.exe neural\bridge\server.py --backend nanochat --device-type cuda
```

Si aún no existe un checkpoint SFT/RL compatible, usa `--backend mock` mientras preparas el entrenamiento. `--backend auto` intenta Nanochat y cae a mock si no puede cargarlo.

## 3. Contrato HTTP

Endpoints:

```text
GET  /health
POST /v1/generate
```

El esquema está en `bridge/protocol.schema.json`.

Tareas iniciales:

- `utterance`: verbalizar una decisión ya tomada por `MentalCycleEngine`;
- `interpret`: analizar intención/tono como apoyo, sin ejecutar directamente acciones;
- `reflect`: producir una reflexión lingüística sobre el estado;
- `free`: experimento directo.

Ejemplo conceptual:

```json
{
  "task": "utterance",
  "maxTokens": 160,
  "temperature": 0.6,
  "context": {
    "identity": {"name": "NIA-01"},
    "mentalState": {"fear": 0.31, "curiosity": 0.74},
    "goals": [{"label": "reducir incertidumbre", "priority": 0.78}],
    "decision": {
      "kind": "AskQuestion",
      "label": "preguntar",
      "utility": 0.73
    },
    "memories": ["El jugador dijo que tiene una llave."],
    "knowledge": []
  }
}
```

## 4. Unity

Añade al mismo GameObject:

1. `NpcBrainBehaviour`
2. `NanochatBridgeClient`
3. `NpcNeuralDialogueBehaviour`

`NpcBrainBehaviour` emite `TurnCompleted`. `NpcNeuralDialogueBehaviour` toma el `MentalCycleResult`, construye un `NeuralRequest` con `NeuralPromptBuilder` y consulta el bridge. La respuesta llega al evento `onNeuralUtterance`, que puede conectarse a UI, subtítulos o TTS.

Para no ver dos frases durante pruebas, desactiva `Log Symbolic Speech` en `NpcBrainBehaviour` cuando quieras usar solamente el texto neuronal.

## Regla de arquitectura

Nanochat **no puede ordenar directamente** `Attack()`, `MoveTo()` o acciones equivalentes. El flujo correcto es:

```text
Nanochat puede sugerir/interpretar lenguaje
              |
              v
hechos/hipótesis estructuradas
              |
              v
MentalCycleEngine / reglas de juego
              |
              v
decisión validada
              |
              v
acción Unity
```

Esto mantiene el comportamiento depurable y evita convertir el NPC en una caja negra que controla directamente el mundo.
