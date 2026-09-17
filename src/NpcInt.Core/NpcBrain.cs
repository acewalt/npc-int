using System;
using System.Collections.Generic;
using System.Linq;

namespace NpcInt.Core
{
    public sealed class NpcBrain
    {
        private readonly Random _random;
        private float _minutesSinceConversation;
        private string _lastNpcLine = string.Empty;

        public NpcIdentity Identity { get; private set; }
        public Personality Personality { get; private set; }
        public DriveState Drives { get; private set; }
        public MoodState Mood { get; private set; }
        public RelationState Relation { get; private set; }
        public MemoryStore Memory { get; private set; }
        public IDictionary<string, string> Facts { get { return _facts; } }
        public IReadOnlyList<DialoguePattern> LearnedDialogue { get { return _dialogue; } }

        private readonly Dictionary<string, string> _facts = new Dictionary<string, string>();
        private readonly List<DialoguePattern> _dialogue = new List<DialoguePattern>();

        public NpcBrain(int randomSeed = 1337)
        {
            _random = new Random(randomSeed);
            Identity = new NpcIdentity();
            Personality = new Personality();
            Drives = new DriveState();
            Mood = new MoodState();
            Relation = new RelationState();
            Memory = new MemoryStore();
            Memory.Add("self", Identity.Name, "Fui iniciado. Mi propósito declarado es: " + Identity.Purpose, 0.95f, 0.1f);
        }

        public BrainTurn ProcessMessage(string message, string speaker = "Jugador")
        {
            return ProcessMessageInternal(message, speaker, null);
        }

        public BrainTurn ProcessMessageAnalyzed(string message, DialogueAct language, string speaker = "Jugador")
        {
            return ProcessMessageInternal(message, speaker, language);
        }

        private BrainTurn ProcessMessageInternal(string message, string speaker, DialogueAct language)
        {
            message = (message ?? string.Empty).Trim();
            var stimulus = new Stimulus(StimulusType.UserMessage, speaker, message);
            AnalyzeStimulus(stimulus);

            Relation.Familiarity = MathUtil.Clamp01(Relation.Familiarity + 0.025f);
            Drives.Social = MathUtil.Clamp01(Drives.Social - 0.18f);
            Drives.Curiosity = MathUtil.Clamp01(Drives.Curiosity + stimulus.Novelty * 0.035f);
            Drives.Threat = MathUtil.Clamp01(Drives.Threat + stimulus.Threat * 0.72f);
            _minutesSinceConversation = 0f;

            float valence = Sentiment(message);
            Mood.Valence = MathUtil.Clamp(Mood.Valence * 0.78f + valence * 0.38f, -1f, 1f);
            Mood.Arousal = MathUtil.Clamp01(Mood.Arousal + 0.08f + stimulus.Threat * 0.45f);

            MemoryEntry current = Memory.Add("dialogue", speaker, message, stimulus.Importance, valence);
            ExtractFacts(message);

            var turn = BuildTurn(stimulus, current.Id);
            if (language != null)
            {
                string summary = DescribeLanguage(language);
                turn.Thoughts.Insert(Math.Min(1, turn.Thoughts.Count),
                    new Thought(ThoughtKind.Reflection, summary, Math.Max(0.55f, language.Confidence)));
                Memory.Add("language", "nlp", summary, 0.40f, 0f);
            }

            turn.Action = DecideConversationAction(message, turn, language);
            ApplyActionEffects(turn.Action);
            return FinishTurn(turn);
        }

        public BrainTurn ProcessWorldEvent(string description, float importance = 0.6f, float threat = 0f)
        {
            description = (description ?? string.Empty).Trim();
            var stimulus = new Stimulus(StimulusType.WorldEvent, "mundo", description)
            {
                Importance = MathUtil.Clamp01(importance),
                Threat = MathUtil.Clamp01(threat)
            };
            AnalyzeStimulus(stimulus);
            stimulus.Threat = Math.Max(stimulus.Threat, MathUtil.Clamp01(threat));

            Drives.Curiosity = MathUtil.Clamp01(Drives.Curiosity + stimulus.Novelty * 0.16f);
            Drives.Threat = MathUtil.Clamp01(Drives.Threat + stimulus.Threat * 0.78f);
            Mood.Arousal = MathUtil.Clamp01(Mood.Arousal + stimulus.Importance * 0.12f + stimulus.Threat * 0.45f);

            MemoryEntry current = Memory.Add("world", "mundo", description, stimulus.Importance, -stimulus.Threat);
            var turn = BuildTurn(stimulus, current.Id);
            turn.Action = DecideWorldAction(turn);
            ApplyActionEffects(turn.Action);
            return FinishTurn(turn);
        }

