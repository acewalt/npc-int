using System;
using System.Collections.Generic;

namespace NpcInt.Core
{
    public sealed class CompanionRelationship
    {
        public int Interactions;
        public float Familiarity = 0.06f;
        public float Trust = 0.45f;
        public float Comfort = 0.34f;
        public float Rapport = 0.28f;
        public float Reciprocity = 0.40f;
        public float Tension;
        public float BoundaryPressure;
        public int PositiveStreak;
        public int HostileStreak;
        public string Stage = "nuevo";
    }

    public sealed class SocialMemoryRecord
    {
        public long Id;
        public string Kind = string.Empty;
        public string Value = string.Empty;
        public string Source = "explicit-user";
        public float Confidence = 0.9f;
        public float Importance = 0.55f;
        public int Mentions = 1;
        public DateTime CreatedUtc = DateTime.UtcNow;
        public DateTime LastMentionedUtc = DateTime.UtcNow;
    }

    public sealed class CompanionTopic
    {
        public long Id;
        public string Key = string.Empty;
        public string Label = string.Empty;
        public string Status = "active";
        public int Mentions;
        public float Importance = 0.55f;
        public DateTime LastMentionedUtc = DateTime.UtcNow;
    }

    public sealed class CompanionPendingThread
    {
        public long Id;
        public string Kind = string.Empty;
        public string Text = string.Empty;
        public string Status = "open";
        public float Priority = 0.55f;
        public string Source = "conversation";
        public DateTime CreatedUtc = DateTime.UtcNow;
        public DateTime LastMentionedUtc = DateTime.UtcNow;
    }

    public sealed class CompanionStyle
    {
        public string Stage = "nuevo";
        public float Warmth = 0.45f;
        public float Casualness = 0.32f;
        public float Directness = 0.58f;
        public float Playfulness = 0.12f;
        public float Curiosity = 0.65f;
        public float Patience = 0.70f;
        public float EpistemicCaution = 0.82f;
        public bool AskFollowUp;
    }

    public sealed class CompanionIntervention
    {
        public string Intent = string.Empty;
        public string Utterance = string.Empty;
        public string Reason = string.Empty;
        public bool IsInitiative;
        public float Score;

        public bool HasUtterance
        {
            get { return !string.IsNullOrWhiteSpace(Utterance); }
        }
    }

    public sealed class CompanionState
    {
        public readonly CompanionRelationship Relationship = new CompanionRelationship();
        public readonly List<SocialMemoryRecord> SocialMemories = new List<SocialMemoryRecord>();
        public readonly List<CompanionTopic> Topics = new List<CompanionTopic>();
        public readonly List<CompanionPendingThread> Pending = new List<CompanionPendingThread>();
        public readonly List<string> InitiativeHistory = new List<string>();
        public readonly Dictionary<string, float> Traits = new Dictionary<string, float>
        {
            { "curiosity", 0.82f }, { "caution", 0.67f }, { "empathy", 0.64f },
            { "directness", 0.58f }, { "sociability", 0.56f }, { "playfulness", 0.24f },
            { "patience", 0.72f }, { "independence", 0.63f }, { "evidenceSeeking", 0.88f }
        };

        public long NextMemoryId = 1;
        public long NextTopicId = 1;
        public long NextPendingId = 1;
        public long ActiveTopicId = -1;
        public float MinutesSinceUser;
        public float MinutesSinceNpc;
        public float MinutesSinceInitiative = 99f;
        public string LastIntent = string.Empty;
        public string LastReply = string.Empty;
    }
}
