using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace NpcInt.Core
{
    [Serializable]
    public sealed class NlpFeature
    {
        public string name;
        public string value;
    }

    [Serializable]
    public sealed class NlpToken
    {
        public int id;
        public string text;
        public string lemma;
        public string upos;
        public string xpos;
        public List<NlpFeature> features = new List<NlpFeature>();
        public int head;
        public string deprel;
        public int start;
        public int end;
        public string ner;

        public string Feature(string key)
        {
            if (features == null) return null;
            for (int i = 0; i < features.Count; i++)
                if (string.Equals(features[i].name, key, StringComparison.OrdinalIgnoreCase))
                    return features[i].value;
            return null;
        }
    }

    [Serializable]
    public sealed class NlpRole
    {
        public string role;
        public string text;
        public int token;
        public float confidence;
    }

    [Serializable]
    public sealed class NlpPredicate
    {
        public int token;
        public string text;
        public string lemma;
        public string upos;
    }

    [Serializable]
    public sealed class NlpSemanticFrame
    {
        public string speechType;
        public NlpPredicate predicate;
        public List<NlpRole> roles = new List<NlpRole>();
        public bool negated;
        public List<string> questionWords = new List<string>();
        public float confidence;
        public string source;
    }

    [Serializable]
    public sealed class NlpSentence
    {
        public int id;
        public string text;
        public List<NlpToken> tokens = new List<NlpToken>();
        public NlpSemanticFrame semanticFrame;
    }

    [Serializable]
    public sealed class NlpEntity
    {
        public string text;
        public string type;
        public int start;
        public int end;
        public string source;
    }

    [Serializable]
    public sealed class NlpCoreference
    {
        public string mention;
        public int mentionSentence;
        public int mentionToken;
        public string antecedent;
        public int antecedentSentence;
        public int antecedentToken;
        public float confidence;
        public string source;
        public string status;
    }

    [Serializable]
    public sealed class NlpCorefMention
    {
        public int sentence;
        public int startWord;
        public int endWord;
        public string text;
        public bool representative;
    }

    [Serializable]
    public sealed class NlpCorefChain
    {
        public int index;
        public string representative;
        public List<NlpCorefMention> mentions = new List<NlpCorefMention>();
        public string source;
    }

    [Serializable]
    public sealed class NlpAnalysis
    {
        public bool ok;
        public string language;
        public string backend;
        public string model;
        public string corefMode;
        public string corefFallbackReason;
        public string text;
        public float elapsedMs;
        public List<string> processors = new List<string>();
        public List<NlpSentence> sentences = new List<NlpSentence>();
        public List<NlpEntity> entities = new List<NlpEntity>();
        public List<NlpCoreference> coreferences = new List<NlpCoreference>();
        public List<NlpCorefChain> coreferenceChains = new List<NlpCorefChain>();
        public List<NlpSemanticFrame> frames = new List<NlpSemanticFrame>();
        public string error;
    }

    [Serializable]
    public sealed class NlpAnalyzeRequest
    {
        public string text;
    }

    public interface INlpAnalyzer
    {
        Task<NlpAnalysis> AnalyzeAsync(string text, CancellationToken cancellationToken);
    }

    public sealed class DialogueAct
    {
        public string Intent;
        public float Confidence;
        public string Predicate;
        public string Tense;
        public string Mood;
        public string Person;
        public string Number;
        public bool Negative;
        public string Agent;
        public string Patient;
        public List<NlpEntity> Entities = new List<NlpEntity>();
        public List<NlpCoreference> Coreferences = new List<NlpCoreference>();
    }

    public static class NlpDialogueInterpreter
    {
        private static string Fold(string value)
        {
            if (string.IsNullOrEmpty(value)) return string.Empty;
            string s = value.ToLowerInvariant();
            return s.Replace("á", "a").Replace("é", "e").Replace("í", "i")
                .Replace("ó", "o").Replace("ú", "u").Replace("ü", "u");
        }

        private static bool HasLemma(List<NlpToken> tokens, string lemma)
        {
            string wanted = Fold(lemma);
            for (int i = 0; i < tokens.Count; i++)
                if (Fold(tokens[i].lemma) == wanted || Fold(tokens[i].text) == wanted) return true;
            return false;
        }

        private static bool SecondPerson(List<NlpToken> tokens)
        {
            for (int i = 0; i < tokens.Count; i++)
            {
                if (tokens[i].Feature("Person") == "2") return true;
                string w = Fold(tokens[i].text);
                if (w == "tu" || w == "usted") return true;
            }
            return false;
        }

        public static DialogueAct Interpret(NlpAnalysis analysis)
        {
            var act = new DialogueAct();
            if (analysis == null || !analysis.ok || analysis.sentences == null) return act;

            var tokens = new List<NlpToken>();
            for (int s = 0; s < analysis.sentences.Count; s++)
                if (analysis.sentences[s].tokens != null)
                    tokens.AddRange(analysis.sentences[s].tokens);

            NlpSemanticFrame frame = analysis.frames != null && analysis.frames.Count > 0
                ? analysis.frames[0]
                : (analysis.sentences.Count > 0 ? analysis.sentences[0].semanticFrame : null);

            bool question = frame != null && (frame.speechType == "question" || (frame.questionWords != null && frame.questionWords.Count > 0));
            bool second = SecondPerson(tokens);
            bool hacer = HasLemma(tokens, "hacer");
            bool querer = HasLemma(tokens, "querer");
            bool poder = HasLemma(tokens, "poder") || HasLemma(tokens, "saber");
            bool recordar = HasLemma(tokens, "recordar");
            bool entender = HasLemma(tokens, "entender") || HasLemma(tokens, "comprender");
            bool pensar = HasLemma(tokens, "pensar") || (HasLemma(tokens, "tener") && HasLemma(tokens, "mente"));
            bool estar = HasLemma(tokens, "estar") || HasLemma(tokens, "sentir");
            bool ir = HasLemma(tokens, "ir");

            if (question && recordar && second) { act.Intent = "ask_memory_semantic"; act.Confidence = .93f; }
            else if (question && entender && second) { act.Intent = "ask_understanding"; act.Confidence = .94f; }
            else if (question && pensar && second) { act.Intent = "ask_current_thought"; act.Confidence = .96f; }
            else if (question && poder && second) { act.Intent = "ask_capabilities"; act.Confidence = .91f; }
            else if (question && querer && second) { act.Intent = "ask_desired_action"; act.Confidence = .95f; }
            else if (question && hacer && second) { act.Intent = ir ? "ask_future_action" : "ask_activity"; act.Confidence = .95f; }
            else if (question && estar && second) { act.Intent = "ask_state"; act.Confidence = .84f; }

            if (frame != null)
            {
                act.Negative = frame.negated;
                if (frame.predicate != null) act.Predicate = frame.predicate.lemma;
                if (frame.roles != null)
                {
                    for (int i = 0; i < frame.roles.Count; i++)
                    {
                        if (frame.roles[i].role == "agent" && act.Agent == null) act.Agent = frame.roles[i].text;
                        if (frame.roles[i].role == "patient" && act.Patient == null) act.Patient = frame.roles[i].text;
                    }
                }
            }

            for (int i = 0; i < tokens.Count; i++)
            {
                if (Fold(tokens[i].lemma) == Fold(act.Predicate))
                {
                    act.Tense = tokens[i].Feature("Tense");
                    act.Mood = tokens[i].Feature("Mood");
                    act.Person = tokens[i].Feature("Person");
                    act.Number = tokens[i].Feature("Number");
                    break;
                }
            }

            if (analysis.entities != null) act.Entities.AddRange(analysis.entities);
            if (analysis.coreferences != null) act.Coreferences.AddRange(analysis.coreferences);
            return act;
        }
    }
}
