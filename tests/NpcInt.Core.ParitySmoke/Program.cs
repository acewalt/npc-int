using System.Text.Json;
using NpcInt.Core;

internal sealed class ScenarioFile
{
    public int version { get; set; }
    public List<Scenario> scenarios { get; set; } = new();
}

internal sealed class Scenario
{
    public string id { get; set; }
    public string kind { get; set; }
    public string text { get; set; }
    public float minutes { get; set; } = 1f;
    public ScenarioState state { get; set; } = new();
}

internal sealed class ScenarioState
{
    public float hunger { get; set; } = 0.18f;
    public float energy { get; set; } = 0.88f;
    public float curiosity { get; set; } = 0.46f;
    public float fear { get; set; } = 0.04f;
    public float trust { get; set; } = 0.45f;
}

internal static class Program
{
    private static string NormalizeDecision(MentalActionKind kind)
    {
        return kind switch
        {
            MentalActionKind.Speak => "respond",
            MentalActionKind.AskQuestion => "ask",
            MentalActionKind.Observe => "observe",
            MentalActionKind.Investigate => "investigate",
            MentalActionKind.Wait => "wait",
            MentalActionKind.Rest => "rest",
            MentalActionKind.SeekFood => "seek_food",
            MentalActionKind.Eat => "eat",
            MentalActionKind.MoveAway => "move_away",
            MentalActionKind.Defend => "defend",
            MentalActionKind.Attack => "attack",
            MentalActionKind.SetBoundary => "set_boundary",
            MentalActionKind.Explore => "explore",
            _ => kind.ToString().ToLowerInvariant()
        };
    }

    public static int Main(string[] args)
    {
        string scenarioPath = args.Length > 0 ? args[0] : "tests/parity/mental-scenarios.json";
        ScenarioFile input = JsonSerializer.Deserialize<ScenarioFile>(File.ReadAllText(scenarioPath))
            ?? throw new InvalidOperationException("No se pudo leer el archivo de escenarios.");

        var results = new List<object>();
        foreach (Scenario s in input.scenarios)
        {
            var brain = new NpcBrain(42);
            brain.Drives.Curiosity = s.state.curiosity;
            brain.Drives.Threat = s.state.fear;
            brain.Drives.Fatigue = 1f - s.state.energy;
            brain.Relation.Trust = s.state.trust;

            var mind = new MentalCycleEngine(brain);
            mind.SetNeed("hunger", s.state.hunger);
            mind.SetNeed("energy", s.state.energy);
            mind.SetNeed("fear", s.state.fear);
            mind.SetNeed("curiosity", s.state.curiosity);

            MentalCycleResult cycle = s.kind switch
            {
                "user" => mind.ThinkMessage(s.text ?? string.Empty),
                "world" => mind.ThinkWorld(s.text ?? string.Empty),
                _ => mind.ThinkTime(s.minutes <= 0f ? 1f : s.minutes)
            };

            results.Add(new
            {
                id = s.id,
                decision = cycle.Decision == null ? null : NormalizeDecision(cycle.Decision.Kind),
                topGoal = cycle.Goals.Count == 0 ? null : cycle.Goals[0].Id,
                tags = cycle.Perception == null ? Array.Empty<string>() : cycle.Perception.Tags.OrderBy(x => x).ToArray()
            });
        }

        Console.Write(JsonSerializer.Serialize(new { version = input.version, engine = "csharp", results }));
        return 0;
    }
}
