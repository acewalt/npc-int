# npc-int

`npc-int` es un experimento de NPC cognitivo local, pensado para terminar integrado en Unity. El objetivo no es simular consciencia real, sino construir un personaje que conserve identidad, memoria, conocimiento, estado interno, relaciones, objetivos y decisiones de forma separada y depurable.

## Demo en vivo

Prueba la terminal web del NPC aquí:

**https://acewalt.github.io/npc-int/**

La demo permite conversar con NIA-01, inspeccionar memoria y estado interno, probar conocimiento, gramática, eventos del mundo y comportamiento autónomo directamente desde el navegador, también en móvil.

## Capas actuales

```text
entrada del jugador / mundo
          |
          v
lenguaje y gramática ---- diccionario / modismos
          |
          v
contexto conversacional
          |
          +---- memoria episódica (lo que vivió)
          |
          +---- conocimiento semántico (Wikipedia y packs)
          |
          v
estado interno + objetivos
          |
          v
decisión
          |
          v
respuesta / acción
```

### Archivos principales

- `app.js`: cerebro web base, memoria e impulsos.
- `conversation.js`: intención, contexto entre turnos y anti-repetición.
- `grammar.js`: análisis y generación gramatical básica en español.
- `knowledge.js`: conocimiento pequeño, diccionario y Wikipedia online como respaldo.
- `wiki-packs.js`: búsqueda perezosa en corpus Wikipedia alojado en el repo.
- `local-wiki.js`: prioriza la Wikipedia local antes de la consulta online.
- `src/NpcInt.Core/`: núcleo C# sin dependencia de Unity.
- `unity/NpcBrainBehaviour.cs`: puente mínimo para Unity.

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

1. **Memoria episódica**: cosas que el NPC vivió u oyó en la partida.
2. **Conocimiento semántico**: Wikipedia, manuales, lore y otras fuentes.
3. **Lexicón**: significado y uso contextual de palabras y modismos.
4. **Gramática**: reglas sobre cómo se forman e interpretan oraciones.
5. **Estado interno**: curiosidad, sociabilidad, autonomía, propósito, amenaza, etc.

Esto evita que el NPC confunda “Andrés me dijo X” con “Wikipedia dice X”, o una hipótesis propia con un hecho recuperado de una fuente externa.
