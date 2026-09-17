# npc-int

`npc-int` es un experimento de NPC cognitivo local, pensado para terminar integrado en Unity. El objetivo no es simular consciencia real, sino construir un personaje que conserve identidad, memoria, conocimiento, estado interno, relaciones, objetivos y decisiones de forma separada y depurable.

## Demo en vivo

Prueba la terminal web del NPC aquí:

**https://acewalt.github.io/npc-int/**

La demo permite conversar con NIA-01, inspeccionar memoria y estado interno, probar conocimiento, gramática, eventos del mundo, pragmática, discurso y comportamiento autónomo directamente desde el navegador, también en móvil.

## Ciclo mental

La arquitectura actual intenta que cada decisión pase por un ciclo explícito:

```text
                    ┌───────────────┐
                    │   PERCEPCIÓN  │
                    │ ¿Qué ocurre?  │
                    └──────┬────────┘
                           ↓
                    ┌───────────────┐
                    │ ESTADO MENTAL │
                    │ hambre        │
                    │ miedo         │
                    │ curiosidad    │
                    │ confianza     │
                    │ energía       │
                    └──────┬────────┘
                           ↓
          ┌────────────────┼────────────────┐
          ↓                ↓                ↓
     MEMORIA           IDENTIDAD        OBJETIVOS
   qué ocurrió        quién soy        qué quiero
   quién hizo qué     qué creo         prioridades
   relaciones         personalidad     necesidades
          └────────────────┼────────────────┘
                           ↓
                    ┌───────────────┐
                    │ RAZONAMIENTO  │
                    │ opciones      │
                    │ consecuencias │
                    │ conflictos    │
                    └──────┬────────┘
                           ↓
                    ┌───────────────┐
                    │   DECISIÓN    │
                    └──────┬────────┘
                           ↓
                    ┌───────────────┐
                    │    ACCIÓN     │
                    │ hablar        │
                    │ caminar       │
                    │ atacar        │
                    │ preguntar     │
                    │ esperar       │
                    └──────┬────────┘
                           │
                           └────→ vuelve a percibir
```

`mental-cycle.js` implementa esta idea en la demo web y `MentalCycleEngine` hace lo mismo en `NpcInt.Core` para Unity.

Las opciones no se eligen únicamente con `if/else`. Cada acción obtiene una utilidad según:

- prioridad del objetivo activo;
- riesgo estimado;
- coste de energía;
- ganancia de información;
- relación social;
- personalidad/cautela;
- conflictos con identidad y valores.

Por ejemplo, ante peligro el motor puede comparar `observar`, `investigar`, `alejarse`, `defenderse`, `atacar` y `esperar`, y escoger la alternativa con mayor utilidad calculada.

En la terminal:

```text
/mind
/needs
/goals
/options
/need hunger 0.8
/need energy 0.3
```

`/mind` muestra el último ciclo completo: percepción, estado, recuerdos relevantes, identidad, objetivos, opciones, consecuencias, conflictos, decisión y acción seleccionada.

## Memoria de discurso

`discourse.js` mantiene referencias entre turnos separadas de la memoria episódica. Guarda qué dijo el jugador, qué respondió NIA, qué interpretó, qué dijo que registraría o tendría en cuenta y qué expresiones figuradas utilizó.

Esto permite resolver preguntas elípticas como:

```text
Jugador> no sé
NIA-01> Entonces no voy a inventar una respuesta.
Jugador> por qué hablas así
NIA-01> Porque interpreté «no sé» como incertidumbre...

Jugador> queda registrado
Jugador> qué registraste
NIA-01> Registré «...» como contexto conversacional...
```

También aplica anti-repetición a emisiones autónomas, no solo a respuestas de diálogo. Usa `/discourse` para inspeccionar el foco conversacional actual.

## Capa neuronal: Nanochat

`npc-int` incluye una primera integración con **Nanochat de Andrej Karpathy** como capa neuronal opcional de lenguaje.

La regla de arquitectura es:

```text
NpcInt.Core / MentalCycleEngine
          |
          | toma la decisión
          v
NeuralPromptBuilder
          |
          v
Nanochat local bridge
          |
          v
frase natural del NPC
```

Nanochat no controla directamente acciones físicas del juego. El motor simbólico decide; Nanochat verbaliza esa decisión o, en tareas futuras, devuelve interpretaciones que deben pasar por validación estructurada.

Archivos principales:

