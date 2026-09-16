using System;
using System.Collections.Generic;

namespace NpcInt.Core
{
    public enum StimulusType { UserMessage, WorldEvent, Time }
    public enum ThoughtKind { Observation, Recall, Appraisal, Goal, Reflection }
    public enum ActionKind { None, Speak, AskQuestion, Observe, Investigate, StaySilent }

    public sealed class NpcIdentity
    {
        public string Name = "NIA-01";
        public string Kind = "agente NPC local";
        public string Role = "habitante autónomo del mundo";
        public string Purpose = "comprender mi entorno, conservar continuidad y actuar de acuerdo con mis experiencias";
        public string Origin = "motor cognitivo npc-int";
        public string SelfDescription = "No soy una persona real: soy un personaje simulado con memoria, estado interno y reglas de decisión.";
        public readonly List<string> Values = new List<string> { "continuidad", "curiosidad", "seguridad", "coherencia" };
    }

    public sealed class Personality
    {
        public float Curiosity = 0.72f;
        public float Sociability = 0.62f;
        public float Caution = 0.48f;
        public float Empathy = 0.66f;
        public float Assertiveness = 0.45f;

        public void Clamp()
        {
            Curiosity = MathUtil.Clamp01(Curiosity);
            Sociability = MathUtil.Clamp01(Sociability);
            Caution = MathUtil.Clamp01(Caution);
            Empathy = MathUtil.Clamp01(Empathy);
            Assertiveness = MathUtil.Clamp01(Assertiveness);
        }
    }

    public sealed class DriveState
    {
        public float Social = 0.34f;
        public float Curiosity = 0.46f;
        public float Fatigue = 0.08f;
        public float Purpose = 0.31f;
        public float Autonomy = 0.24f;
        public float Threat = 0.04f;

        public void Tick(float minutes, Personality p)
        {
            if (minutes <= 0f) return;
            Social = MathUtil.Clamp01(Social + minutes * (0.010f + p.Sociability * 0.006f));
            Curiosity = MathUtil.Clamp01(Curiosity + minutes * (0.007f + p.Curiosity * 0.006f));
            Fatigue = MathUtil.Clamp01(Fatigue + minutes * 0.004f);
            Purpose = MathUtil.Clamp01(Purpose + minutes * 0.006f);
            Autonomy = MathUtil.Clamp01(Autonomy + minutes * 0.004f);
            Threat = MathUtil.Clamp01(Threat - minutes * 0.018f);
        }

        public string DominantName()
        {
            string name = "social";
            float max = Social;
            if (Curiosity > max) { name = "curiosidad"; max = Curiosity; }
            if (Fatigue > max) { name = "fatiga"; max = Fatigue; }
            if (Purpose > max) { name = "propósito"; max = Purpose; }
            if (Autonomy > max) { name = "autonomía"; max = Autonomy; }
            if (Threat > max) { name = "amenaza"; }
            return name;
        }

        public float Get(string name)
        {
            switch (name)
            {
                case "social": return Social;
                case "curiosidad": return Curiosity;
                case "fatiga": return Fatigue;
                case "propósito": return Purpose;
                case "autonomía": return Autonomy;
                case "amenaza": return Threat;
                default: return 0f;
            }
        }
    }

    public sealed class MoodState
    {
        public float Valence = 0.10f;
        public float Arousal = 0.22f;

        public string Label
        {
            get
            {
                if (Arousal > 0.68f && Valence < -0.25f) return "alerta";
                if (Valence < -0.35f) return "incómodo";
                if (Valence > 0.45f && Arousal > 0.45f) return "animado";
                if (Valence > 0.28f) return "receptivo";
                if (Arousal < 0.20f) return "calmado";
                return "neutral";
            }
        }

        public void Decay(float minutes)
        {
            float amount = MathUtil.Clamp01(minutes * 0.02f);
            Valence = MathUtil.Lerp(Valence, 0f, amount);
            Arousal = MathUtil.Lerp(Arousal, 0.18f, amount);
        }
    }

    public sealed class RelationState
    {
        public string OtherName = "Jugador";
        public float Familiarity = 0.06f;
        public float Trust = 0.45f;
        public float Affinity = 0.05f;
    }

    public sealed class Stimulus
    {
        public StimulusType Type;
        public string Source;
        public string Text;
        public float Importance;
        public float Novelty;
        public float Threat;

        public Stimulus(StimulusType type, string source, string text)
        {
            Type = type;
            Source = source ?? "mundo";
            Text = text ?? string.Empty;
            Importance = 0.5f;
            Novelty = 0.5f;
            Threat = 0f;
        }
    }

    public sealed class Thought
    {
        public ThoughtKind Kind;
        public string Text;
        public float Weight;

        public Thought(ThoughtKind kind, string text, float weight = 0.5f)
        {
            Kind = kind;
            Text = text;
            Weight = weight;
        }
    }

    public sealed class NpcAction
    {
        public ActionKind Kind = ActionKind.None;
        public string Reason = string.Empty;
        public string Utterance = string.Empty;
        public float Utility;
    }

    public sealed class BrainTurn
    {
        public Stimulus Stimulus;
        public readonly List<Thought> Thoughts = new List<Thought>();
        public NpcAction Action = new NpcAction();
        public string DominantDrive = string.Empty;
        public string Mood = string.Empty;
    }

    public sealed class DialoguePattern
    {
        public string Trigger;
        public string Response;
        public int Uses;

        public DialoguePattern(string trigger, string response)
        {
            Trigger = trigger;
            Response = response;
        }
    }

    internal static class MathUtil
    {
        public static float Clamp01(float v) { return v < 0f ? 0f : (v > 1f ? 1f : v); }
        public static float Clamp(float v, float min, float max) { return v < min ? min : (v > max ? max : v); }
        public static float Lerp(float a, float b, float t) { return a + (b - a) * Clamp01(t); }
    }
}
