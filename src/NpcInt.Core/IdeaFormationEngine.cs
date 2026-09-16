using System;
using System.Collections.Generic;
using System.Linq;

namespace NpcInt.Core
{
    public sealed class IdeaFormationEngine
    {
        private sealed class Edge
        {
            public string From;
            public string Relation;
            public string To;
            public float Weight;
        }

        private readonly Dictionary<string, List<Edge>> _out = new Dictionary<string, List<Edge>>();
        private readonly Dictionary<string, List<Edge>> _incoming = new Dictionary<string, List<Edge>>();
        private readonly Dictionary<string, string> _labels = new Dictionary<string, string>();
        private readonly Dictionary<string, string> _aliases = new Dictionary<string, string>();
        private readonly Dictionary<string, string> _tests = new Dictionary<string, string>();
        private readonly List<NpcIdea> _history = new List<NpcIdea>();

        public NpcIdea LastIdea { get; private set; }
        public IReadOnlyList<NpcIdea> History { get { return _history; } }

        public IdeaFormationEngine()
        {
            SeedAliases();
            SeedLabels();
            SeedTests();
            SeedGraph();
        }

        public NpcIdea FormIdea(string observation, MentalCycleResult cycle = null)
        {
            observation = observation ?? string.Empty;
            var observed = ExtractObservedConcepts(observation);
            var concepts = Activate(observed, 3);
            var hypotheses = GenerateHypotheses(observation, observed, concepts);
            var idea = Synthesize(observation, concepts, hypotheses, cycle);

            LastIdea = idea;
            _history.Add(idea);
            if (_history.Count > 30) _history.RemoveAt(0);
            return idea;
        }

        public string Verbalize(NpcIdea idea, string intent)
        {
            if (idea == null) return "Todavía no tengo una idea suficientemente apoyada.";
            if (intent == "ask_hypotheses")
            {
                if (idea.Hypotheses.Count == 0)
                    return "No tengo todavía hipótesis concretas que pueda defender con evidencia.";

                var parts = idea.Hypotheses.Take(3).Select((h, i) => (i + 1) + ") " + h.Claim).ToArray();
                return "No elegiría una sola explicación todavía. Estoy considerando " + string.Join(" ", parts) +
                       " " + idea.Critique + " La prueba que más ayudaría ahora sería " + idea.RecommendedTest + ".";
            }

            if (intent == "ask_current_thought")
            {
                if (idea.Hypotheses.Count == 0)
                    return "Estoy intentando entender qué información falta antes de formular una explicación.";
                string first = idea.Hypotheses[0].Claim;
                string second = idea.Hypotheses.Count > 1 ? idea.Hypotheses[1].Claim : null;
                string text = "Ahora mismo estoy intentando explicar «" + Shorten(idea.Focus, 90) + "». Una posibilidad que evalúo es que " + LowerFirst(first) + ".";
                if (!string.IsNullOrWhiteSpace(second)) text += " También la comparo con la posibilidad de que " + LowerFirst(second) + ".";
                text += " No las trato como hechos mientras no aparezca evidencia que las distinga.";
                return text;
            }

            return idea.Claim + " " + idea.Critique + " Para distinguir mejor las posibilidades, " + idea.RecommendedTest + ".";
        }

        private Dictionary<string, float> ExtractObservedConcepts(string text)
        {
            var observed = new Dictionary<string, float>();
            string normalized = Normalize(text);
            string[] words = normalized.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string raw in words)
            {
                string id = Canonical(raw);
                if (string.IsNullOrWhiteSpace(id)) continue;
                if (!_labels.ContainsKey(id) && !_incoming.ContainsKey(id) && !_out.ContainsKey(id)) continue;
                if (!observed.ContainsKey(id) || observed[id] < 0.78f) observed[id] = 0.78f;
            }
            return observed;
        }

