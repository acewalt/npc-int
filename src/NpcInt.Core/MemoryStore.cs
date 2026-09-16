using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace NpcInt.Core
{
    public sealed class MemoryEntry
    {
        public long Id;
        public DateTime TimeUtc;
        public string Kind;
        public string Source;
        public string Text;
        public float Salience;
        public float Valence;
        public int Repetitions;
    }

    public sealed class MemoryStore
    {
        private readonly List<MemoryEntry> _items = new List<MemoryEntry>();
        private long _nextId = 1;

        public int Capacity { get; set; } = 240;
        public IReadOnlyList<MemoryEntry> Items { get { return _items; } }

        public MemoryEntry Add(string kind, string source, string text, float salience = 0.5f, float valence = 0f)
        {
            var item = new MemoryEntry
            {
                Id = _nextId++,
                TimeUtc = DateTime.UtcNow,
                Kind = kind ?? "episodio",
                Source = source ?? "mundo",
                Text = text ?? string.Empty,
                Salience = MathUtil.Clamp01(salience),
                Valence = MathUtil.Clamp(valence, -1f, 1f),
                Repetitions = 1
            };
            _items.Add(item);
            while (_items.Count > Capacity) _items.RemoveAt(0);
            return item;
        }

        public List<MemoryEntry> Recall(string query, int count = 3, long excludeId = -1)
        {
            HashSet<string> q = Tokens(query);
            if (q.Count == 0) return new List<MemoryEntry>();

            return _items
                .Where(x => x.Id != excludeId)
                .Select(x => new { Item = x, Score = Similarity(q, Tokens(x.Text)) + x.Salience * 0.12f })
                .Where(x => x.Score > 0.08f)
                .OrderByDescending(x => x.Score)
                .ThenByDescending(x => x.Item.Id)
                .Take(count)
                .Select(x => x.Item)
                .ToList();
        }

        public MemoryEntry MostRecent(Func<MemoryEntry, bool> predicate = null)
        {
            for (int i = _items.Count - 1; i >= 0; i--)
                if (predicate == null || predicate(_items[i])) return _items[i];
            return null;
        }

        public static float TextSimilarity(string a, string b)
        {
            return Similarity(Tokens(a), Tokens(b));
        }

        internal static HashSet<string> Tokens(string text)
        {
            var result = new HashSet<string>();
            string normalized = Normalize(text);
            string[] parts = normalized.Split(new[] { ' ', '\t', '\r', '\n', '.', ',', ';', ':', '!', '?', '¿', '¡', '(', ')', '[', ']', '"', '\'' }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < parts.Length; i++)
            {
                string p = parts[i].Trim();
                if (p.Length > 1 && !StopWords.Contains(p)) result.Add(p);
            }
            return result;
        }

        internal static string Normalize(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;
            string formD = value.ToLowerInvariant().Normalize(NormalizationForm.FormD);
            var sb = new StringBuilder();
            foreach (char c in formD)
            {
                UnicodeCategory category = CharUnicodeInfo.GetUnicodeCategory(c);
                if (category != UnicodeCategory.NonSpacingMark) sb.Append(c);
            }
            return sb.ToString().Normalize(NormalizationForm.FormC);
        }

        private static float Similarity(HashSet<string> a, HashSet<string> b)
        {
            if (a.Count == 0 || b.Count == 0) return 0f;
            int common = 0;
            foreach (string token in a) if (b.Contains(token)) common++;
            int union = a.Count + b.Count - common;
            return union <= 0 ? 0f : (float)common / union;
        }

        private static readonly HashSet<string> StopWords = new HashSet<string>
        {
            "de","la","el","los","las","un","una","unos","unas","y","o","que","en","a","por","para","con","me","te","se","mi","tu","es","soy","eres","esto","esa","ese","del","al"
        };
    }
}
