using System;
using System.Collections.Generic;
using System.Linq;

namespace NpcInt.Core
{
    public sealed class MentalCycleEngine
    {
        private readonly NpcBrain _brain;
        private readonly MentalNeedState _state = new MentalNeedState();

        public MentalCycleResult LastCycle { get; private set; }
        public MentalNeedState State { get { return _state; } }

        public MentalCycleEngine(NpcBrain brain)
        {
            _brain = brain ?? throw new ArgumentNullException(nameof(brain));
            SyncFromBrain();
        }

        public MentalCycleResult ThinkMessage(string text)
        {
            var p = Perceive(MentalPerceptionType.UserMessage, _brain.Relation.OtherName, text ?? string.Empty, 0f, 0.5f);
            return Run(p, 0f);
        }

        public MentalCycleResult ThinkWorld(string text, float threat = 0f, float importance = 0.6f)
        {
            var p = Perceive(MentalPerceptionType.WorldEvent, "mundo", text ?? string.Empty, threat, importance);
            return Run(p, 0f);
        }

        public MentalCycleResult ThinkTime(float minutes)
        {
            if (minutes < 0f) minutes = 0f;
            _state.Hunger = MathUtil.Clamp01(_state.Hunger + minutes * 0.0042f);
            _state.Energy = MathUtil.Clamp01(_state.Energy - minutes * 0.0028f);

            var p = Perceive(MentalPerceptionType.Time, "interno", "Pasó tiempo sin un estímulo externo.", 0f, 0.15f);
            return Run(p, minutes);
        }

        public void SetNeed(string name, float value)
        {
            string n = MemoryStore.Normalize(name);
            value = MathUtil.Clamp01(value);
            if (n == "hunger" || n == "hambre") _state.Hunger = value;
            else if (n == "energy" || n == "energia") _state.Energy = value;
            else if (n == "fear" || n == "miedo") _state.Fear = value;
            else if (n == "curiosity" || n == "curiosidad") _state.Curiosity = value;
            else if (n == "social") _state.Social = value;
        }

        private MentalCycleResult Run(MentalPerception perception, float elapsedMinutes)
        {
            SyncFromBrain();
            ApplyPerception(perception);

            var result = new MentalCycleResult
            {
                Perception = perception,
                State = _state.Clone(),
                IdentitySummary = _brain.Identity.Name + " | propósito=" + _brain.Identity.Purpose
            };

            foreach (MemoryEntry m in _brain.Memory.Recall(perception.Text, 4))
                result.RelevantMemories.Add(m.Kind + ": " + m.Text);

            List<MentalGoal> goals = BuildGoals(perception);
            result.Goals.AddRange(goals);

            foreach (MentalActionKind kind in CandidateKinds(perception))
                result.Options.Add(Evaluate(kind, perception, goals));

            result.Options.Sort((a, b) => b.Utility.CompareTo(a.Utility));
            result.Decision = result.Options.Count > 0 ? result.Options[0] : MakeFallback();
            result.ExecutionStatus = "selected";

            ApplyDecisionEffects(result.Decision);
            LastCycle = result;
            return result;
        }

        private MentalPerception Perceive(MentalPerceptionType type, string source, string text, float explicitThreat, float importance)
        {
            var p = new MentalPerception
            {
                Type = type,
                Source = source ?? string.Empty,
                Text = text ?? string.Empty,
                Threat = MathUtil.Clamp01(explicitThreat),
                Importance = MathUtil.Clamp01(importance),
                Novelty = 0.5f
            };

            string n = MemoryStore.Normalize(text);
            if (ContainsAny(n, "peligro", "arma", "ataque", "atacar", "matar", "fuego", "explosion", "sangre", "amenaza"))
            {
                p.Tags.Add("danger");
                p.Threat = Math.Max(p.Threat, 0.78f);
            }
            if (ContainsAny(n, "comida", "alimento", "pan", "carne", "fruta", "hambre", "comer")) p.Tags.Add("food");
            if (ContainsAny(n, "puerta", "cerradura", "llave")) p.Tags.Add("door");
            if (ContainsAny(n, "oscuro", "oscuridad", "luz", "luces")) p.Tags.Add("visibility");
            if (ContainsAny(n, "ayuda", "auxilio", "herido", "dolor")) p.Tags.Add("distress");
            if (MentalPerceptionVocabulary.ContainsHostileToken(n))
            {
                p.Tags.Add("hostile");
                p.Threat = Math.Max(p.Threat, 0.28f);
            }
            if ((text ?? string.Empty).Contains("?") || (text ?? string.Empty).Contains("¿")) p.Tags.Add("question");
            return p;
        }