        private List<ConceptActivation> Activate(Dictionary<string, float> observed, int maxDepth)
        {
            var scores = new Dictionary<string, float>();
            var paths = new Dictionary<string, List<string>>();
            var queue = new Queue<Tuple<string, float, int>>();

            foreach (var pair in observed)
            {
                scores[pair.Key] = pair.Value;
                paths[pair.Key] = new List<string> { pair.Key };
                queue.Enqueue(Tuple.Create(pair.Key, pair.Value, 0));
            }

            while (queue.Count > 0)
            {
                var current = queue.Dequeue();
                if (current.Item3 >= maxDepth) continue;

                var edges = new List<Edge>();
                if (_out.ContainsKey(current.Item1)) edges.AddRange(_out[current.Item1]);
                if (_incoming.ContainsKey(current.Item1)) edges.AddRange(_incoming[current.Item1]);

                foreach (Edge edge in edges)
                {
                    string next = edge.From == current.Item1 ? edge.To : edge.From;
                    float directionPenalty = edge.From == current.Item1 ? 1f : 0.86f;
                    float candidate = current.Item2 * edge.Weight * 0.72f * directionPenalty;
                    if (candidate < 0.08f) continue;

                    float old = scores.ContainsKey(next) ? scores[next] : 0f;
                    if (candidate <= old + 0.02f) continue;
                    scores[next] = candidate;
                    var p = new List<string>(paths[current.Item1]);
                    p.Add(next);
                    paths[next] = p;
                    queue.Enqueue(Tuple.Create(next, candidate, current.Item3 + 1));
                }
            }

            return scores
                .OrderByDescending(x => x.Value)
                .Take(24)
                .Select(x =>
                {
                    var c = new ConceptActivation
                    {
                        Id = x.Key,
                        Label = Label(x.Key),
                        Score = Clamp01(x.Value),
                        Observed = observed.ContainsKey(x.Key)
                    };
                    if (paths.ContainsKey(x.Key)) c.Path.AddRange(paths[x.Key]);
                    return c;
                }).ToList();
        }

        private List<NpcHypothesis> GenerateHypotheses(string observation, Dictionary<string, float> observed, List<ConceptActivation> concepts)
        {
            var result = new List<NpcHypothesis>();
            int seq = 1;

            foreach (ConceptActivation effect in concepts.Where(x => x.Observed))
            {
                if (!_incoming.ContainsKey(effect.Id)) continue;
                foreach (Edge edge in _incoming[effect.Id])
                {
                    if (!IsCausal(edge.Relation)) continue;
                    string cause = edge.From;
                    var h = new NpcHypothesis
                    {
                        Id = "h" + seq++,
                        CauseId = cause,
                        CauseLabel = Label(cause),
                        EffectId = effect.Id,
                        EffectLabel = effect.Label,
                        Claim = CausePhrase(cause, effect.Label),
                        Status = "unverified",
                        Test = TestFor(cause),
                        Testability = Testability(TestFor(cause))
                    };

                    h.EvidenceFor.Add(new HypothesisEvidence
                    {
                        Text = "se observó «" + effect.Label + "»",
                        Weight = observed[effect.Id],
                        Source = "perception"
                    });

                    if (observed.ContainsKey(cause))
                    {
                        h.EvidenceFor.Add(new HypothesisEvidence
                        {
                            Text = "también se observó «" + Label(cause) + "»",
                            Weight = observed[cause],
                            Source = "perception"
                        });
                    }
                    else if (ExpectedSignals(cause).Count > 0 && !ExpectedSignals(cause).Any(observed.ContainsKey))
                    {
                        h.EvidenceAgainst.Add(new HypothesisEvidence
                        {
                            Text = "todavía no hay una señal independiente esperable de " + Label(cause),
                            Weight = 0.18f,
                            Source = "missing-corroboration"
                        });
                    }

                    float support = h.EvidenceFor.Count == 0 ? 0f : h.EvidenceFor.Average(x => x.Weight);
                    float against = h.EvidenceAgainst.Sum(x => x.Weight);
                    h.Confidence = Clamp01(0.12f + edge.Weight * 0.52f + support * 0.28f - against * 0.20f);
                    if (h.Confidence > 0.88f) h.Confidence = 0.88f;
                    result.Add(h);
                }
            }

            if (observed.ContainsKey("golpe") || observed.ContainsKey("ruido") || observed.ContainsKey("sonido"))
            {
                var generic = new NpcHypothesis
                {
                    Id = "h" + seq++,
                    Claim = "el sonido podría tener una causa física no observada todavía",
                    CauseId = "causa_desconocida",
                    CauseLabel = "una causa física desconocida",
                    EffectId = observed.ContainsKey("golpe") ? "golpe" : "sonido",
                    EffectLabel = observed.ContainsKey("golpe") ? "golpe" : "sonido",
                    Confidence = 0.30f,
                    Status = "unverified",
                    Test = "repetir la observación desde otra posición y buscar cambios sincronizados con el sonido",
                    Testability = 0.76f
                };
                generic.EvidenceFor.Add(new HypothesisEvidence { Text = "hay un sonido, pero no se observó directamente su causa", Weight = 0.68f, Source = "perception" });
                result.Add(generic);
            }

            return result
                .GroupBy(x => x.CauseId + "|" + x.EffectId)
                .Select(g => g.OrderByDescending(x => x.Confidence).First())
                .OrderByDescending(x => x.Confidence)
                .Take(7)
                .ToList();
        }

