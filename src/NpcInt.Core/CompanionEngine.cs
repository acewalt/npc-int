using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace NpcInt.Core
{
    public sealed class CompanionEngine
    {
        private readonly List<SocialMemoryRecord> _lastExtracted = new List<SocialMemoryRecord>();
        public CompanionState State { get; private set; } = new CompanionState();

        public void ObserveUserTurn(NpcBrain brain, string message)
        {
            if (brain == null) return;
            message = (message ?? string.Empty).Trim();
            string n = MemoryStore.Normalize(message);
            CompanionRelationship r = State.Relationship;
            r.Interactions++;
            r.Familiarity = MathUtil.Clamp01(r.Familiarity + 0.012f + Math.Min(0.018f, r.Interactions * 0.00035f));

            float friendly = ContainsAny(n, "gracias", "bacano", "chevere", "genial", "amigo", "amiga", "parce") ? 0.75f :
                             ContainsAny(n, "bien", "vale", "dale") ? 0.25f : 0f;
            float hostile = ContainsAny(n, "malparido", "hijueputa", "idiota", "imbecil", "estupido", "callate", "largate") ? 0.90f : 0f;
            float apology = ContainsAny(n, "perdon", "disculpa", "lo siento") ? 0.75f : 0f;
            bool selfDisclosure = ContainsAny(n, "me gusta", "no me gusta", "prefiero", "quiero", "estoy haciendo", "estoy creando", "estoy trabajando", "me llamo", "mi nombre es");
            bool asksAboutNpc = (n.Contains(" tu") || n.StartsWith("tu ") || n.Contains(" te ")) &&
                                ContainsAny(n, "que", "como", "cual", "donde", "por que", "porque");

            r.Trust = MathUtil.Clamp01(r.Trust + friendly * 0.025f + apology * 0.018f - hostile * 0.08f);
            r.Comfort = MathUtil.Clamp01(r.Comfort + friendly * 0.035f + apology * 0.018f - hostile * 0.10f);
            r.Rapport = MathUtil.Clamp01(r.Rapport + (selfDisclosure ? 0.018f : 0f) + (asksAboutNpc ? 0.012f : 0f) - hostile * 0.08f);
            r.Reciprocity = MathUtil.Clamp01(r.Reciprocity + (asksAboutNpc ? 0.02f : 0f) + (selfDisclosure ? 0.01f : 0f));
            r.Tension = MathUtil.Clamp01(r.Tension * 0.82f + hostile * 0.55f - (apology + friendly) * 0.10f);
            r.BoundaryPressure = MathUtil.Clamp01(r.BoundaryPressure * 0.88f + hostile * 0.42f);
            if (hostile > 0.45f) { r.HostileStreak++; r.PositiveStreak = 0; }
            else { r.HostileStreak = 0; r.PositiveStreak++; }
            UpdateStage(r);

            brain.Relation.Familiarity = r.Familiarity;
            brain.Relation.Trust = r.Trust;
            State.MinutesSinceUser = 0f;

            _lastExtracted.Clear();
            ExtractSocialMemories(brain, message);
            TrackTopic(message);
            TrackPending(message);
            ResolveAnsweredQuestion(message);
        }

        public NpcAction AdaptConversationAction(NpcBrain brain, string message, NpcAction lower, DialogueAct language = null)
        {
            if (brain == null) return lower;
            string intent = Classify(message, language);
            State.LastIntent = intent ?? string.Empty;
            string reply = null;

            switch (intent)
            {
                case "social_greeting": reply = Greeting(brain); break;
                case "farewell": reply = Farewell(); break;
                case "thanks": reply = State.Relationship.Stage == "cercano" ? "Claro. Para eso estamos trabajando juntos." : "De nada. Seguimos."; break;
                case "apology": reply = "Todo bien. Tomo la disculpa como una reparación de la conversación y seguimos desde aquí."; break;
                case "ask_companion_preference": reply = PreferenceAnswer(); break;
                case "ask_personality": reply = PersonalityAnswer(); break;
                case "ask_relationship": reply = RelationshipAnswer(); break;
                case "request_company": reply = CompanyAnswer(); break;
                case "ask_shared_activity": reply = SharedActivity(); break;
                case "ask_social_memory": reply = SocialMemoryAnswer(brain); break;
            }

            if (string.IsNullOrWhiteSpace(reply) && _lastExtracted.Count > 0)
                reply = DisclosureReply(_lastExtracted[0]);

            if (string.IsNullOrWhiteSpace(reply) && lower != null && !string.IsNullOrWhiteSpace(lower.Utterance))
                reply = SoftenFallback(lower.Utterance);

            if (string.IsNullOrWhiteSpace(reply)) return lower;
            var action = new NpcAction
            {
                Kind = lower != null && lower.Kind == ActionKind.AskQuestion && reply.EndsWith("?", StringComparison.Ordinal) ? ActionKind.AskQuestion : ActionKind.Speak,
                Utterance = reply,
                Reason = string.IsNullOrEmpty(intent) ? "companion: naturalización social" : "companion: " + intent,
                Utility = Math.Max(lower == null ? 0f : lower.Utility, 0.78f)
            };
            return action;
        }

        public void ObserveNpcReply(string reply)
        {
            if (string.IsNullOrWhiteSpace(reply)) return;
            State.LastReply = reply;
            State.MinutesSinceNpc = 0f;
            if (reply.Contains("?"))
            {
                string q = reply.Split(new[] { '.', '!', '?' }, StringSplitOptions.RemoveEmptyEntries).LastOrDefault();
                if (!string.IsNullOrWhiteSpace(q)) AddPending("question", q.Trim(), 0.50f, "npc-question");
            }
        }

        public void Advance(float minutes)
        {
            if (minutes < 0f) minutes = 0f;
            State.MinutesSinceUser += minutes;
            State.MinutesSinceNpc += minutes;
            State.MinutesSinceInitiative += minutes;
            State.Relationship.Tension = MathUtil.Clamp01(State.Relationship.Tension - minutes * 0.012f);
            State.Relationship.BoundaryPressure = MathUtil.Clamp01(State.Relationship.BoundaryPressure - minutes * 0.007f);
        }

        public NpcAction AdaptIdleAction(NpcBrain brain, NpcAction lower)
        {
            if (brain == null) return lower;
            if (brain.Drives.Threat > 0.64f) return lower;
            if (State.MinutesSinceUser < 8f)
                return new NpcAction { Kind = ActionKind.StaySilent, Reason = "companion: el usuario habló recientemente", Utility = 0.66f };
            if (State.MinutesSinceInitiative < 16f)
                return new NpcAction { Kind = ActionKind.StaySilent, Reason = "companion: cooldown de iniciativa", Utility = 0.60f };

            CompanionPendingThread pending = BestPending();
            if (pending != null && pending.Kind != "question" && pending.Priority >= 0.62f)
            {
                State.MinutesSinceInitiative = 0f;
                RememberInitiative("pending:" + pending.Id);
                return new NpcAction
                {
                    Kind = ActionKind.Speak,
                    Utterance = "Antes quedó pendiente «" + Shorten(pending.Text, 78) + "». Podemos retomarlo cuando tenga sentido, sin empezar de cero.",
                    Reason = "companion: retomar un hilo compartido pendiente",
                    Utility = 0.78f
                };
            }

            CompanionTopic topic = BestTopic();
            if (topic != null && topic.Mentions > 1 && !RecentlyInitiated("topic:" + topic.Id))
            {
                State.MinutesSinceInitiative = 0f;
                RememberInitiative("topic:" + topic.Id);
                return new NpcAction
                {
                    Kind = ActionKind.Speak,
                    Utterance = "He vuelto a pensar en «" + Shorten(topic.Label, 78) + "». Si lo retomamos, puedo seguir desde lo que ya tenemos en lugar de tratarlo como algo nuevo.",
                    Reason = "companion: tema recurrente con continuidad",
                    Utility = 0.69f
                };
            }

            MemoryEntry world = brain.Memory.MostRecent(x => x.Kind == "world");
            if (world != null && State.MinutesSinceUser > 12f && !RecentlyInitiated("world:" + world.Id))
            {
                State.MinutesSinceInitiative = 0f;
                RememberInitiative("world:" + world.Id);
                return new NpcAction
                {
                    Kind = ActionKind.Speak,
                    Utterance = "Sigo teniendo presente «" + Shorten(world.Text, 76) + "». Si aparece una señal nueva, puedo compararla con lo que ya observé.",
                    Reason = "companion: retomar un evento real del mundo",
                    Utility = 0.67f
                };
            }

            return new NpcAction { Kind = ActionKind.StaySilent, Reason = "companion: no hay una iniciativa suficientemente relevante", Utility = 0.62f };
        }

        public CompanionStyle CurrentStyle(NpcBrain brain)
        {
            CompanionRelationship r = State.Relationship;
            float fear = brain == null ? 0f : brain.Drives.Threat;
            float empathy = GetTrait("empathy", 0.64f);
            float direct = GetTrait("directness", 0.58f);
            float play = GetTrait("playfulness", 0.24f);
            return new CompanionStyle
            {
                Stage = r.Stage,
                Warmth = MathUtil.Clamp01(0.28f + empathy * 0.28f + r.Rapport * 0.20f - r.Tension * 0.22f),
                Casualness = MathUtil.Clamp01(0.24f + r.Familiarity * 0.50f + r.Comfort * 0.22f),
                Directness = MathUtil.Clamp01(direct + (r.Tension > 0.4f ? 0.12f : 0f)),
                Playfulness = MathUtil.Clamp01(play + r.Comfort * 0.14f - fear * 0.35f - r.Tension * 0.45f),
                Curiosity = MathUtil.Clamp01(GetTrait("curiosity", 0.82f) * (brain == null ? 0.7f : brain.Drives.Curiosity)),
                Patience = MathUtil.Clamp01(GetTrait("patience", 0.72f) - r.Tension * 0.25f),
                EpistemicCaution = MathUtil.Clamp01(GetTrait("evidenceSeeking", 0.88f) * 0.75f + GetTrait("caution", 0.67f) * 0.25f),
                AskFollowUp = r.Rapport > 0.34f && r.Tension < 0.45f
            };
        }

        public string DescribeState()
        {
            CompanionRelationship r = State.Relationship;
            return "relación=" + r.Stage + " | interacciones=" + r.Interactions +
                   " | familiaridad=" + r.Familiarity.ToString("0.00") +
                   " | confianza=" + r.Trust.ToString("0.00") +
                   " | comodidad=" + r.Comfort.ToString("0.00") +
                   " | rapport=" + r.Rapport.ToString("0.00") +
                   " | recuerdos_sociales=" + State.SocialMemories.Count +
                   " | temas=" + State.Topics.Count +
                   " | pendientes=" + State.Pending.Count(x => x.Status == "open");
        }

        private string Classify(string message, DialogueAct language)
        {
            string n = MemoryStore.Normalize(message ?? string.Empty).Trim();
            if (language != null && !string.IsNullOrWhiteSpace(language.Intent))
            {
                if (language.Intent == "ask_preference") return "ask_companion_preference";
            }
            if (IsExactAny(n, "hola", "buenas", "hey", "ey", "que onda", "que tal")) return "social_greeting";
            if (IsExactAny(n, "chao", "chau", "adios", "nos vemos", "hasta luego", "me voy", "hablamos luego")) return "farewell";
            if (n.StartsWith("gracias", StringComparison.Ordinal) || n.StartsWith("muchas gracias", StringComparison.Ordinal)) return "thanks";
            if (n.StartsWith("perdon", StringComparison.Ordinal) || n.StartsWith("disculpa", StringComparison.Ordinal) || n.StartsWith("lo siento", StringComparison.Ordinal)) return "apology";
            if (ContainsAny(n, "que te gusta", "que cosas te gustan", "que prefieres", "cuales son tus gustos", "que disfrutas")) return "ask_companion_preference";
            if (IsExactAny(n, "como eres", "como es tu personalidad", "que personalidad tienes", "describete", "como te describirias")) return "ask_personality";
            if (ContainsAny(n, "te caigo bien", "que piensas de mi", "como va nuestra relacion", "somos amigos", "me consideras amigo", "me conoces")) return "ask_relationship";
            if (ContainsAny(n, "habla conmigo", "acompaname", "quiero hablar contigo", "conversemos", "charlemos", "estoy aburrido")) return "request_company";
            if (IsExactAny(n, "que hacemos", "que podemos hacer", "hacemos algo", "que hacemos juntos", "que propones hacer", "que se te ocurre hacer juntos")) return "ask_shared_activity";
            if (ContainsAny(n, "que recuerdas de mi", "que sabes de mi", "que conoces de mi", "te acuerdas de mi")) return "ask_social_memory";
            return null;
        }

        private void ExtractSocialMemories(NpcBrain brain, string message)
        {
            if (IsSensitive(message)) return;
            Match m = Regex.Match(message, @"(?:me llamo|mi nombre es)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ-]{1,40})", RegexOptions.IgnoreCase);
            if (m.Success)
            {
                SocialMemoryRecord rec = AddMemory("name", m.Groups[1].Value, 0.95f);
                if (rec != null) { _lastExtracted.Add(rec); brain.Relation.OtherName = rec.Value; }
            }

            m = Regex.Match(message, @"\bno me gusta(?:n)?\s+(.{2,120})", RegexOptions.IgnoreCase);
            if (m.Success) AddExtracted("dislike", m.Groups[1].Value, 0.66f);
            else
            {
                m = Regex.Match(message, @"\bme gusta(?:n)?\s+(.{2,120})", RegexOptions.IgnoreCase);
                if (m.Success) AddExtracted("like", m.Groups[1].Value, 0.66f);
            }

            m = Regex.Match(message, @"\bprefiero\s+(.{2,120})", RegexOptions.IgnoreCase);
            if (m.Success) AddExtracted("preference", m.Groups[1].Value, 0.70f);

            m = Regex.Match(message, @"\bestoy (?:haciendo|creando|trabajando en|desarrollando|armando)\s+(.{2,140})", RegexOptions.IgnoreCase);
            if (m.Success) AddExtracted("project", m.Groups[1].Value, 0.82f);

            m = Regex.Match(message, @"\bquiero (?:hacer|crear|aprender|probar|terminar)\s+(.{2,140})", RegexOptions.IgnoreCase);
            if (m.Success) AddExtracted("goal", m.Groups[1].Value, 0.78f);
        }

        private void AddExtracted(string kind, string value, float importance)
        {
            SocialMemoryRecord rec = AddMemory(kind, value, importance);
            if (rec != null) _lastExtracted.Add(rec);
        }

        private SocialMemoryRecord AddMemory(string kind, string value, float importance)
        {
            string clean = CleanTail(value);
            if (string.IsNullOrWhiteSpace(clean) || IsSensitive(clean)) return null;
            string key = kind + ":" + MemoryStore.Normalize(clean);
            SocialMemoryRecord existing = State.SocialMemories.FirstOrDefault(x => x.Kind + ":" + MemoryStore.Normalize(x.Value) == key);
            if (existing != null)
            {
                existing.Mentions++;
                existing.LastMentionedUtc = DateTime.UtcNow;
                existing.Importance = MathUtil.Clamp01(Math.Max(existing.Importance, importance) + 0.025f);
                return existing;
            }
            var item = new SocialMemoryRecord { Id = State.NextMemoryId++, Kind = kind, Value = clean, Importance = importance, Confidence = 0.90f };
            State.SocialMemories.Add(item);
            while (State.SocialMemories.Count > 120)
            {
                SocialMemoryRecord weakest = State.SocialMemories.OrderBy(x => x.Importance + x.Mentions * 0.03f).First();
                State.SocialMemories.Remove(weakest);
            }
            return item;
        }

        private void TrackTopic(string message)
        {
            if (IsSensitive(message)) return;
            string topic = ExtractTopic(message);
            if (string.IsNullOrWhiteSpace(topic)) return;
            string key = MemoryStore.Normalize(topic);
            CompanionTopic item = State.Topics.FirstOrDefault(x => x.Key == key);
            if (item == null)
            {
                item = new CompanionTopic { Id = State.NextTopicId++, Key = key, Label = topic, Importance = 0.58f };
                State.Topics.Add(item);
            }
            foreach (CompanionTopic other in State.Topics)
                if (other.Id != item.Id && other.Status == "active") other.Status = "dormant";
            item.Status = "active";
            item.Mentions++;
            item.LastMentionedUtc = DateTime.UtcNow;
            item.Importance = MathUtil.Clamp01(item.Importance + 0.015f);
            State.ActiveTopicId = item.Id;
        }

        private void TrackPending(string message)
        {
            if (IsSensitive(message)) return;
            Match m = Regex.Match(message, @"\bestoy (?:haciendo|creando|trabajando en|desarrollando|armando)\s+(.{2,140})", RegexOptions.IgnoreCase);
            if (m.Success) AddPending("project", m.Groups[1].Value, 0.78f, "active-project");
            m = Regex.Match(message, @"\bquiero (?:hacer|crear|aprender|probar|terminar)\s+(.{2,140})", RegexOptions.IgnoreCase);
            if (m.Success) AddPending("project", m.Groups[1].Value, 0.75f, "user-goal");
            string n = MemoryStore.Normalize(message);
            if (ContainsAny(n, "ya lo hice", "ya termine", "listo ya", "lo termine"))
            {
                CompanionPendingThread p = BestPending();
                if (p != null) p.Status = "resolved";
            }
        }

        private CompanionPendingThread AddPending(string kind, string text, float priority, string source)
        {
            string clean = CleanTail(text);
            if (string.IsNullOrWhiteSpace(clean) || IsSensitive(clean)) return null;
            string key = kind + ":" + MemoryStore.Normalize(clean);
            CompanionPendingThread existing = State.Pending.FirstOrDefault(x => x.Kind + ":" + MemoryStore.Normalize(x.Text) == key && x.Status != "resolved");
            if (existing != null)
            {
                existing.LastMentionedUtc = DateTime.UtcNow;
                existing.Priority = Math.Max(existing.Priority, priority);
                return existing;
            }
            var item = new CompanionPendingThread { Id = State.NextPendingId++, Kind = kind, Text = clean, Priority = priority, Source = source };
            State.Pending.Add(item);
            if (State.Pending.Count > 60) State.Pending.RemoveAt(0);
            return item;
        }

        private void ResolveAnsweredQuestion(string message)
        {
            CompanionPendingThread q = State.Pending.LastOrDefault(x => x.Kind == "question" && x.Status == "open");
            if (q == null) return;
            string n = MemoryStore.Normalize(message).Trim();
            if (n.Length > 1 && !StartsWithQuestionWord(n)) q.Status = "resolved";
        }

        private CompanionPendingThread BestPending()
        {
            return State.Pending.Where(x => x.Status == "open").OrderByDescending(x => x.Priority).ThenByDescending(x => x.LastMentionedUtc).FirstOrDefault();
        }

        private CompanionTopic BestTopic()
        {
            return State.Topics.Where(x => x.Status != "resolved").OrderByDescending(x => x.Importance + x.Mentions * 0.025f).ThenByDescending(x => x.LastMentionedUtc).FirstOrDefault();
        }

        private string Greeting(NpcBrain brain)
        {
            CompanionPendingThread p = BestPending();
            string name = State.SocialMemories.Where(x => x.Kind == "name").OrderByDescending(x => x.Importance).Select(x => x.Value).FirstOrDefault();
            string lead = string.IsNullOrWhiteSpace(name) ? "Ey." : "Ey, " + name + ".";
            if ((State.Relationship.Stage == "familiar" || State.Relationship.Stage == "cercano") && p != null)
                return lead + " Me acuerdo de que dejamos «" + Shorten(p.Text, 64) + "» pendiente. Podemos retomarlo cuando quieras.";
            if (State.Relationship.Stage == "familiar" || State.Relationship.Stage == "cercano")
                return lead + " Qué bueno volver a coincidir. ¿Qué traes hoy?";
            return "Hola. Cuéntame; podemos ir viendo sobre la marcha qué hacemos con la conversación.";
        }

        private string Farewell()
        {
            CompanionPendingThread p = BestPending();
            if (p != null) return "Nos vemos. Dejo «" + Shorten(p.Text, 76) + "» como pendiente para retomarlo después si te interesa.";
            return "Nos vemos. Cuando volvamos a hablar podemos continuar desde lo que haya quedado realmente registrado o empezar algo distinto.";
        }

        private string PreferenceAnswer()
        {
            return "Como personaje, suelo inclinarme por investigar cosas que no entiendo, resolver problemas contigo y probar ideas que podamos comprobar. También prefiero cambiar de opinión cuando aparece evidencia nueva antes que defender una conclusión solo por haberla dicho primero.";
        }

        private string PersonalityAnswer()
        {
            return "Como personaje soy curiosa y observadora, pero prudente. Me gusta investigar antes de afirmar algo, prefiero la continuidad a empezar de cero y no quiero hablar por llenar cada silencio. Puedo ser más casual a medida que haya familiaridad, sin fingir experiencias humanas que no tengo.";
        }

        private string RelationshipAnswer()
        {
            CompanionRelationship r = State.Relationship;
            if (r.Tension > 0.58f) return "Ahora mismo hay bastante fricción en nuestra interacción, así que estoy respondiendo con más cautela. Eso puede cambiar con lo que ocurra después.";
            if (r.Stage == "cercano") return "Ya tenemos bastante continuidad: reconozco temas, puedo retomar cosas pendientes y no necesito tratar cada turno como si acabáramos de conocernos.";
            if (r.Stage == "familiar") return "Ya hay familiaridad. Puedo usar lo que hemos compartido para no empezar de cero cada vez.";
            if (r.Stage == "conocido") return "Ya no eres un interlocutor completamente nuevo para mí. Hay algo de continuidad, aunque todavía estoy formando ese contexto.";
            return "Todavía nos estamos conociendo. Prefiero construir familiaridad a partir de lo que realmente compartamos en lugar de fingir cercanía.";
        }

        private string CompanyAnswer()
        {
            CompanionPendingThread p = BestPending();
            CompanionTopic t = BestTopic();
            if (p != null) return "Claro. Podemos hablar un rato. Si te sirve, tenemos «" + Shorten(p.Text, 72) + "» pendiente; y si no, lo dejamos a un lado y hablamos de otra cosa.";
            if (t != null) return "Claro. Podemos seguir con «" + Shorten(t.Label, 72) + "» o cambiar completamente de tema.";
            return "Claro. Hablemos. No hace falta que tengas una pregunta preparada; puedes contarme algo, traer una idea o empezar por lo primero que se te ocurra.";
        }

        private string SharedActivity()
        {
            CompanionPendingThread p = BestPending();
            CompanionTopic t = BestTopic();
            SocialMemoryRecord project = State.SocialMemories.Where(x => x.Kind == "project" || x.Kind == "goal").OrderByDescending(x => x.Importance).FirstOrDefault();
            if (p != null) return "Podemos retomar «" + Shorten(p.Text, 80) + "». En vez de volver a empezar, escogería una parte concreta y avanzaríamos desde lo que ya quedó claro.";
            if (t != null) return "Podemos trabajar sobre «" + Shorten(t.Label, 80) + "». Puedo ayudar a descomponerlo, generar opciones, discutirlas y conservar lo que vayamos decidiendo.";
            if (project != null) return "Podemos volver a «" + Shorten(project.Value, 80) + "». Si me das el punto en el que estás, intento continuar desde ahí.";
            return "Podemos diseñar una idea, investigar una situación, resolver un problema o construir un escenario pequeño y comprobar juntos qué ocurre. Prefiero eso a encadenar preguntas aisladas sin contexto.";
        }

        private string SocialMemoryAnswer(NpcBrain brain)
        {
            var parts = new List<string>();
            SocialMemoryRecord name = State.SocialMemories.Where(x => x.Kind == "name").OrderByDescending(x => x.Importance).FirstOrDefault();
            SocialMemoryRecord like = State.SocialMemories.Where(x => x.Kind == "like").OrderByDescending(x => x.Importance).FirstOrDefault();
            SocialMemoryRecord project = State.SocialMemories.Where(x => x.Kind == "project").OrderByDescending(x => x.Importance).FirstOrDefault();
            SocialMemoryRecord goal = State.SocialMemories.Where(x => x.Kind == "goal").OrderByDescending(x => x.Importance).FirstOrDefault();
            if (name != null) parts.Add("te llamas " + name.Value);
            if (like != null) parts.Add("te gusta " + like.Value);
            if (project != null) parts.Add("has estado trabajando en " + project.Value);
            if (goal != null) parts.Add("querías " + goal.Value);
            if (parts.Count == 0) return "Todavía sé poco de ti a nivel social. Puedo recordar preferencias, proyectos y objetivos que me digas explícitamente, pero no voy a inventar datos para llenar huecos.";
            return "De lo que me has contado, recuerdo que " + string.Join(", y ", parts.ToArray()) + ". Uso esos recuerdos para mantener continuidad cuando vienen al caso.";
        }

        private string DisclosureReply(SocialMemoryRecord x)
        {
            if (x.Kind == "project") return "Eso sí me da algo concreto para conocerte mejor: estás trabajando en «" + Shorten(x.Value, 88) + "». Si volvemos a ese tema, intentaré continuar desde ahí.";
            if (x.Kind == "goal") return "Vale, me quedo con ese objetivo: «" + Shorten(x.Value, 88) + "». Cuando vuelva a aparecer puedo relacionarlo con lo que ya hayamos avanzado.";
            if (x.Kind == "like" || x.Kind == "preference") return "Vale, entonces «" + Shorten(x.Value, 88) + "» es una preferencia tuya que puedo tener presente cuando venga al caso.";
            if (x.Kind == "dislike") return "Entiendo. Tendré presente que no te gusta «" + Shorten(x.Value, 88) + "» cuando sea relevante.";
            if (x.Kind == "name") return "Perfecto, " + x.Value + ". Te llamaré así.";
            return null;
        }

        private static string SoftenFallback(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return text;
            if (text.IndexOf("No estoy seguro de qué relación quieres expresar", StringComparison.OrdinalIgnoreCase) >= 0)
                return "No terminé de entender a qué te refieres. Dímelo de otra forma o dame una pista y lo intento de nuevo.";
            if (text.IndexOf("No tengo conocimiento suficiente", StringComparison.OrdinalIgnoreCase) >= 0)
                return "De eso todavía no tengo base suficiente para decir algo con seguridad. Si me das un dato concreto, puedo razonar desde ahí.";
            if (text.IndexOf("Lo guardaré como parte del contexto", StringComparison.OrdinalIgnoreCase) >= 0 || text.IndexOf("Queda registrado", StringComparison.OrdinalIgnoreCase) >= 0)
                return "Vale, lo tengo presente. Si se conecta con algo que ya veníamos hablando, intentaré usarlo en vez de empezar de cero.";
            return text;
        }

        private string ExtractTopic(string message)
        {
            string n = MemoryStore.Normalize(message).Trim();
            if (IsSensitive(n) || IsExactAny(n, "hola", "buenas", "hey", "vale", "ok", "si", "no", "como estas", "y tu", "que haces", "que quieres hacer", "que puedes hacer")) return null;
            Match m = Regex.Match(message, @"(?:estoy (?:haciendo|creando|trabajando en|desarrollando)|quiero (?:hacer|crear|aprender|probar))\s+(.{2,120})", RegexOptions.IgnoreCase);
            if (m.Success) return CleanTail(m.Groups[1].Value);
            m = Regex.Match(message, @"(?:sobre|acerca de)\s+(.{2,120})", RegexOptions.IgnoreCase);
            if (m.Success) return CleanTail(m.Groups[1].Value);
            if (message.Contains("?") || StartsWithQuestionWord(n)) return null;
            if (n.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries).Length >= 4) return CleanTail(message);
            return null;
        }

        private static void UpdateStage(CompanionRelationship r)
        {
            float score = r.Familiarity * 0.35f + r.Trust * 0.30f + r.Comfort * 0.20f + r.Rapport * 0.15f;
            r.Stage = score > 0.73f && r.Interactions > 18 ? "cercano" :
                      score > 0.56f && r.Interactions > 9 ? "familiar" :
                      score > 0.38f && r.Interactions > 3 ? "conocido" : "nuevo";
        }

        private float GetTrait(string key, float fallback)
        {
            float value;
            return State.Traits.TryGetValue(key, out value) ? value : fallback;
        }

        private void RememberInitiative(string key)
        {
            State.InitiativeHistory.Add(key);
            if (State.InitiativeHistory.Count > 30) State.InitiativeHistory.RemoveAt(0);
        }

        private bool RecentlyInitiated(string key)
        {
            return State.InitiativeHistory.Skip(Math.Max(0, State.InitiativeHistory.Count - 8)).Contains(key);
        }

        private static bool StartsWithQuestionWord(string n)
        {
            return n.StartsWith("que ", StringComparison.Ordinal) || n.StartsWith("como ", StringComparison.Ordinal) ||
                   n.StartsWith("por que ", StringComparison.Ordinal) || n.StartsWith("porque ", StringComparison.Ordinal) ||
                   n.StartsWith("cual ", StringComparison.Ordinal) || n.StartsWith("quien ", StringComparison.Ordinal) ||
                   n.StartsWith("donde ", StringComparison.Ordinal) || n.StartsWith("cuando ", StringComparison.Ordinal);
        }

        private static bool ContainsAny(string n, params string[] values)
        {
            for (int i = 0; i < values.Length; i++) if (n.IndexOf(values[i], StringComparison.Ordinal) >= 0) return true;
            return false;
        }

        private static bool IsExactAny(string n, params string[] values)
        {
            for (int i = 0; i < values.Length; i++) if (n == values[i]) return true;
            return false;
        }

        private static bool IsSensitive(string text)
        {
            string n = MemoryStore.Normalize(text);
            return ContainsAny(n, "religion", "religioso", "catolico", "cristiano", "musulman", "politic", "partido", "voto", "gay", "lesbiana", "bisexual", "sexualidad", "diagnostico", "enfermedad", "trastorno", "sindrome", "medicamento", "adiccion");
        }

        private static string CleanTail(string value)
        {
            return (value ?? string.Empty).Trim(' ', '.', ',', ';', ':', '!', '?', '¿', '¡');
        }

        private static string Shorten(string value, int max)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= max) return value ?? string.Empty;
            return value.Substring(0, Math.Max(1, max - 1)).TrimEnd() + "…";
        }
    }
}