        public BrainTurn Tick(float minutes = 1f)
        {
            if (minutes < 0f) minutes = 0f;
            _minutesSinceConversation += minutes;
            Drives.Tick(minutes, Personality);
            Mood.Decay(minutes);

            var stimulus = new Stimulus(StimulusType.Time, "interno", "Pasó tiempo sin un estímulo externo.")
            {
                Importance = 0.2f,
                Novelty = 0.05f
            };
            var turn = BuildTurn(stimulus, -1);
            turn.Action = DecideIdleAction(turn);
            ApplyActionEffects(turn.Action);
            return FinishTurn(turn);
        }

        public void Teach(string trigger, string response)
        {
            trigger = (trigger ?? string.Empty).Trim();
            response = (response ?? string.Empty).Trim();
            if (trigger.Length == 0 || response.Length == 0) return;

            DialoguePattern existing = _dialogue.FirstOrDefault(x => MemoryStore.TextSimilarity(x.Trigger, trigger) > 0.93f);
            if (existing != null) existing.Response = response;
            else _dialogue.Add(new DialoguePattern(trigger, response));

            Memory.Add("learning", "entrenamiento", "Si escucho «" + trigger + "», puedo responder «" + response + "».", 0.72f, 0.05f);
        }

        public string DescribeState()
        {
            return Identity.Name + " | ánimo=" + Mood.Label + " | impulso=" + Drives.DominantName() +
                   " | familiaridad=" + Relation.Familiarity.ToString("0.00") +
                   " | confianza=" + Relation.Trust.ToString("0.00") +
                   " | recuerdos=" + Memory.Items.Count;
        }

        private BrainTurn BuildTurn(Stimulus stimulus, long currentMemoryId)
        {
            var turn = new BrainTurn { Stimulus = stimulus };
            turn.Thoughts.Add(new Thought(ThoughtKind.Observation, Observe(stimulus), 0.65f));

            if (!string.IsNullOrWhiteSpace(stimulus.Text))
            {
                List<MemoryEntry> recalls = Memory.Recall(stimulus.Text, 2, currentMemoryId);
                if (recalls.Count > 0)
                    turn.Thoughts.Add(new Thought(ThoughtKind.Recall, "Esto se relaciona con: «" + recalls[0].Text + "».", 0.55f + recalls[0].Salience * 0.25f));
            }

            turn.Thoughts.Add(new Thought(ThoughtKind.Appraisal, Appraise(stimulus), 0.72f));
            string dominant = Drives.DominantName();
            turn.Thoughts.Add(new Thought(ThoughtKind.Goal, GoalThought(dominant), Drives.Get(dominant)));

            if (stimulus.Type == StimulusType.Time && _minutesSinceConversation > 4f)
                turn.Thoughts.Add(new Thought(ThoughtKind.Reflection, "Nadie me está hablando. Aun así, mi estado sigue cambiando y puedo iniciar una acción por cuenta propia.", 0.62f));

            return turn;
        }

