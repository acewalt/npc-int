# NPC-INT — Companion Architecture

El objetivo de esta capa no es hacer que NIA finja ser humana o consciente. El objetivo es que la interacción tenga **continuidad social, iniciativa, personalidad, memoria selectiva y actividades compartidas**, de modo que el jugador perciba un personaje persistente y no un parser de preguntas.

## Flujo

```text
percepción / mensaje
        ↓
NLP + discurso
        ↓
memoria / mundo / cognición
        ↓
ideas + hipótesis + ciclo mental
        ↓
┌───────────────────────────────┐
│       COMPANION LAYER         │
│ relación                      │
│ memoria social                │
│ personalidad                  │
│ temas                         │
│ pendientes                    │
│ timing / silencio             │
│ iniciativa                    │
└──────────────┬────────────────┘
               ↓
response plan / arbitraje
               ↓
Nanochat opcional
               ↓
respuesta natural
```

## Módulos web

### `relationship-model.js`

Mantiene una relación que evoluciona: familiaridad, confianza, comodidad, rapport, reciprocidad, tensión y presión de límites. No se muestran como porcentajes en conversación normal. Las etapas (`nuevo`, `conocido`, `familiar`, `cercano`) solo alteran conducta y estilo.

### `social-memory.js`

Guarda de forma selectiva datos explícitos útiles para continuidad: nombre, gustos, preferencias, proyectos, objetivos y actualizaciones compartidas. Cada recuerdo conserva fuente, confianza, importancia, recencia y número de menciones.

No es un registro completo del chat. Además, la memoria social persistente excluye categorías sensibles como religión, política, orientación sexual y datos médicos.

### `personality-engine.js`

La personalidad es conductual, no un adjetivo decorativo. Curiosidad, cautela, empatía, directitud, sociabilidad, juego, paciencia, independencia y búsqueda de evidencia alteran el estilo, la iniciativa y la forma de discrepar.

NIA tiene preferencias simuladas de personaje: investigar, resolver problemas conjuntamente, experimentar, explorar y revisar conclusiones ante nueva evidencia.

### `topic-manager.js`

Modela temas como objetos persistentes: activos, dormidos o resueltos. Permite volver a una conversación anterior sin empezar desde cero.

### `pending-thread-manager.js`

Mantiene proyectos, planes futuros, asuntos sin terminar y preguntas abiertas. Una respuesta del usuario puede cerrar una pregunta pendiente; un proyecto explícito se mantiene hasta que se resuelve o se descarta.

### `social-timing.js`

El silencio es una acción válida. Evalúa tiempo desde el último turno, urgencia, novedad, valor de la intervención y cooldown de iniciativa. NIA no debería hablar solo para llenar el silencio.

### `initiative-engine.js`

Puede iniciar un turno cuando existe una razón concreta: retomar un proyecto, compartir una idea nueva, recuperar un tema recurrente, hacer una pregunta dirigida o alertar de riesgo. Evita repetir la misma iniciativa en poco tiempo.

### `companion-persistence.js`

Guarda un resumen social en `localStorage` del navegador. No persiste el chat completo. Comandos:

```text
/companion status
/companion save
/companion load
/companion forget
```

`/companion forget` elimina la memoria social persistente de Companion; no debe presentarse como eliminación de toda la memoria cognitiva del sistema.

### `companion-engine.js`

Árbitro social final. Actualiza relación/memoria/temas/pendientes, naturaliza fallbacks, decide cuándo mencionar un recuerdo y coordina iniciativa y silencio. No cambia arbitrariamente hechos, hipótesis o decisiones del motor cognitivo.

## Nanochat

`neural-web.js` recibe un bloque `companion` con relación, estilo, personalidad, memoria social seleccionada, tema activo, pendiente y plan social. Nanochat puede variar la redacción; no puede inventar recuerdos, aumentar la confianza de una hipótesis ni cambiar la decisión simbólica.

El prompt impide convertir la compañía en dependencia: no debe usar culpa, exclusividad, celos, presión para regresar ni mensajes como «no me dejes».

## C# / Unity

`NpcInt.Core` contiene `CompanionModels.cs` y `CompanionEngine.cs`. `unity/NpcBrainBehaviour.cs` integra el orden:

```text
NLP
 → NpcBrain
 → MentalCycleEngine
 → IdeaFormationEngine
 → CompanionEngine
 → salida / Nanochat
```

En inactividad el `CompanionEngine` puede sustituir monólogos genéricos por una iniciativa contextual o por `StaySilent`.

## Diagnóstico

```text
/companion
/relationship
/social-memory
/topics
/pending
/initiative
/personality
/timing
/modules
```

Los mensajes técnicos de arranque se ocultan en la experiencia conversacional normal y permanecen accesibles con `/modules`.

## Prueba manual recomendada

```text
hola
me llamo Alex
me gusta World of Warcraft
estoy creando un juego de tres carriles
que recuerdas de mi
que hacemos
que te gusta
habla conmigo
/relationship
/social-memory
/topics
/pending
/companion save
```

Después de recargar:

```text
/companion
que recuerdas de mi
que hacemos
```

La prueba válida no es que NIA repita literalmente lo almacenado, sino que pueda usarlo únicamente cuando sea relevante y continuar un hilo anterior sin inventar información.
