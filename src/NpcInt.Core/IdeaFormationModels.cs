using System.Collections.Generic;

namespace NpcInt.Core
{
    public sealed class ConceptActivation
    {
        public string Id = string.Empty;
        public string Label = string.Empty;
        public float Score;
        public bool Observed;
        public readonly List<string> Path = new List<string>();
    }

    public sealed class HypothesisEvidence
    {
        public string Text = string.Empty;
        public float Weight;
        public string Source = string.Empty;
    }

    public sealed class NpcHypothesis
    {
        public string Id = string.Empty;
        public string Claim = string.Empty;
        public string CauseId = string.Empty;
        public string CauseLabel = string.Empty;
        public string EffectId = string.Empty;
        public string EffectLabel = string.Empty;
        public float Confidence;
        public string Status = "unverified";
        public readonly List<HypothesisEvidence> EvidenceFor = new List<HypothesisEvidence>();
        public readonly List<HypothesisEvidence> EvidenceAgainst = new List<HypothesisEvidence>();
        public string Test = string.Empty;
        public float Testability;
    }

    public sealed class IdeaScore
    {
        public float Relevance;
        public float Plausibility;
        public float Testability;
        public float Novelty;
        public float ContradictionPenalty;
        public float Total;
    }

    public sealed class NpcIdea
    {
        public string Focus = string.Empty;
        public readonly List<ConceptActivation> Concepts = new List<ConceptActivation>();
        public readonly List<NpcHypothesis> Hypotheses = new List<NpcHypothesis>();
        public string Claim = string.Empty;
        public string Rationale = string.Empty;
        public float Confidence;
        public string Critique = string.Empty;
        public string RecommendedTest = string.Empty;
        public MentalActionKind RecommendedAction = MentalActionKind.Observe;
        public IdeaScore Score = new IdeaScore();
    }
}