        private NpcAction DecideConversationAction(string message, BrainTurn turn, DialogueAct language)
        {
            string normalized = MemoryStore.Normalize(message);
            bool question = message.Contains("?") || StartsWithAny(normalized, "quien", "que", "como", "cuando", "donde", "por que", "porque", "cual", "puedes", "sabes");
            bool greeting = ContainsAny(normalized, "hola", "buenas", "hey", "saludos");

            DialoguePattern learned = BestLearnedMatch(message);
            if (learned != null)
            {
                learned.Uses++;
                return Speak(learned.Response, "coincidencia con una asociación de diálogo aprendida", 0.96f);
            }

            if (turn.Stimulus.Threat > 0.55f)
                return Speak("Eso eleva mi nivel de alerta. Prefiero entender qué está pasando antes de actuar a ciegas.", "el estímulo fue interpretado como amenaza", 0.95f);

            NpcAction semantic = DecideSemanticConversationAction(language, message);
            if (semantic != null) return semantic;

            string identityReply = IdentityReply(normalized);
            if (identityReply != null)
                return Speak(identityReply, "la pregunta activa el modelo de identidad del NPC", 0.94f);

            if (ContainsAny(normalized, "que recuerdas de mi", "que sabes de mi", "recuerdas de mi"))
                return Speak(DescribeKnownOther(), "el jugador pidió recuperar memoria semántica sobre sí mismo", 0.94f);

            if (ContainsAny(normalized, "como estas", "como te sientes", "que sientes"))
                return Speak("Ahora estoy " + Mood.Label + ". Mi impulso dominante es " + Drives.DominantName() + ".", "consulta directa del estado interno", 0.92f);

            string name = ExtractName(message);
            if (!string.IsNullOrEmpty(name))
                return Speak("Entendido. Te llamaré " + name + ".", "se aprendió una identidad del interlocutor", 0.88f);

            if (greeting)
                return Speak(Pick("Hola. Estoy atento.", "Hola. ¿Qué está pasando aquí?", "Te escucho. Llevaba un rato observando."), "saludo social", 0.82f);

            if (question)
            {
                List<MemoryEntry> recalls = Memory.Recall(message, 2);
                if (recalls.Count > 1)
                    return Speak("No tengo una respuesta segura. Lo más relacionado que recuerdo es: «" + recalls[1].Text + "». ¿Eso tiene que ver con lo que preguntas?", "pregunta sin conocimiento explícito; se usa memoria asociativa con incertidumbre", 0.73f);
                return Speak("Todavía no sé responder eso con seguridad. Puedo recordarlo y formar una respuesta mejor cuando tenga más contexto.", "pregunta fuera del conocimiento actual", 0.67f);
            }

            if (Drives.Curiosity > 0.54f && message.Length > 5)
                return Ask("Dices «" + Shorten(message, 72) + "». ¿Qué parte de eso debería considerar importante?", "la curiosidad supera el umbral y el mensaje aporta información nueva", 0.68f);

            return Speak(Pick("Entiendo. Lo guardaré como parte del contexto.", "Lo recordaré. Puede cambiar lo que haga después.", "Queda registrado; todavía no sé cuánto debería pesar en mis decisiones."), "respuesta social mínima ante una afirmación", 0.58f);
        }

        private NpcAction DecideSemanticConversationAction(DialogueAct language, string message)
        {
            if (language == null || string.IsNullOrWhiteSpace(language.Intent)) return null;

            switch (language.Intent)
            {
                case "ask_activity":
                    return Speak("Ahora mismo estoy procesando lo que dices, manteniendo memoria del contexto y evaluando mi siguiente decisión.",
                        "acto de diálogo NLP: actividad presente", 0.95f);

                case "ask_desired_action":
                    return Speak("Ahora mismo quiero " + GoalThought(Drives.DominantName()).Replace("Quiero ", string.Empty).TrimEnd('.') + ".",
                        "acto de diálogo NLP: intención/preferencia actual", 0.95f);

                case "ask_future_action":
                    return Speak(DescribeNextIntention(), "acto de diálogo NLP: acción futura", 0.95f);

                case "ask_capabilities":
                    return Speak("Puedo mantener memoria, estado interno, relaciones, objetivos y decisiones. Si recibo análisis NLP también puedo usar lemas, morfología, dependencias, entidades y referencias para interpretar mejor lo que dices.",
                        "acto de diálogo NLP: consulta de capacidades", 0.97f);

                case "ask_memory_semantic":
                    return Speak(DescribeRecentMemory(), "acto de diálogo NLP: recuperación de memoria", 0.95f);

                case "ask_understanding":
                    return Speak(DescribeUnderstanding(language), "acto de diálogo NLP: petición de interpretación", 0.95f);

                case "ask_state":
                    return Speak("Ahora estoy " + Mood.Label + ". Mi impulso dominante es " + Drives.DominantName() + ".",
                        "acto de diálogo NLP: consulta del estado interno", 0.95f);

                default:
                    return null;
            }
        }