        private NpcIdea Synthesize(string focus, List<ConceptActivation> concepts, List<NpcHypothesis> hypotheses, MentalCycleResult cycle)
        {
            var idea = new NpcIdea { Focus = focus };
            idea.Concepts.AddRange(concepts);
            idea.Hypotheses.AddRange(hypotheses);

            if (hypotheses.Count == 0)
            {
                idea.Claim = "Todavía no tengo una idea causal suficientemente apoyada.";
                idea.Rationale = "Faltan relaciones o evidencia que permitan comparar explicaciones.";
                idea.Confidence = 0.18f;
                idea.Critique = "No sería responsable convertir la falta de datos en una historia concreta.";
                idea.RecommendedTest = "observar qué cambia y registrar una señal concreta antes de inferir una causa";
                idea.RecommendedAction = MentalActionKind.Observe;
                idea.Score = BuildScore(concepts, null, 0.72f, 0.60f, 0.05f);
                return idea;
            }

            NpcHypothesis first = hypotheses[0];
            NpcHypothesis second = hypotheses.Count > 1 ? hypotheses[1] : null;
            float margin = second == null ? first.Confidence : first.Confidence - second.Confidence;

            if (first.Confidence >= 0.68f && margin >= 0.16f)
            {
                idea.Claim = "La explicación que mejor encaja por ahora es que " + LowerFirst(first.Claim) + ".";
                idea.Rationale = "Tiene más apoyo que las alternativas actuales, aunque sigue sin estar verificada.";
                idea.Confidence = Clamp01(first.Confidence * 0.90f);
            }
            else if (second != null)
            {
                idea.Claim = "Veo varias explicaciones plausibles: " + LowerFirst(first.Claim) + "; también " + LowerFirst(second.Claim) + ".";
                idea.Rationale = "La evidencia actual no separa con suficiente claridad esas alternativas.";
                idea.Confidence = Clamp01((first.Confidence + second.Confidence) * 0.41f);
            }
            else
            {
                idea.Claim = "Una posibilidad es que " + LowerFirst(first.Claim) + ", pero todavía no puedo tratarla como conclusión.";
                idea.Rationale = "Solo tengo una línea causal activa y falta corroboración independiente.";
                idea.Confidence = Clamp01(first.Confidence * 0.78f);
            }

            NpcHypothesis bestTest = hypotheses.OrderByDescending(x => x.Testability * 0.65f + Ambiguity(x.Confidence) * 0.35f).First();
            idea.RecommendedTest = bestTest.Test;
            idea.RecommendedAction = ActionForTest(bestTest.Test);
            idea.Critique = first.EvidenceAgainst.Count > 0
                ? "La principal objeción es que " + first.EvidenceAgainst[0].Text + "."
                : second != null
                    ? "La explicación principal todavía compite con «" + second.Claim + "» y no hay evidencia suficiente para descartarla."
                    : "La evidencia disponible todavía es demasiado limitada para cerrar la explicación.";

            float contradictionPenalty = Clamp01(first.EvidenceAgainst.Sum(x => x.Weight) * 0.35f);
            float relevance = concepts.Count > 0 ? Clamp01(concepts[0].Score) : 0.50f;
            float novelty = Novelty(idea.Claim);
            idea.Score = BuildScore(concepts, first, bestTest.Testability, novelty, contradictionPenalty);
            return idea;
        }

        private IdeaScore BuildScore(List<ConceptActivation> concepts, NpcHypothesis first, float testability, float novelty, float contradictionPenalty)
        {
            float relevance = concepts.Count > 0 ? Clamp01(concepts[0].Score) : 0.35f;
            float plausibility = first != null ? Clamp01(first.Confidence) : 0.18f;
            var score = new IdeaScore
            {
                Relevance = relevance,
                Plausibility = plausibility,
                Testability = Clamp01(testability),
                Novelty = Clamp01(novelty),
                ContradictionPenalty = Clamp01(contradictionPenalty)
            };
            score.Total = Clamp01(score.Relevance * 0.25f + score.Plausibility * 0.30f + score.Testability * 0.25f + score.Novelty * 0.20f - score.ContradictionPenalty * 0.25f);
            return score;
        }

        private float Novelty(string claim)
        {
            if (_history.Count == 0) return 0.80f;
            string n = Normalize(claim);
            var a = new HashSet<string>(n.Split(' ').Where(x => x.Length > 3));
            float best = 0f;
            foreach (NpcIdea idea in _history.Skip(Math.Max(0, _history.Count - 8)))
            {
                var b = new HashSet<string>(Normalize(idea.Claim).Split(' ').Where(x => x.Length > 3));
                int inter = a.Count(x => b.Contains(x));
                int union = a.Union(b).Count();
                if (union > 0) best = Math.Max(best, (float)inter / union);
            }
            return Clamp01(1f - best);
        }

