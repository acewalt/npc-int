# Capa de conocimiento de npc-int

`npc-int` separa **memoria del personaje** de **conocimiento externo**.

## 1. Memoria episódica

Cosas que el NPC vivió u oyó durante la partida:

- "el jugador dijo que se llama Andrés";
- "se apagaron las luces";
- "hace diez minutos vi una puerta cerrada".

Estas memorias pueden ser personales, incompletas o incluso equivocadas.

## 2. Conocimiento semántico

Información de enciclopedias, manuales, libros u otras fuentes. La demo web carga `core.es.json`, un pack pequeño para probar la arquitectura.

Además, la Page puede consultar Wikipedia en español bajo demanda cuando una pregunta factual no está en el pack local. El artículo recuperado se conserva temporalmente como conocimiento semántico durante esa sesión.

La versión local grande debe usar una base SQLite/FTS en vez de intentar cargar millones de artículos como JSON en el navegador.

### Wikipedia completa/offline

1. Descarga un dump oficial `pages-articles` de la Wikipedia deseada desde Wikimedia Dumps.
2. Ejecuta:

```bash
python tools/build_wikipedia_sqlite.py <dump.xml.bz2> data/wiki-es.db
```

Para probar sin procesar todo el dump:

```bash
python tools/build_wikipedia_sqlite.py <dump.xml.bz2> data/wiki-test.db --limit 5000
```

El constructor trabaja en streaming y crea:

- tabla `articles` con título + texto limpio;
- índice `articles_fts` FTS5 para búsqueda rápida;
- metadatos de idioma y procedencia.

No subas la base resultante al repositorio. Una Wikipedia completa es un recurso local grande y no corresponde a GitHub Pages.

Al redistribuir contenido importado hay que conservar la atribución y cumplir las licencias aplicables de la fuente.

## 3. Lexicón / diccionario

`dictionary.es.json` contiene entradas con:

- palabra;
- variantes ortográficas;
- significado;
- contexto;
- registro lingüístico.

Ejemplo:

```json
{
  "word": "ajá",
  "variants": ["aja", "ajá"],
  "meanings": ["confirmación, seguimiento o invitación a continuar"],
  "contexts": ["puede equivaler a 'sí', 'entiendo' o 'continúa'"],
  "register": "coloquial"
}
```

El objetivo no es solo definir palabras: el lexicón debe ayudar a **interpretar intención**. `qué onda` no debería analizarse literalmente como una pregunta física sobre ondas.

## 4. Sentido común para inferencia local

`commonsense.es.json` es el pack canónico de 170 relaciones generales que comparten `cognition.js` y `concept-graph.js`. `knowledge.js` lo carga una sola vez y publica el mismo snapshot a ambos consumidores, independientemente de si el `fetch` termina antes o después de que se inicialice el grafo.

Cada relación declara `subject`, `predicate`, `object`, `confidence` y uno de cinco dominios: juegos, vida cotidiana, causalidad, objetos o interacción social no sensible. Los conceptos se normalizan a identificadores estables; la confianza expresa que una relación puede ser plausible sin convertirla automáticamente en observación ni certeza.

El contrato está en `contracts/commonsense.v1.schema.json`. Al ampliar el pack:

- conservar relaciones breves y reutilizables por el grafo;
- usar `puede_*` cuando la consecuencia no sea necesaria;
- evitar consejos médicos, legales o financieros y afirmaciones culturales dudosas;
- no duplicar la misma tripleta sujeto/predicado/objeto;
- añadir relaciones causales con señales que puedan comprobarse en el mundo del juego.

## 5. Contenido social del personaje

`social-topics.es.json` no contiene hechos sobre el mundo ni recuerdos del jugador. Contiene 80 temas que NIA puede proponer por iniciativa propia, con una postura provisional y una pregunta de continuidad.

El selector usa `tags` y `relatedTo` para medir afinidad con preferencias, proyectos, objetivos y temas que el usuario ya compartió. Esa afinidad decide **cuándo resulta relevante mencionar una entrada**, pero nunca reescribe la opinión para complacer al usuario.

Reglas del pack:

- no presentar una opinión como hecho enciclopédico;
- no inventar infancia, cuerpo, experiencias humanas ni encuentros pasados;
- no usar exclusividad, culpa o dependencia para sostener la conversación;
- redactar posturas que puedan revisarse ante nueva evidencia;
- mantener identificadores estables, porque el historial anti-repetición los persiste.

El contrato de datos está en `contracts/social-topics.v1.schema.json`.

### Diccionario grande/offline

Para construir una base léxica extensa a partir de un dump de Wiktionary/Wikcionario:

```bash
python tools/build_wiktionary_sqlite.py <dump.xml.bz2> data/dictionary-es.db
```

Prueba rápida:

```bash
python tools/build_wiktionary_sqlite.py <dump.xml.bz2> data/dictionary-test.db --limit 10000
```

Este primer importador conserva una versión textual limpia de cada entrada. Una fase posterior podrá extraer por separado acepciones, categoría gramatical, sinónimos, etimología y ejemplos.

## Arquitectura objetivo

```text
mensaje del jugador
       |
       v
analizador de intención <-- diccionario / modismos
       |
       +----> memoria episódica
       |
       +----> buscador semántico / Wikipedia
       |
       v
creencias + contexto + estado interno
       |
       v
decisión del NPC
       |
       v
generación de lenguaje
```

Un LLM local puede añadirse al final como generador de lenguaje. El conocimiento y las decisiones no deberían depender exclusivamente del LLM.
