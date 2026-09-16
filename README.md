# npc-int

`npc-int` es un experimento de NPC cognitivo local, pensado para terminar integrado en Unity. El objetivo no es simular consciencia real, sino construir un personaje que conserve identidad, memoria, conocimiento, estado interno, relaciones, objetivos y decisiones de forma separada y depurable.

## Demo en vivo

Prueba la terminal web del NPC aquí:

**https://acewalt.github.io/npc-int/**

La demo permite conversar con NIA-01, inspeccionar memoria y estado interno, probar conocimiento, gramática, eventos del mundo, pragmática y comportamiento autónomo directamente desde el navegador, también en móvil.

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

## Capas actuales

```text
entrada del jugador / mundo
          |
          v
lenguaje y gramática ---- diccionario / modismos
          |
          v
pragmática y contexto conversacional
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
          v
respuesta / acción Unity
```

### Archivos principales

- `app.js`: cerebro web base, memoria e impulsos.
- `conversation.js`: intención, contexto entre turnos y anti-repetición.
- `pragmatics.js`: actos de habla, tono, reparación conversacional y relación.
- `cognition.js`: hechos, relaciones e inferencias simbólicas pequeñas.
- `mental-cycle.js`: necesidades, objetivos, opciones, consecuencias y decisión por utilidad.
- `grammar.js`: análisis y generación gramatical básica en español.
- `knowledge.js`: conocimiento pequeño, diccionario y Wikipedia online como respaldo.
- `wiki-packs.js`: búsqueda perezosa en corpus Wikipedia alojado en el repo.
- `local-wiki.js`: prioriza la Wikipedia local antes de la consulta online.
- `src/NpcInt.Core/MentalCycleEngine.cs`: ciclo mental equivalente en C#.
- `src/NpcInt.Core/`: núcleo C# sin dependencia de Unity.
- `unity/NpcBrainBehaviour.cs`: puente entre el cerebro y acciones de Unity.

## Wikipedia local dividida por temas

El repositorio incluye un constructor para generar aproximadamente **300 MiB de texto de Wikipedia** dividido en shards pequeños y por dominios como:

- matemáticas;
- historia;
- física;
- química;
- biología;
- medicina;
- tecnología;
- informática e IA;
- astronomía;
- geografía;
- filosofía;
- arte y literatura;
- lenguaje;
- sociedad;
- economía;
- derecho y política;
- religión y mitología;
- deportes;
- conocimiento general.

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

`knowledge/grammar.es.json` contiene conocimiento operativo sobre:

- sujeto, verbo, objetos, atributos y complementos;
- concordancia sujeto-verbo;
- concordancia sustantivo-adjetivo;
- artículos y determinantes;
- negación;
- interrogación;
- conectores;
- pronombres;
- tiempos verbales básicos;
- verbos irregulares frecuentes;
- patrones de generación de oraciones.

`grammar.js` usa esas reglas para analizar y construir frases. En la terminal:

```text
/grammar La puerta está cerrada
/grammar ¿Por qué Andrés cerró la puerta?
/compose yo | querer | aprender más
```

La gramática no sustituye un modelo de lenguaje completo. Sirve como estructura explícita para que el NPC pueda interpretar y generar oraciones de manera más consistente mientras el proyecto evoluciona.

## Comandos útiles

```text
/help
/state
/thoughts
/memory
/mind
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

El proyecto mantiene separados:

1. **Percepción**: mensajes, eventos del mundo y paso del tiempo.
2. **Memoria episódica**: cosas que el NPC vivió u oyó en la partida.
3. **Conocimiento semántico**: Wikipedia, manuales, lore y otras fuentes.
4. **Lexicón**: significado y uso contextual de palabras y modismos.
5. **Gramática**: reglas sobre cómo se forman e interpretan oraciones.
6. **Pragmática**: qué intenta hacer el interlocutor al hablar y con qué tono.
7. **Hechos/creencias**: relaciones estructuradas e inferencias pequeñas.
8. **Necesidades y afecto**: hambre, energía, miedo, curiosidad y relación.
9. **Objetivos**: prioridades derivadas del estado actual.
10. **Decisión**: comparación de acciones según utilidad, riesgo, coste y conflictos.

Esto evita que el NPC confunda “Andrés me dijo X” con “Wikipedia dice X”, una hipótesis propia con un hecho recuperado de una fuente externa o una emoción con una necesidad física.