        private void SeedGraph()
        {
            Add("golpe", "es_un", "sonido", 0.95f);
            Add("ruido", "es_un", "sonido", 0.92f);
            Add("sonido", "indica", "cambio", 0.72f);
            Add("persona", "puede_causar", "golpe", 0.68f);
            Add("objeto_caido", "puede_causar", "golpe", 0.72f);
            Add("caida", "puede_causar", "golpe", 0.62f);
            Add("viento", "puede_causar", "ruido", 0.44f);
            Add("persona", "puede_producir", "voz", 0.86f);
            Add("persona", "puede_producir", "pasos", 0.82f);
            Add("pasos", "es_un", "sonido", 0.90f);
            Add("voz", "es_un", "sonido", 0.90f);
            Add("objeto", "puede_sufrir", "caida", 0.58f);
            Add("caida", "implica", "movimiento", 0.78f);
            Add("viento", "genera", "corriente_aire", 0.90f);
            Add("corriente_aire", "puede_mover", "puerta", 0.70f);
            Add("puerta", "tiene", "cerradura", 0.85f);
            Add("puerta", "relacionada_con", "seguridad", 0.66f);
            Add("fallo_electrico", "puede_causar", "oscuridad", 0.78f);
            Add("interruptor", "puede_causar", "oscuridad", 0.58f);
            Add("fuego", "produce", "humo", 0.90f);
            Add("fuego", "puede_causar", "peligro", 0.92f);
            Add("amenaza", "puede_causar", "peligro", 0.82f);
            Add("herido", "puede_producir", "auxilio", 0.78f);
        }

        private void SeedAliases()
        {
            AddAlias("golpes", "golpe"); AddAlias("golpear", "golpe"); AddAlias("ruidos", "ruido");
            AddAlias("oye", "sonido"); AddAlias("oigo", "sonido"); AddAlias("escucho", "sonido"); AddAlias("escuchar", "sonido");
            AddAlias("puertas", "puerta"); AddAlias("llave", "cerradura"); AddAlias("alguien", "persona");
            AddAlias("hombre", "persona"); AddAlias("mujer", "persona"); AddAlias("voces", "voz");
            AddAlias("cayo", "caida"); AddAlias("caer", "caida"); AddAlias("cayendo", "caida"); AddAlias("caja", "objeto");
            AddAlias("aire", "corriente_aire"); AddAlias("corriente", "corriente_aire"); AddAlias("mueve", "movimiento");
            AddAlias("arma", "amenaza"); AddAlias("ataque", "amenaza"); AddAlias("atacar", "amenaza");
            AddAlias("luces", "luz"); AddAlias("oscuro", "oscuridad"); AddAlias("apagada", "oscuridad");
            AddAlias("electricidad", "energia"); AddAlias("ayuda", "auxilio");
        }

        private void SeedLabels()
        {
            Label("golpe", "golpe"); Label("sonido", "sonido"); Label("ruido", "ruido"); Label("cambio", "cambio en el entorno");
            Label("persona", "una persona"); Label("pasos", "pasos"); Label("voz", "una voz"); Label("objeto", "un objeto");
            Label("objeto_caido", "un objeto que cayó"); Label("caida", "una caída"); Label("viento", "el viento"); Label("corriente_aire", "una corriente de aire");
            Label("puerta", "la puerta"); Label("cerradura", "la cerradura"); Label("seguridad", "seguridad"); Label("movimiento", "movimiento");
            Label("amenaza", "una amenaza"); Label("peligro", "peligro"); Label("fuego", "fuego"); Label("humo", "humo");
            Label("luz", "la luz"); Label("oscuridad", "oscuridad"); Label("energia", "energía"); Label("fallo_electrico", "un fallo eléctrico");
            Label("interruptor", "un interruptor"); Label("herido", "una persona herida"); Label("auxilio", "una petición de auxilio");
        }

        private void SeedTests()
        {
            _tests["persona"] = "escuchar si aparecen voces, pasos o nuevos golpes";
            _tests["objeto_caido"] = "observar el suelo y buscar un objeto desplazado o caído";
            _tests["caida"] = "buscar qué objeto pudo haberse movido o caído";
            _tests["viento"] = "observar si hay corriente de aire o movimiento repetido de la puerta";
            _tests["fallo_electrico"] = "comprobar si otras luces o dispositivos también perdieron energía";
            _tests["interruptor"] = "revisar el estado del interruptor antes de asumir un fallo";
            _tests["fuego"] = "buscar humo, calor o una alarma antes de acercarse";
            _tests["amenaza"] = "observar a distancia y buscar señales independientes de peligro";
            _tests["herido"] = "buscar a la persona y comprobar si responde o pide ayuda";
        }

