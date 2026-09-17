using System;
using System.Collections.Generic;

namespace NpcInt.Core
{
    /// <summary>
    /// Shared base vocabulary used by mental perception and companion behavior.
    /// Consumers may add contextual scoring, but should not duplicate these terms.
    /// </summary>
    public static class MentalPerceptionVocabulary
    {
        private static readonly IReadOnlyList<string> SharedHostileTerms = Array.AsReadOnly(new[]
        {
            "malparido",
            "malparida",
            "caremonda",
            "hijueputa",
            "hpta",
            "gonorrea",
            "idiota",
            "imbecil",
            "estupido",
            "callate",
            "largate"
        });

        private static readonly HashSet<string> HostileTermSet =
            new HashSet<string>(SharedHostileTerms, StringComparer.Ordinal);

        public static IReadOnlyList<string> HostileTerms { get { return SharedHostileTerms; } }

        public static bool ContainsHostileToken(string normalizedText)
        {
            if (string.IsNullOrWhiteSpace(normalizedText)) return false;

            int tokenStart = -1;
            for (int i = 0; i <= normalizedText.Length; i++)
            {
                bool isTokenCharacter = i < normalizedText.Length && char.IsLetterOrDigit(normalizedText[i]);
                if (isTokenCharacter)
                {
                    if (tokenStart < 0) tokenStart = i;
                    continue;
                }

                if (tokenStart < 0) continue;
                string token = normalizedText.Substring(tokenStart, i - tokenStart);
                if (HostileTermSet.Contains(token)) return true;
                tokenStart = -1;
            }

            return false;
        }
    }
}