- `neural/nanochat.lock.json`: revisión fijada de Nanochat.
- `neural/setup_nanochat.py`: clona esa revisión en `neural/vendor/nanochat`.
- `neural/bridge/server.py`: bridge HTTP local con backend `mock` o `nanochat`.
- `neural/bridge/protocol.schema.json`: contrato del bridge.
- `src/NpcInt.Core/NeuralModels.cs`: DTOs, `INeuralLanguageModel` y `NeuralPromptBuilder`.
- `unity/NanochatBridgeClient.cs`: cliente HTTP para Unity.
- `unity/NpcNeuralDialogueBehaviour.cs`: convierte decisiones mentales en solicitudes neuronales.
- `neural-web.js`: permite que la demo de GitHub Pages use el bridge Nanochat que corre en el PC del usuario.

Prueba el bridge sin modelo:

```bash
python neural/bridge/server.py --backend mock
```

Desde la demo web:

```text
/neural check
/neural on
/neural status
/neural off
```

La Page conserva el motor mental y la memoria en JavaScript; en modo neural manda al bridge la entrada, el ciclo mental, objetivos, decisión, discurso, memoria reciente y un borrador simbólico. Si el bridge no responde, hace fallback automático a la respuesta simbólica.

Instala la revisión fijada de Nanochat:

```bash
python neural/setup_nanochat.py
cd neural/vendor/nanochat
uv sync --extra gpu
```

En Windows con CUDA, después puede iniciarse con:

```powershell
.\neural\vendor\nanochat\.venv\Scripts\python.exe neural\bridge\server.py --backend nanochat --device-type cuda
```

La documentación completa está en `neural/README.md`.

## Capas actuales

```text
entrada del jugador / mundo
          |
          v
lenguaje y gramática ---- diccionario / modismos
          |
          v
pragmática + memoria de discurso
          |
          +---- memoria episódica (lo que vivió)
          |
          +---- hechos / relaciones / inferencias
          |
          +---- conocimiento semántico (Wikipedia y packs)
          |
          v
estado mental + necesidades + objetivos
          |
          v
opciones + consecuencias + conflictos
          |
          v
decisión por utilidad
          |
          +----> capa neuronal opcional (Nanochat) -> lenguaje natural
          |
          v
respuesta / acción Unity
```

### Archivos principales

- `app.js`: cerebro web base, memoria e impulsos.
- `conversation.js`: intención, contexto entre turnos y anti-repetición de diálogo.
- `pragmatics.js`: actos de habla, tono, reparación conversacional y relación.
- `discourse.js`: referencias entre turnos, compromisos, causalidad conversacional y anti-repetición global.
- `cognition.js`: hechos, relaciones e inferencias simbólicas pequeñas.
- `mental-cycle.js`: necesidades, objetivos, opciones, consecuencias y decisión por utilidad.
- `grammar.js`: análisis y generación gramatical básica en español.
- `knowledge.js`: conocimiento pequeño, diccionario y Wikipedia online como respaldo.
- `wiki-packs.js`: búsqueda perezosa en corpus Wikipedia alojado en el repo.
- `local-wiki.js`: prioriza la Wikipedia local antes de la consulta online.
- `brain-pipeline.js`: frontera incremental de ejecución para `hear`, `event` y `tick`.
- `src/NpcInt.Core/MentalCycleEngine.cs`: ciclo mental equivalente en C#.
- `src/NpcInt.Core/`: núcleo C# sin dependencia de Unity.
- `unity/NpcBrainBehaviour.cs`: puente entre el cerebro y acciones de Unity.

`brain-pipeline.js` se carga antes de `mental-cycle.js` y `cognitive-state.js`. Ambos módulos ya registran etapas explícitas de preparación/percepción y decisión/actualización; conservan sus comandos y wrappers de `reset`. Los módulos heredados pueden seguir migrándose uno por uno sin cambiar de golpe el orden observable de la cadena. Usa `/pipeline` para inspeccionar el orden registrado y la última traza.

En `hear`, el orden efectivo es `cognitive-state:prepare` y `mental-cycle:perceive` (`before`), luego la cadena legacy —incluida pragmática— y finalmente `mental-cycle:decide` y `cognitive-state:refresh` (`after`). La lista plana de la traza conserva ese orden de ejecución, pero `/pipeline` también muestra la fase de cada etapa.

El vocabulario base de hostilidad vive en `config/mental-cycle.v1.json`. `mental-cycle.js` expone esa vista canónica a `pragmatics.js` y `relationship-model.js`, que solo añaden intensidad y efectos sociales; `MentalPerceptionVocabulary` refleja el mismo contrato en C# para Unity. Los tests comparan JSON, percepción JS, pragmática, relación social y Core C# para impedir que las listas vuelvan a divergir.

## Temas propios e iniciativa social