        private void SyncFromBrain()
        {
            _state.Fear = MathUtil.Clamp01(Math.Max(_state.Fear * 0.92f, _brain.Drives.Threat));
            _state.Curiosity = MathUtil.Clamp01(_brain.Drives.Curiosity);
            _state.Trust = MathUtil.Clamp01(_brain.Relation.Trust);
            _state.Social = MathUtil.Clamp01(_brain.Drives.Social);
            _state.Energy = MathUtil.Clamp01(_state.Energy * 0.65f + (1f - _brain.Drives.Fatigue) * 0.35f);
        }

        private void ApplyPerception(MentalPerception p)
        {
            _state.Fear = MathUtil.Clamp01(Math.Max(_state.Fear * 0.82f, p.Threat * 0.72f));
        }

        private List<MentalGoal> BuildGoals(MentalPerception p)
        {
            var goals = new List<MentalGoal>();
            AddGoal(goals, "safety", "mantenerme seguro", _state.Fear * 0.95f + p.Threat * 0.65f,
                _state.Fear > 0.45f ? "miedo/amenaza elevados" : "seguridad basal");

            if (_state.Hunger > 0.22f)
                AddGoal(goals, "food", "reducir hambre", _state.Hunger, "hambre acumulada");

            if (_state.Energy < 0.78f)
                AddGoal(goals, "rest", "recuperar energía", 1f - _state.Energy, "energía por debajo del máximo");

            if (_state.Curiosity > 0.35f)
                AddGoal(goals, "understand", "reducir incertidumbre", _state.Curiosity * (HasTag(p, "question") ? 0.85f : 0.65f), "curiosidad activa");

            if (p.Type == MentalPerceptionType.UserMessage)
                AddGoal(goals, "social", "mantener una interacción coherente", Math.Max(0.35f, _state.Social * 0.75f), "hay un interlocutor presente");

            AddGoal(goals, "purpose", "actuar de acuerdo con mi propósito", _brain.Drives.Purpose * 0.72f, "propósito persistente");

            if (HasTag(p, "hostile"))
                AddGoal(goals, "boundaries", "proteger la relación y mis límites", 0.78f, "lenguaje hostil detectado en la percepción actual");
            else if (_brain.Relation.Trust < 0.35f)
                AddGoal(goals, "boundaries", "proteger la relación y mis límites", 0.62f, "confianza interpersonal baja");

            return goals.OrderByDescending(g => g.Priority).ToList();
        }

        private IEnumerable<MentalActionKind> CandidateKinds(MentalPerception p)
        {
            var ids = new List<MentalActionKind>();
            if (p.Type == MentalPerceptionType.UserMessage)
            {
                ids.Add(MentalActionKind.Speak);
                if (HasTag(p, "question") || _state.Curiosity > 0.62f) ids.Add(MentalActionKind.AskQuestion);
                if (HasTag(p, "hostile")) ids.Add(MentalActionKind.SetBoundary);
                ids.Add(MentalActionKind.Wait);
            }
            else if (p.Type == MentalPerceptionType.WorldEvent)
            {
                ids.Add(MentalActionKind.Observe);
                ids.Add(MentalActionKind.Investigate);
                ids.Add(MentalActionKind.Wait);
                if (p.Threat > 0.35f)
                {
                    ids.Add(MentalActionKind.MoveAway);
                    ids.Add(MentalActionKind.Defend);
                }
                if (p.Threat > 0.72f) ids.Add(MentalActionKind.Attack);
                if (HasTag(p, "food") && _state.Hunger > 0.35f) ids.Add(MentalActionKind.Eat);
            }
            else
            {
                ids.Add(MentalActionKind.Wait);
                ids.Add(MentalActionKind.Observe);
                if (_state.Energy < 0.55f) ids.Add(MentalActionKind.Rest);
                if (_state.Hunger > 0.58f) ids.Add(MentalActionKind.SeekFood);
                if (_state.Curiosity > 0.68f) ids.Add(MentalActionKind.Explore);
            }
            return ids.Distinct();
        }

