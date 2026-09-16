using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace NpcInt.Core
{
    [Serializable]
    public sealed class NeuralIdentityContext
    {
        public string name = string.Empty;
        public string purpose = string.Empty;
        public string role = string.Empty;
        public List<string> values = new List<string>();
    }

    [Serializable]
    public sealed class NeuralMentalState
    {
        public float hunger;
        public float energy;
        public float fear;
        public float curiosity;
        public float trust;
        public float social;
        public string mood = string.Empty;
    }

    [Serializable]
    public sealed class NeuralGoalContext
    {
        public string id = string.Empty;
        public string label = string.Empty;
        public float priority;
        public string reason = string.Empty;
    }

    [Serializable]
    public sealed class NeuralDecisionContext
    {
        public string kind = string.Empty;
        public string label = string.Empty;
        public string target = string.Empty;
        public float utility;
        public float risk;
        public float energyCost;
        public List<string> consequences = new List<string>();
        public List<string> conflicts = new List<string>();
    }

    [Serializable]
    public sealed class NeuralContext
    {
        public NeuralIdentityContext identity = new NeuralIdentityContext();
        public NeuralMentalState mentalState = new NeuralMentalState();
        public List<string> memories = new List<string>();
        public List<NeuralGoalContext> goals = new List<NeuralGoalContext>();
        public NeuralDecisionContext decision = new NeuralDecisionContext();
        public List<string> knowledge = new List<string>();
        public string userInput = string.Empty;
    }

    [Serializable]
    public sealed class NeuralRequest
    {
        public string task = "utterance";
        public string prompt = string.Empty;
        public int maxTokens = 160;
        public float temperature = 0.6f;
        public int topK = 50;
        public NeuralContext context = new NeuralContext();
    }

    [Serializable]
    public sealed class NeuralResponse
    {
        public bool ok;
        public string text = string.Empty;
        public string backend = string.Empty;
        public string model = string.Empty;
        public string finishReason = string.Empty;
        public string error = string.Empty;
    }

    public interface INeuralLanguageModel
    {
        Task<NeuralResponse> GenerateAsync(NeuralRequest request, CancellationToken cancellationToken);
    }

    public static class NeuralPromptBuilder
    {
        public static NeuralRequest ForUtterance(
            NpcBrain brain,
            MentalCycleResult cycle,
            string userInput,
            IEnumerable<string> knowledge = null)
        {
            if (brain == null) throw new ArgumentNullException(nameof(brain));
            if (cycle == null) throw new ArgumentNullException(nameof(cycle));

            var request = new NeuralRequest
            {
                task = "utterance",
                context = BuildContext(brain, cycle, userInput, knowledge)
            };

            MentalActionOption d = cycle.Decision;
            string decisionLabel = d != null ? d.Label : "esperar";
            string decisionKind = d != null ? d.Kind.ToString() : MentalActionKind.Wait.ToString();

            var sb = new StringBuilder();
            sb.AppendLine("Eres la capa neuronal de lenguaje de un NPC llamado " + brain.Identity.Name + ".");
            sb.AppendLine("El motor cognitivo ya tomó la decisión. No la cambies y no inventes una acción física nueva.");
            sb.AppendLine("Tu trabajo es expresar esa decisión de forma natural, breve y coherente con el estado mental.");
            sb.AppendLine("Responde solo con lo que diría el NPC, sin explicar el sistema.");
            sb.AppendLine();
            sb.AppendLine("Entrada del jugador: " + (userInput ?? string.Empty));
            sb.AppendLine("Decisión: " + decisionKind + " / " + decisionLabel);
            sb.AppendLine("Ánimo: " + brain.Mood.Label);
            sb.AppendLine("Propósito: " + brain.Identity.Purpose);
            if (d != null && d.Conflicts.Count > 0)
                sb.AppendLine("Conflictos de la decisión: " + string.Join("; ", d.Conflicts));
            request.prompt = sb.ToString();
            return request;
        }

        public static NeuralRequest ForInterpretation(string text)
        {
            var request = new NeuralRequest
            {
                task = "interpret",
                maxTokens = 120,
                temperature = 0.2f
            };
            request.context.userInput = text ?? string.Empty;
            request.prompt =
                "Analiza el mensaje para un NPC. Devuelve JSON compacto con intent, tone, summary y confidence. " +
                "No respondas al usuario. Mensaje: " + (text ?? string.Empty);
            return request;
        }

        private static NeuralContext BuildContext(
            NpcBrain brain,
            MentalCycleResult cycle,
            string userInput,
            IEnumerable<string> knowledge)
        {
            var ctx = new NeuralContext
            {
                userInput = userInput ?? string.Empty,
                identity = new NeuralIdentityContext
                {
                    name = brain.Identity.Name,
                    purpose = brain.Identity.Purpose,
                    role = brain.Identity.Role,
                    values = new List<string>(brain.Identity.Values)
                },
                mentalState = new NeuralMentalState
                {
                    hunger = cycle.State != null ? cycle.State.Hunger : 0f,
                    energy = cycle.State != null ? cycle.State.Energy : 0f,
                    fear = cycle.State != null ? cycle.State.Fear : 0f,
                    curiosity = cycle.State != null ? cycle.State.Curiosity : 0f,
                    trust = cycle.State != null ? cycle.State.Trust : brain.Relation.Trust,
                    social = cycle.State != null ? cycle.State.Social : 0f,
                    mood = brain.Mood.Label
                }
            };

            for (int i = 0; i < cycle.RelevantMemories.Count; i++)
                ctx.memories.Add(cycle.RelevantMemories[i]);

            for (int i = 0; i < cycle.Goals.Count; i++)
            {
                MentalGoal g = cycle.Goals[i];
                ctx.goals.Add(new NeuralGoalContext
                {
                    id = g.Id,
                    label = g.Label,
                    priority = g.Priority,
                    reason = g.Reason
                });
            }

            if (cycle.Decision != null)
            {
                MentalActionOption d = cycle.Decision;
                ctx.decision = new NeuralDecisionContext
                {
                    kind = d.Kind.ToString(),
                    label = d.Label,
                    target = d.Target,
                    utility = d.Utility,
                    risk = d.Risk,
                    energyCost = d.EnergyCost,
                    consequences = new List<string>(d.Consequences),
                    conflicts = new List<string>(d.Conflicts)
                };
            }

            if (knowledge != null)
                ctx.knowledge.AddRange(knowledge);

            return ctx;
        }
    }
}
