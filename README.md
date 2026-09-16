# npc-int

`npc-int` es una base experimental para NPCs con comportamiento cognitivo local y explicable, pensada para integrarse después en Unity.

La meta no es simular consciencia real. La meta es construir un agente de juego que **mantenga identidad, memoria, necesidades, relación, estado emocional, pensamientos de depuración, objetivos y decisiones**, y que pueda hablar incluso cuando nadie le acaba de preguntar nada.

## Arquitectura v0.1

El cerebro está dividido en capas deliberadamente separadas:

1. **Percepción** — recibe mensajes del jugador, eventos del mundo o el paso del tiempo.
2. **Memoria** — conserva episodios y recupera recuerdos por similitud de palabras.
3. **Modelo de sí mismo** — nombre, tipo, rol, propósito, valores y descripción propia.
4. **Estado interno** — impulsos como sociabilidad, curiosidad, fatiga, propósito, autonomía y amenaza.
5. **Relación** — familiaridad, confianza, afinidad y datos aprendidos sobre el interlocutor.
6. **Pensamiento** — produce observaciones internas estructuradas: observación, recuerdo, evaluación, meta y reflexión.
7. **Decisión** — escoge entre hablar, preguntar, observar, investigar o permanecer en silencio.
8. **Lenguaje** — convierte la decisión en una frase. En esta versión es local y determinista; luego puede sustituirse por un LLM local.

La separación importa: un LLM podrá redactar mejor, pero **no será quien decida por qué el NPC actúa**.

## Estructura

```text
src/NpcInt.Core/          motor C# sin dependencia de Unity
unity/NpcBrainBehaviour.cs ejemplo de integración MonoBehaviour
docs/                     laboratorio web / terminal de depuración
.github/workflows/         despliegue de la demo en GitHub Pages
```

## Qué puede hacer ahora

- Responder preguntas básicas sobre quién es, qué es y cuál es su propósito.
- Recordar el nombre del jugador y preferencias expresadas como `me gusta ...` / `no me gusta ...`.
- Recuperar recuerdos por similitud léxica.
- Mantener impulsos internos que cambian con el tiempo.
- Generar actividad espontánea al pasar tiempo sin interacción.
- Reaccionar a eventos del mundo.
- Aprender pares de diálogo al estilo de un SimSimi controlado con `Teach(trigger, response)`.
- Explicar, para depuración, qué pensamientos internos estructurados llevaron a la acción elegida.

## Prueba web

La carpeta `docs/` incluye un laboratorio estático. Comandos útiles:

```text
/tick 5
/event Se apagaron las luces del pasillo
/teach hola => Hola. Ya te estaba esperando.
/state
/reset
```

También puede activarse el modo **Auto**, que hace avanzar el tiempo del agente sin que el usuario escriba.

## Integración en Unity

`NpcInt.Core` no usa `UnityEngine`, por lo que puede copiarse a `Assets/NpcInt/Core/`. El archivo `unity/NpcBrainBehaviour.cs` muestra un envoltorio mínimo para un GameObject.

Ejemplo conceptual:

```csharp
var brain = new NpcBrain();
BrainTurn turn = brain.ProcessMessage("¿Quién eres?");
Debug.Log(turn.Action.Utterance);

BrainTurn idle = brain.Tick(5f);
if (idle.Action.Kind == ActionKind.Speak)
    Debug.Log(idle.Action.Utterance);
```

## Siguiente arquitectura prevista

- memoria persistente JSON/SQLite;
- memoria episódica + semántica separadas;
- relaciones diferentes por personaje;
- percepción de variables reales de Unity (posición, salud, hora, inventario, clima, presencia de otros NPCs);
- planificador GOAP / utility AI para acciones físicas;
- emociones con decaimiento y causas;
- conocimientos del mundo con grados de certeza y posibilidad de creencias falsas;
- interfaz `ILanguageModel` para Ollama/LM Studio sin acoplar el cerebro a un modelo;
- conversación entre NPCs;
- sueños/reflexión offline y consolidación de memoria;
- herramientas de inspección en Unity Editor.

## GitHub Pages

El workflow incluido publica `docs/` mediante GitHub Pages. GitHub exige habilitar una vez **Settings → Pages → Source → GitHub Actions** para un repositorio nuevo; después los pushes a `main` despliegan automáticamente la demo.