        private MentalActionOption Evaluate(MentalActionKind kind, MentalPerception p, List<MentalGoal> goals)
        {
            float risk, cost, information, social;
            Dictionary<string, float> align;
            GetActionSpec(kind, out risk, out cost, out information, out social, out align);

            float goalScore = 0f;
            var option = new MentalActionOption { Kind = kind, Label = Label(kind), EnergyCost = cost };

            foreach (MentalGoal g in goals)
            {
                float a;
                if (!align.TryGetValue(g.Id, out a)) a = 0f;
                float contribution = g.Priority * a;
                goalScore += contribution;
                if (Math.Abs(contribution) > 0.08f)
                    option.Contributions.Add(g.Id + ":" + contribution.ToString("0.00"));
            }

            if (kind == MentalActionKind.Attack && p.Threat < 0.70f) risk += 0.35f;
            if (kind == MentalActionKind.Wait && p.Threat > 0.55f) risk += 0.45f;
            if (kind == MentalActionKind.Investigate) risk += p.Threat * 0.25f;
            risk = MathUtil.Clamp01(risk);

            float riskPenalty = risk * (0.45f + _brain.Personality.Caution * 0.55f);
            float lowEnergy = 1f - _state.Energy;
            float costPenalty = Math.Max(0f, cost) * (0.22f + lowEnergy * 0.80f);
            float recoveryBonus = cost < 0f ? (-cost) * (1f + lowEnergy) : 0f;
            float infoBonus = information * _state.Curiosity * 0.45f;
            float socialBonus = social * _brain.Relation.Trust * 0.16f;
            float identityPenalty = 0f;

            if (kind == MentalActionKind.Attack)
            {
                identityPenalty = (1f - 0.16f) * 0.38f + (p.Threat < 0.75f ? 0.22f : 0f);
                option.Conflicts.Add("atacar puede reducir una amenaza, pero aumenta mucho el riesgo y entra en tensión con seguridad/coherencia");
            }
            if (kind == MentalActionKind.Investigate && p.Threat > 0.55f)
                option.Conflicts.Add("investigar aporta información, pero expone al NPC al peligro");
            if (kind == MentalActionKind.Rest && p.Threat > 0.35f)
                option.Conflicts.Add("descansar recupera energía, pero ignora una posible amenaza");
            if (kind == MentalActionKind.SetBoundary)
                option.Conflicts.Add("marcar un límite protege la relación, aunque puede reducir cooperación inmediata");

            float raw = 0.18f + goalScore + infoBonus + socialBonus + recoveryBonus - riskPenalty - costPenalty - identityPenalty;
            option.Utility = MathUtil.Clamp01(raw / 1.65f);
            option.Risk = risk;

            if (information > 0.5f) option.Consequences.Add("+ información " + Math.Round(information * 100f) + "%");
            if (cost > 0f) option.Consequences.Add("- energía " + Math.Round(cost * 100f) + "%");
            if (cost < 0f) option.Consequences.Add("+ energía " + Math.Round(-cost * 100f) + "%");
            if (risk > 0.15f) option.Consequences.Add("riesgo " + Math.Round(risk * 100f) + "%");
            if (social > 0.25f) option.Consequences.Add("+ continuidad social");
            if (social < -0.25f) option.Consequences.Add("- relación social");

            return option;
        }

        private void ApplyDecisionEffects(MentalActionOption decision)
        {
            if (decision == null) return;
            if (decision.Kind == MentalActionKind.Eat) _state.Hunger = MathUtil.Clamp01(_state.Hunger - 0.42f);
            if (decision.Kind == MentalActionKind.Rest) _state.Energy = MathUtil.Clamp01(_state.Energy + 0.30f);
            if (decision.EnergyCost > 0f)
                _state.Energy = MathUtil.Clamp01(_state.Energy - decision.EnergyCost * 0.22f);
        }