        private string DescribeLanguage(DialogueAct language)
        {
            var parts = new List<string>();
            if (!string.IsNullOrWhiteSpace(language.Intent)) parts.Add("intención=" + language.Intent);
            if (!string.IsNullOrWhiteSpace(language.Predicate)) parts.Add("predicado=" + language.Predicate);
            if (!string.IsNullOrWhiteSpace(language.Agent)) parts.Add("agente=" + language.Agent);
            if (!string.IsNullOrWhiteSpace(language.Patient)) parts.Add("paciente=" + language.Patient);
            if (language.Negative) parts.Add("polaridad=negativa");
            if (language.Entities != null && language.Entities.Count > 0)
                parts.Add("entidades=" + string.Join(", ", language.Entities.Take(4).Select(x => x.text + ":" + x.type).ToArray()));
            if (language.Coreferences != null && language.Coreferences.Count > 0)
                parts.Add("referencias=" + string.Join(", ", language.Coreferences.Take(3).Select(x => x.mention + "→" + x.antecedent).ToArray()));
            return "Análisis lingüístico: " + (parts.Count > 0 ? string.Join("; ", parts.ToArray()) : "sin acto semántico resuelto") + ".";
        }

        private string DescribeUnderstanding(DialogueAct language)
        {
            var parts = new List<string>();
            if (!string.IsNullOrWhiteSpace(language.Intent)) parts.Add("lo interpreto como «" + language.Intent + "»");
            if (!string.IsNullOrWhiteSpace(language.Predicate)) parts.Add("el predicado principal es «" + language.Predicate + "»");
            if (!string.IsNullOrWhiteSpace(language.Agent)) parts.Add("el agente parece ser «" + language.Agent + "»");
            if (!string.IsNullOrWhiteSpace(language.Patient)) parts.Add("el objeto o paciente parece ser «" + language.Patient + "»");
            if (language.Coreferences != null && language.Coreferences.Count > 0)
                parts.Add("resuelvo «" + language.Coreferences[0].mention + "» como referencia a «" + language.Coreferences[0].antecedent + "»");
            return parts.Count == 0
                ? "Entendí el mensaje, pero todavía no puedo resumir su estructura semántica con suficiente seguridad."
                : "De tu frase, " + string.Join("; ", parts.ToArray()) + ".";
        }

        private string DescribeRecentMemory()
        {
            List<MemoryEntry> items = Memory.Items
                .Where(x => x.Kind != "npc-speech" && x.Kind != "language")
                .Reverse()
                .Take(4)
                .ToList();
            if (items.Count == 0)
                return "Todavía no tengo recuerdos significativos suficientes.";
            return "Lo más reciente que recuerdo es: " + string.Join(" | ", items.Select(x => "[" + x.Kind + "] " + x.Text).ToArray()) + ".";
        }

        private string DescribeNextIntention()
        {
            switch (Drives.DominantName())
            {
                case "amenaza": return "Primero voy a reducir el riesgo y observar qué está ocurriendo antes de hacer algo más.";
                case "curiosidad": return "Voy a intentar obtener información concreta antes de elegir una acción más costosa.";
                case "social": return "Voy a mantener la conversación y comprobar qué información necesito de ti.";
                case "fatiga": return "Voy a reducir actividad y conservar recursos mientras no haya una urgencia.";
                case "propósito": return "Voy a buscar una acción que encaje con mi propósito y con lo que sé del entorno.";
                case "autonomía": return "Voy a intentar iniciar una acción propia en vez de limitarme a esperar una orden.";
                default: return "Voy a observar el contexto antes de decidir el siguiente paso.";
            }
        }

