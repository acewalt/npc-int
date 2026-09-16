using System.Collections.Generic;

namespace NpcInt.Core
{
    public enum MentalPerceptionType
    {
        UserMessage,
        WorldEvent,
        Time,
        Internal
    }

    public enum MentalActionKind
    {
        Speak,
        AskQuestion,
        Observe,
        Investigate,
        Wait,
        Rest,
        SeekFood,
        Eat,
        MoveAway,
        Defend,
        Attack,
        SetBoundary,
        Explore
    }

    public sealed class MentalNeedState
    {
        public float Hunger = 0.18f;
        public float Energy = 0.88f;
        public float Fear = 0.04f;
        public float Curiosity = 0.46f;
        public float Trust = 0.45f;
        public float Social = 0.34f;

        public MentalNeedState Clone()
        {
            return new MentalNeedState
            {
                Hunger = Hunger,
                Energy = Energy,
                Fear = Fear,
                Curiosity = Curiosity,
                Trust = Trust,
                Social = Social
            };
        }
    }

    public sealed class MentalPerception
    {
        public MentalPerceptionType Type;
        public string Source = string.Empty;
        public string Text = string.Empty;
        public float Threat;
        public float Importance = 0.5f;
        public float Novelty = 0.5f;
        public readonly List<string> Tags = new List<string>();
    }

    public sealed class MentalGoal
    {
        public string Id = string.Empty;
        public string Label = string.Empty;
        public float Priority;
        public string Reason = string.Empty;
    }

    public sealed class MentalActionOption
    {
        public MentalActionKind Kind;
        public string Label = string.Empty;
        public string Target = string.Empty;
        public float Utility;
        public float Risk;
        public float EnergyCost;
        public readonly List<string> Consequences = new List<string>();
        public readonly List<string> Conflicts = new List<string>();
        public readonly List<string> Contributions = new List<string>();
    }

    public sealed class MentalCycleResult
    {
        public MentalPerception Perception;
        public MentalNeedState State;
        public string IdentitySummary = string.Empty;
        public readonly List<string> RelevantMemories = new List<string>();
        public readonly List<MentalGoal> Goals = new List<MentalGoal>();
        public readonly List<MentalActionOption> Options = new List<MentalActionOption>();
        public MentalActionOption Decision;
        public string ExecutionStatus = "selected";
    }
}