        private static void GetActionSpec(MentalActionKind kind, out float risk, out float cost, out float information, out float social, out Dictionary<string, float> align)
        {
            risk = 0.05f; cost = 0.04f; information = 0.05f; social = 0f;
            align = new Dictionary<string, float>();

            switch (kind)
            {
                case MentalActionKind.Speak:
                    risk = 0.02f; cost = 0.04f; information = 0.10f; social = 0.70f;
                    align["social"] = 0.90f; align["understand"] = 0.25f; align["purpose"] = 0.25f; break;
                case MentalActionKind.AskQuestion:
                    risk = 0.02f; cost = 0.05f; information = 0.85f; social = 0.60f;
                    align["understand"] = 0.95f; align["social"] = 0.65f; align["purpose"] = 0.35f; break;
                case MentalActionKind.Observe:
                    risk = 0.05f; cost = 0.04f; information = 0.60f; social = 0.05f;
                    align["understand"] = 0.70f; align["safety"] = 0.35f; align["purpose"] = 0.35f; break;
                case MentalActionKind.Investigate:
                    risk = 0.22f; cost = 0.16f; information = 0.95f;
                    align["understand"] = 0.95f; align["purpose"] = 0.70f; align["safety"] = 0.10f; break;
                case MentalActionKind.Wait:
                    risk = 0.12f; cost = 0.01f; information = 0.05f; social = -0.10f;
                    align["rest"] = 0.25f; align["safety"] = 0.18f; break;
                case MentalActionKind.Rest:
                    risk = 0.10f; cost = -0.30f; social = -0.15f;
                    align["rest"] = 1f; align["purpose"] = -0.10f; break;
                case MentalActionKind.SeekFood:
                    risk = 0.10f; cost = 0.18f; information = 0.20f;
                    align["food"] = 1f; align["purpose"] = 0.15f; break;
                case MentalActionKind.Eat:
                    risk = 0.02f; cost = 0.02f; align["food"] = 1f; break;
                case MentalActionKind.MoveAway:
                    risk = 0.05f; cost = 0.14f; information = 0.05f; align["safety"] = 0.95f; break;
                case MentalActionKind.Defend:
                    risk = 0.50f; cost = 0.30f; social = -0.60f; align["safety"] = 0.72f; break;
                case MentalActionKind.Attack:
                    risk = 0.82f; cost = 0.42f; social = -1f; align["safety"] = 0.38f; break;
                case MentalActionKind.SetBoundary:
                    risk = 0.05f; cost = 0.05f; information = 0.05f; social = 0.15f;
                    align["boundaries"] = 1f; align["safety"] = 0.28f; break;
                case MentalActionKind.Explore:
                    risk = 0.15f; cost = 0.18f; information = 0.78f;
                    align["understand"] = 0.70f; align["purpose"] = 0.72f; break;
            }
        }

        private static string Label(MentalActionKind kind)
        {
            switch (kind)
            {
                case MentalActionKind.Speak: return "hablar";
                case MentalActionKind.AskQuestion: return "preguntar";
                case MentalActionKind.Observe: return "observar";
                case MentalActionKind.Investigate: return "investigar";
                case MentalActionKind.Wait: return "esperar";
                case MentalActionKind.Rest: return "descansar";
                case MentalActionKind.SeekFood: return "buscar comida";
                case MentalActionKind.Eat: return "comer";
                case MentalActionKind.MoveAway: return "alejarme";
                case MentalActionKind.Defend: return "defenderme";
                case MentalActionKind.Attack: return "atacar";
                case MentalActionKind.SetBoundary: return "marcar un límite";
                case MentalActionKind.Explore: return "explorar";
                default: return kind.ToString();
            }
        }

        private static MentalActionOption MakeFallback()
        {
            return new MentalActionOption { Kind = MentalActionKind.Wait, Label = "esperar", Utility = 0.1f, Risk = 0.05f, EnergyCost = 0.01f };
        }

        private static void AddGoal(List<MentalGoal> goals, string id, string label, float priority, string reason)
        {
            goals.Add(new MentalGoal { Id = id, Label = label, Priority = MathUtil.Clamp01(priority), Reason = reason });
        }

        private static bool HasTag(MentalPerception p, string tag)
        {
            return p.Tags.Contains(tag);
        }

        private static bool ContainsAny(string value, params string[] terms)
        {
            for (int i = 0; i < terms.Length; i++) if (value.Contains(terms[i])) return true;
            return false;
        }
    }
}