        private NpcAction DecideWorldAction(BrainTurn turn)
        {
            if (Drives.Threat > 0.62f)
                return Speak("Algo cambió en el entorno y no me parece seguro. Voy a mantenerme alerta.", "la presión de amenaza domina la utilidad", 0.91f);

            if (Drives.Curiosity > 0.58f && turn.Stimulus.Novelty > 0.35f)
                return new NpcAction { Kind = ActionKind.Investigate, Reason = "evento novedoso + curiosidad alta", Utility = 0.76f, Utterance = "Eso es nuevo. Quiero averiguar qué lo causó." };

            return new NpcAction { Kind = ActionKind.Observe, Reason = "el evento no exige una respuesta inmediata", Utility = 0.48f, Utterance = string.Empty };
        }

        private NpcAction DecideIdleAction(BrainTurn turn)
        {
            if (Drives.Threat > 0.64f)
                return Speak("No consigo ignorar la sensación de peligro. Necesito comprobar el entorno.", "amenaza persistente durante inactividad", 0.88f);

            if (Drives.Social > 0.72f && _minutesSinceConversation > 5f)
            {
                MemoryEntry recent = Memory.MostRecent(x => x.Kind == "dialogue" || x.Kind == "world");
                string line = recent == null
                    ? "Ha pasado bastante tiempo. ¿Hay alguien ahí?"
                    : "Sigo pensando en «" + Shorten(recent.Text, 64) + "». No quiero dejarlo simplemente pasar.";
                return Speak(line, "necesidad social alta durante silencio prolongado", 0.79f);
            }

            if (Drives.Curiosity > 0.78f)
            {
                MemoryEntry recent = Memory.MostRecent(x => x.Kind != "self");
                string line = recent == null
                    ? "Tengo demasiadas preguntas y muy poca información sobre este lugar."
                    : "Me pregunto si «" + Shorten(recent.Text, 58) + "» tendrá consecuencias después.";
                return Speak(line, "curiosidad acumulada sin estímulos nuevos", 0.74f);
            }

            if (Drives.Purpose > 0.80f)
                return Speak("No quiero limitarme a esperar órdenes. Necesito encontrar algo que hacer que encaje con mi propósito.", "presión de propósito alta", 0.73f);

            return new NpcAction { Kind = ActionKind.StaySilent, Reason = "ningún impulso supera el umbral de iniciativa", Utility = 0.40f };
        }

        private BrainTurn FinishTurn(BrainTurn turn)
        {
            turn.DominantDrive = Drives.DominantName();
            turn.Mood = Mood.Label;
            if ((turn.Action.Kind == ActionKind.Speak || turn.Action.Kind == ActionKind.AskQuestion) && !string.IsNullOrWhiteSpace(turn.Action.Utterance))
            {
                _lastNpcLine = turn.Action.Utterance;
                Memory.Add("npc-speech", Identity.Name, turn.Action.Utterance, 0.42f, Mood.Valence);
            }
            return turn;
        }

        private void ApplyActionEffects(NpcAction action)
        {
            if (action == null) return;
            if (action.Kind == ActionKind.Speak || action.Kind == ActionKind.AskQuestion)
            {
                Drives.Social = MathUtil.Clamp01(Drives.Social - 0.12f);
                Drives.Purpose = MathUtil.Clamp01(Drives.Purpose - 0.05f);
            }
            if (action.Kind == ActionKind.Investigate)
            {
                Drives.Curiosity = MathUtil.Clamp01(Drives.Curiosity - 0.18f);
                Drives.Autonomy = MathUtil.Clamp01(Drives.Autonomy - 0.10f);
            }
        }

        private void AnalyzeStimulus(Stimulus stimulus)
        {
            string n = MemoryStore.Normalize(stimulus.Text);
            List<MemoryEntry> similar = Memory.Recall(stimulus.Text, 1);
            float similarity = similar.Count == 0 ? 0f : MemoryStore.TextSimilarity(stimulus.Text, similar[0].Text);
            stimulus.Novelty = MathUtil.Clamp01(1f - similarity);
            stimulus.Threat = Math.Max(stimulus.Threat, ThreatScore(n));
            stimulus.Importance = MathUtil.Clamp01(0.35f + stimulus.Novelty * 0.35f + stimulus.Threat * 0.45f);
        }