NIA ya no depende únicamente de repetir algo que el jugador dijo antes para iniciar una conversación. `knowledge/social-topics.es.json` contiene 80 temas curados, con posturas provisionales y preguntas del personaje, repartidos entre videojuegos, desarrollo/Unity/IA local, creatividad/ciencia/cultura y vida cotidiana. No es conocimiento enciclopédico ni una biografía ficticia: cada entrada declara contenido que NIA puede plantear como opinión de personaje.

`initiative-engine.js` cruza ese banco con gustos, preferencias, proyectos, objetivos y el tema activo. Las coincidencias en el nombre del tema pesan más que las etiquetas auxiliares, para evitar asociaciones ambiguas. Cuando todavía no conoce intereses del jugador, alterna familias temáticas antes de repetir una. La coincidencia solo cambia la **relevancia** de una entrada; no modifica la postura de NIA para darle siempre la razón al jugador. La selección deja una traza con score, relevancia, novedad, familia, códigos de razón y el recuerdo social que coincidió.

Las prioridades se conservan así:

```text
riesgo urgente
  > idea nueva / hilo pendiente
  > tema propio relevante de NIA
  > tema recurrente genérico
  > silencio
```

Un tema propio usado entra después en `topic-manager.js`, de modo que la conversación puede continuarlo, y su historial se persiste para no repetirlo al recargar. El temporizador social impide que NIA lance uno inmediatamente al arrancar o justo después de que el usuario habló.

Para inspeccionar la decisión:

```text
/initiative
/topics
/social-memory
```

El formato del pack está documentado por `contracts/social-topics.v1.schema.json`. Se pueden añadir temas sin cambiar el selector, siempre que las opiniones sigan siendo revisables y no inventen vivencias humanas.

## Wikipedia local dividida por temas

El repositorio incluye un constructor para generar aproximadamente **300 MiB de texto de Wikipedia** dividido en shards pequeños y por dominios como matemáticas, historia, física, química, biología, medicina, tecnología, informática e IA, astronomía, geografía, filosofía, arte y literatura, lenguaje, sociedad, economía, derecho y política, religión y mitología, deportes y conocimiento general.

La clasificación se configura en `knowledge/topic-map.es.json`.

### Generación local

Descarga el dump `pages-articles` de Wikipedia en español y ejecuta:

```bash
python tools/build_wikipedia_web.py \
  eswiki-latest-pages-articles.xml.bz2 \
  knowledge/wiki \
  --target-mib 300 \
  --shard-mib 4
```

El resultado queda así:

```text
knowledge/wiki/
  manifest.json
  matematicas/
    part-00000.index.json
    part-00000.json
    ...
  historia/
  fisica/
  ...
```

La Page **no descarga los 300 MiB al iniciar**. `wiki-packs.js` decide qué tema consultar, carga el índice de ese tema y después únicamente el shard donde se encuentra el fragmento relevante.

### Generación desde GitHub Actions

Existe el workflow manual:

```text
.github/workflows/build-wikipedia-packs.yml
```

En GitHub abre **Actions → Build Wikipedia knowledge packs → Run workflow** y deja:

```text
target_mib = 300
shard_mib  = 4
```

El workflow descarga el dump oficial, genera `knowledge/wiki/`, comprueba que ningún archivo se acerque al límite de 100 MiB y hace commit del corpus generado.

## Gramática española

`knowledge/grammar.es.json` contiene conocimiento operativo sobre sujeto, verbo, objetos, atributos y complementos, concordancia, artículos y determinantes, negación, interrogación, conectores, pronombres, tiempos verbales básicos, verbos irregulares frecuentes y patrones de generación.

En la terminal:

```text
/grammar La puerta está cerrada
/grammar ¿Por qué Andrés cerró la puerta?
/compose yo | querer | aprender más
```

## Comandos útiles

```text
/help
/state
/thoughts
/memory
/mind
/discourse
/neural on
/neural off
/neural status
/needs
/goals
/options
/pragmatics
/facts
/infer
/knowledge
/wiki
/define ajá
/grammar La puerta está cerrada
/event se apagaron las luces
/tick 10
/auto on
/auto off
```

## Principio de arquitectura

El proyecto mantiene separados percepción, memoria episódica, conocimiento semántico, lexicón, gramática, pragmática, memoria de discurso, hechos/creencias, necesidades/afecto, objetivos, decisión y lenguaje neuronal opcional.

Esto evita que el NPC confunda “Andrés me dijo X” con “Wikipedia dice X”, una hipótesis propia con un hecho recuperado de una fuente externa, una emoción con una necesidad física o una referencia como “eso” con un tema completamente nuevo.
