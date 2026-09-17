using System;
using System.Collections.Generic;
using System.Linq;

namespace NpcInt.Core
{
    [Serializable]
    public sealed class NpcTurnEnvelope
    {
        public string contractVersion = "npc-int.turn.v1";
        public string turnId = string.Empty;
        public NpcTurnStimulus stimulus = new NpcTurnStimulus();
        public NpcTurnDecision decision = new NpcTurnDecision();
        public NpcTurnAction action = new NpcTurnAction();
        public NpcTurnIdea idea;
        public NpcTurnCompanion companion;
    }

    [Serializable]
    public sealed class NpcTurnStimulus
    {
        public string type = string.Empty;
        public string source = string.Empty;
        public string text = string.Empty;
        public float importance;
        public float threat;
    }

    [Serializable]
    public sealed class NpcTurnDecision
    {
        public string kind = string.Empty;
        public string label = string.Empty;
        public float utility;
        public float risk;
        public List<string> consequences = new List<string>();
        public List<string> conflicts = new List<string>();
    }

    [Serializable]
    public sealed class NpcTurnAction
    {
        public string kind = string.Empty;
        public string reason = string.Empty;
        public string utterance = string.Empty;
        public float utility;
    }

    [Serializable]
    public sealed class NpcTurnIdea
    {
        public string focus = string.Empty;
        public string claim = string.Empty;
        public float confidence;
        public string critique = string.Empty;
        public string recommendedTest = string.Empty;
        public string recommendedAction = string.Empty;
    }

    [Serializable]
    public sealed class NpcTurnCompanion
    {
        public string relationshipStage = string.Empty;
        public float familiarity;
        public float trust;
        public string activeTopic;
        public int openPendingCount;
    }

    public static class NpcTurnContractBuilder
    {
        public const string ContractVersion = "npc-int.turn.v1";

        public static NpcTurnEnvelope Build(
            BrainTurn turn,
            MentalCycleResult cycle,
            NpcIdea idea = null,
            CompanionEngine companionEngine = null,
            string turnId = null)
        {
            var envelope = new NpcTurnEnvelope
            {
                contractVersion = ContractVersion,
                turnId = turnId ?? Guid.NewGuid().ToString("N")
            };

            if (turn != null && turn.Stimulus != null)
            {
                envelope.stimulus = new NpcTurnStimulus
                {
                    type = turn.Stimulus.Type.ToString(),
                    source = turn.Stimulus.Source ?? string.Empty,
                    text = turn.Stimulus.Text ?? string.Empty,
                    importance = turn.Stimulus.Importance,
                    threat = turn.Stimulus.Threat
                };
            }

            if (cycle != null && cycle.Decision != null)
            {
                envelope.decision = new NpcTurnDecision
                {
                    kind = cycle.Decision.Kind.ToString(),
                    label = cycle.Decision.Label ?? string.Empty,
                    utility = cycle.Decision.Utility,
                    risk = cycle.Decision.Risk,
                    consequences = cycle.Decision.Consequences.ToList(),
                    conflicts = cycle.Decision.Conflicts.ToList()
                };
            }

            if (turn != null && turn.Action != null)
            {
                envelope.action = new NpcTurnAction
                {
                    kind = turn.Action.Kind.ToString(),
                    reason = turn.Action.Reason ?? string.Empty,
                    utterance = turn.Action.Utterance ?? string.Empty,
                    utility = turn.Action.Utility
                };
            }

            if (idea != null)
            {
                envelope.idea = new NpcTurnIdea
                {
                    focus = idea.Focus ?? string.Empty,
                    claim = idea.Claim ?? string.Empty,
                    confidence = idea.Confidence,
                    critique = idea.Critique ?? string.Empty,
                    recommendedTest = idea.RecommendedTest ?? string.Empty,
                    recommendedAction = idea.RecommendedAction.ToString()
                };
            }

            if (companionEngine != null && companionEngine.State != null)
            {
                CompanionState state = companionEngine.State;
                CompanionTopic active = state.Topics
                    .Where(x => x.Status == "active")
                    .OrderByDescending(x => x.LastMentionedUtc)
                    .FirstOrDefault();
                envelope.companion = new NpcTurnCompanion
                {
                    relationshipStage = state.Relationship.Stage ?? string.Empty,
                    familiarity = state.Relationship.Familiarity,
                    trust = state.Relationship.Trust,
                    activeTopic = active == null ? null : active.Label,
                    openPendingCount = state.Pending.Count(x => x.Status == "open")
                };
            }

            return envelope;
        }
    }
}