        private string Observe(Stimulus stimulus)
        {
            switch (stimulus.Type)
            {
                case StimulusType.UserMessage: return stimulus.Source + " dijo: «" + Shorten(stimulus.Text, 100) + "».";
                case StimulusType.WorldEvent: return "Percibo un cambio en el mundo: «" + Shorten(stimulus.Text, 100) + "».";
                default: return "No llegó un estímulo externo; solo percibo el paso del tiempo y mi propio estado.";
            }
        }

        private string Appraise(Stimulus stimulus)
        {
            if (stimulus.Threat > 0.55f) return "Lo considero potencialmente peligroso; la seguridad tiene prioridad.";
            if (stimulus.Novelty > 0.72f) return "Es información bastante nueva para mí, por lo que aumenta mi curiosidad.";
            if (stimulus.Type == StimulusType.Time) return "No hay urgencia externa. La iniciativa dependerá de mis impulsos acumulados.";
            return "No parece exigir una reacción extrema; puedo responder usando contexto y memoria.";
        }

        private string GoalThought(string dominant)
        {
            switch (dominant)
            {
                case "social": return "Quiero restablecer contacto o comprobar si alguien necesita interacción.";
                case "curiosidad": return "Quiero reducir incertidumbre y obtener información nueva.";
                case "fatiga": return "Quiero reducir actividad y conservar recursos.";
                case "propósito": return "Quiero hacer algo coherente con la razón por la que existo en este mundo.";
                case "autonomía": return "Quiero iniciar una acción propia en lugar de esperar una orden.";
                case "amenaza": return "Quiero reducir el riesgo antes de perseguir otros objetivos.";
                default: return "Quiero mantener un estado estable.";
            }
        }

        private string IdentityReply(string n)
        {
            if (ContainsAny(n, "quien eres", "quien sos"))
                return "Soy " + Identity.Name + ". " + Identity.SelfDescription;
            if (ContainsAny(n, "que eres", "que cosa eres"))
                return "Soy un " + Identity.Kind + "; mi rol es " + Identity.Role + ".";
            if (ContainsAny(n, "tu proposito", "tu objetivo", "por que existes", "para que existes"))
                return "Mi propósito declarado es " + Identity.Purpose + ". Ese propósito orienta mis decisiones, pero mi estado y mis recuerdos pueden cambiar cómo lo interpreto.";
            if (ContainsAny(n, "de donde vienes", "quien te creo", "tu origen"))
                return "Mi origen declarado es " + Identity.Origin + ".";
            if (ContainsAny(n, "que quieres", "que deseas"))
                return "Ahora mismo mi impulso más fuerte es " + Drives.DominantName() + ". No es un deseo humano; es una presión interna que uso para decidir.";
            return null;
        }

        private void ExtractFacts(string message)
        {
            string name = ExtractName(message);
            if (!string.IsNullOrEmpty(name))
            {
                Relation.OtherName = name;
                _facts["player.name"] = name;
                Memory.Add("fact", Relation.OtherName, "El jugador se llama " + name + ".", 0.82f, 0.12f);
            }

            string normalized = MemoryStore.Normalize(message);
            int like = normalized.IndexOf("me gusta ", StringComparison.Ordinal);
            int dislike = normalized.IndexOf("no me gusta ", StringComparison.Ordinal);
            if (like >= 0 && dislike < 0)
            {
                string value = message.Substring(Math.Min(message.Length, like + "me gusta ".Length)).Trim(' ', '.', '!', '?');
                if (value.Length > 0)
                {
                    _facts["player.likes." + MemoryStore.Normalize(value)] = value;
                    Memory.Add("fact", Relation.OtherName, "A " + Relation.OtherName + " le gusta " + value + ".", 0.68f, 0.22f);
                }
            }

            if (dislike >= 0)
            {
                string value = message.Substring(Math.Min(message.Length, dislike + "no me gusta ".Length)).Trim(' ', '.', '!', '?');
                if (value.Length > 0)
                {
                    _facts["player.dislikes." + MemoryStore.Normalize(value)] = value;
                    Memory.Add("fact", Relation.OtherName, "A " + Relation.OtherName + " no le gusta " + value + ".", 0.68f, -0.12f);
                }
            }
        }