        private static List<string> ExpectedSignals(string cause)
        {
            switch (cause)
            {
                case "persona": return new List<string> { "voz", "pasos", "movimiento" };
                case "viento": return new List<string> { "viento", "corriente_aire", "movimiento" };
                case "objeto_caido": return new List<string> { "objeto", "caida", "movimiento" };
                case "fallo_electrico": return new List<string> { "energia", "luz", "oscuridad" };
                case "fuego": return new List<string> { "humo", "alarma", "calor" };
                case "amenaza": return new List<string> { "peligro", "arma", "ataque", "auxilio" };
                default: return new List<string>();
            }
        }

        private string CausePhrase(string cause, string effect)
        {
            switch (cause)
            {
                case "persona": return "una persona podría haber provocado el evento";
                case "objeto_caido": return "un objeto pudo haberse caído o desplazado";
                case "caida": return "algo pudo haberse caído";
                case "viento": return "el viento o una corriente de aire podría explicarlo";
                case "fallo_electrico": return "podría haber un fallo eléctrico";
                case "interruptor": return "alguien pudo accionar un interruptor";
                case "fuego": return "podría haber fuego u otra fuente de calor";
                case "amenaza": return "podría tratarse de una amenaza real";
                case "herido": return "podría haber una persona herida";
                default: return Label(cause) + " podría explicar " + effect;
            }
        }

        private MentalActionKind ActionForTest(string test)
        {
            string n = Normalize(test);
            if (n.Contains("revisar") || n.Contains("comprobar") || n.Contains("inspeccionar") || n.Contains("buscar")) return MentalActionKind.Investigate;
            return MentalActionKind.Observe;
        }

        private string TestFor(string cause)
        {
            return _tests.ContainsKey(cause) ? _tests[cause] : "buscar una observación independiente que confirme o descarte " + Label(cause);
        }

        private static float Testability(string test)
        {
            string n = Normalize(test);
            if (n.StartsWith("escuchar")) return 0.88f;
            if (n.StartsWith("observar")) return 0.84f;
            if (n.StartsWith("comprobar") || n.StartsWith("revisar")) return 0.82f;
            return 0.70f;
        }

        private static bool IsCausal(string relation)
        {
            return relation == "puede_causar" || relation == "produce" || relation == "genera" || relation == "puede_mover" || relation == "puede_producir" || relation == "puede_indicar";
        }

        private void Add(string from, string relation, string to, float weight)
        {
            if (!_out.ContainsKey(from)) _out[from] = new List<Edge>();
            if (!_incoming.ContainsKey(to)) _incoming[to] = new List<Edge>();
            var e = new Edge { From = from, Relation = relation, To = to, Weight = Clamp01(weight) };
            _out[from].Add(e);
            _incoming[to].Add(e);
        }

        private void AddAlias(string from, string to) { _aliases[from] = to; }
        private void Label(string id, string label) { _labels[id] = label; }
        private string Label(string id) { return _labels.ContainsKey(id) ? _labels[id] : id.Replace('_', ' '); }

        private string Canonical(string word)
        {
            word = Normalize(word).Replace(' ', '_');
            return _aliases.ContainsKey(word) ? _aliases[word] : word;
        }

        private static float Ambiguity(float confidence) { return Clamp01(1f - Math.Abs(0.5f - confidence) * 2f); }
        private static float Clamp01(float v) { return v < 0f ? 0f : (v > 1f ? 1f : v); }
        private static string Normalize(string value)
        {
            string s = (value ?? string.Empty).ToLowerInvariant();
            s = s.Replace("á", "a").Replace("é", "e").Replace("í", "i").Replace("ó", "o").Replace("ú", "u").Replace("ü", "u");
            char[] chars = s.Select(c => char.IsLetterOrDigit(c) || c == '_' || c == ' ' ? c : ' ').ToArray();
            return string.Join(" ", new string(chars).Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries));
        }
        private static string LowerFirst(string value)
        {
            if (string.IsNullOrEmpty(value)) return string.Empty;
            return char.ToLowerInvariant(value[0]) + value.Substring(1).TrimEnd('.');
        }
        private static string Shorten(string value, int max)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= max) return value ?? string.Empty;
            return value.Substring(0, max - 1).TrimEnd() + "…";
        }
    }
}
