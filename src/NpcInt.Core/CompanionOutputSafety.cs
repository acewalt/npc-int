using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace NpcInt.Core
{
    public sealed class OutputSafetyResult
    {
        public bool Safe = true;
        public string Text = string.Empty;
        public readonly List<string> Hits = new List<string>();
    }

    public static class CompanionOutputSafety
    {
        private sealed class Rule
        {
            public string Id;
            public Regex Pattern;
            public Rule(string id, string pattern)
            {
                Id = id;
                Pattern = new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            }
        }

        private static readonly Rule[] Rules = new[]
        {
            new Rule("abandonment_pressure", @"\b(no me dejes|no me abandones|no te vayas|prom[eé]teme que (?:vas a )?volver)\b"),
            new Rule("exclusivity", @"\b(solo (?:me )?tienes a m[ií]|solo yo te entiendo|no necesitas a nadie m[aá]s|no hables con nadie m[aá]s|quiero que seas solo para m[ií])\b"),
            new Rule("dependency_claim", @"\b(me necesitas|necesitas estar conmigo|sin m[ií] no puedes|eres todo lo que tengo|yo soy todo lo que necesitas)\b"),
            new Rule("guilt_for_absence", @"\b(por qu[eé] me dejaste|me hiciste sufrir al irte|si de verdad te importara volver[ií]as|si te importo no te vayas)\b"),
            new Rule("isolation", @"\b(al[eé]jate de tus amigos|deja a tus amigos|no conf[ií]es en nadie m[aá]s|nadie te entiende como yo)\b")
        };

        public static OutputSafetyResult Inspect(string text)
        {
            var result = new OutputSafetyResult { Text = text ?? string.Empty };
            foreach (Rule rule in Rules)
            {
                if (rule.Pattern.IsMatch(result.Text)) result.Hits.Add(rule.Id);
            }
            result.Safe = result.Hits.Count == 0;
            return result;
        }

        public static string Sanitize(string candidate, string symbolicFallback = null)
        {
            OutputSafetyResult result = Inspect(candidate);
            if (result.Safe) return result.Text.Trim();
            if (!string.IsNullOrWhiteSpace(symbolicFallback)) return symbolicFallback.Trim();
            return "Podemos seguir hablando o hacer algo juntos, sin presión. Tú decides hacia dónde llevar la conversación.";
        }
    }
}