        private string ExtractName(string message)
        {
            string n = MemoryStore.Normalize(message);
            string[] markers = { "me llamo ", "mi nombre es " };
            for (int i = 0; i < markers.Length; i++)
            {
                int index = n.IndexOf(markers[i], StringComparison.Ordinal);
                if (index >= 0)
                {
                    int start = index + markers[i].Length;
                    if (start < message.Length)
                    {
                        string tail = message.Substring(start).Trim(' ', '.', ',', '!', '?');
                        string first = tail.Split(new[] { ' ', ',', '.', '!', '?' }, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                        if (!string.IsNullOrWhiteSpace(first))
                            return char.ToUpperInvariant(first[0]) + first.Substring(1).ToLowerInvariant();
                    }
                }
            }
            return null;
        }

        private DialoguePattern BestLearnedMatch(string message)
        {
            DialoguePattern best = null;
            float score = 0.0f;
            foreach (DialoguePattern item in _dialogue)
            {
                float s = MemoryStore.TextSimilarity(message, item.Trigger);
                if (s > score) { score = s; best = item; }
            }
            return score >= 0.60f ? best : null;
        }

        private string DescribeKnownOther()
        {
            var pieces = new List<string>();
            if (_facts.ContainsKey("player.name")) pieces.Add("te llamas " + _facts["player.name"]);
            foreach (var pair in _facts.Where(x => x.Key.StartsWith("player.likes.")).Take(3)) pieces.Add("te gusta " + pair.Value);
            foreach (var pair in _facts.Where(x => x.Key.StartsWith("player.dislikes.")).Take(2)) pieces.Add("no te gusta " + pair.Value);
            if (pieces.Count == 0) return "Todavía sé muy poco de ti. Tengo recuerdos de la conversación, pero ningún dato personal claro que considere estable.";
            return "Por ahora recuerdo que " + string.Join(", y ", pieces.ToArray()) + ".";
        }

        private static float Sentiment(string message)
        {
            string n = MemoryStore.Normalize(message);
            float score = 0f;
            if (ContainsAny(n, "gracias", "bien", "genial", "me gusta", "amigo", "excelente")) score += 0.45f;
            if (ContainsAnyToken(n, "odio", "mal", "malo", "mala", "malos", "malas", "muere", "matar", "peligro") ||
                MentalPerceptionVocabulary.ContainsHostileToken(n)) score -= 0.55f;
            return MathUtil.Clamp(score, -1f, 1f);
        }

        private static float ThreatScore(string n)
        {
            float score = 0f;
            if (ContainsAny(n, "arma", "atacar", "ataque", "matar", "muere", "fuego", "explosion", "peligro", "sangre", "auxilio")) score += 0.72f;
            if (ContainsAny(n, "corre", "huye", "cuidado")) score += 0.28f;
            return MathUtil.Clamp01(score);
        }

        private NpcAction Speak(string text, string reason, float utility)
        {
            if (text == _lastNpcLine) text += " ...Sigo pensando lo mismo, aunque no quiero repetirme.";
            return new NpcAction { Kind = ActionKind.Speak, Utterance = text, Reason = reason, Utility = utility };
        }

        private NpcAction Ask(string text, string reason, float utility)
        {
            return new NpcAction { Kind = ActionKind.AskQuestion, Utterance = text, Reason = reason, Utility = utility };
        }

        private string Pick(params string[] values)
        {
            return values[_random.Next(values.Length)];
        }

        private static string Shorten(string value, int max)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= max) return value ?? string.Empty;
            return value.Substring(0, max - 1).TrimEnd() + "…";
        }

        private static bool ContainsAny(string source, params string[] values)
        {
            for (int i = 0; i < values.Length; i++)
                if (source.IndexOf(values[i], StringComparison.Ordinal) >= 0) return true;
            return false;
        }

        private static bool ContainsAnyToken(string source, params string[] values)
        {
            return MemoryStore.Tokens(source).Overlaps(values);
        }

        private static bool StartsWithAny(string source, params string[] values)
        {
            for (int i = 0; i < values.Length; i++)
                if (source.StartsWith(values[i], StringComparison.Ordinal)) return true;
            return false;
        }
    }
}
