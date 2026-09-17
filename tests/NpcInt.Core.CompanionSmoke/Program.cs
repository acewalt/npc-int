using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using NpcInt.Core;

internal static class Program
{
    private static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception("ASSERT: " + message);
    }

    private static NpcAction Talk(NpcBrain brain, CompanionEngine companion, string text)
    {
        companion.ObserveUserTurn(brain, text);
        BrainTurn turn = brain.ProcessMessage(text, "Jugador");
        turn.Action = companion.AdaptConversationAction(brain, text, turn.Action, null);
        companion.ObserveNpcReply(turn.Action == null ? null : turn.Action.Utterance);
        return turn.Action;
    }

    private static SocialTopicPack LoadSocialTopics()
    {
        string relative = Path.Combine("knowledge", "social-topics.es.json");
        string directory = Directory.GetCurrentDirectory();
        while (!string.IsNullOrEmpty(directory))
        {
            string candidate = Path.Combine(directory, relative);
            if (File.Exists(candidate))
            {
                var options = new JsonSerializerOptions { IncludeFields = true };
                return JsonSerializer.Deserialize<SocialTopicPack>(File.ReadAllText(candidate), options)
                    ?? throw new Exception("No se pudo deserializar el banco social canónico.");
            }
            DirectoryInfo parent = Directory.GetParent(directory);
            directory = parent == null ? null : parent.FullName;
        }
        throw new FileNotFoundException("No se encontró el banco social canónico.", relative);
    }

    private static string BestTopicForLike(SocialTopicPack pack, string interest)
    {
        var brain = new NpcBrain(17);
        var companion = new CompanionEngine();
        companion.ConfigureSocialTopics(pack.topics);
        companion.ObserveUserTurn(brain, "Me gusta " + interest);
        CompanionIntervention selected = companion.SelectSocialTopic(brain);
        return selected == null ? null : selected.ContentId;
    }

    public static int Main()
    {
        var brain = new NpcBrain(42);
        var companion = new CompanionEngine();
        SocialTopicPack socialTopics = LoadSocialTopics();
        int configuredTopics = companion.ConfigureSocialTopics(socialTopics.topics);
        Assert(configuredTopics >= 60, "el Core debe aceptar el banco social ampliado sin leer JSON directamente");
        Assert(socialTopics.topics.First(x => x.id == "silence_as_action").opinion.IndexOf("nada relevante que hablar", StringComparison.OrdinalIgnoreCase) < 0,
            "el contenido del silencio debe conservar una redacción natural");
        Assert(BestTopicForLike(socialTopics, "arquitectura") == "architecture_and_behavior",
            "arquitectura debe privilegiar el label específico frente a tags técnicos ambiguos");
        Assert(BestTopicForLike(socialTopics, "mapas") == "maps_and_choices",
            "mapas debe privilegiar el label específico frente a señales auxiliares de videojuegos");
        Assert(BestTopicForLike(socialTopics, "música") == "music_for_moods",
            "música debe privilegiar un label específico frente al tag auxiliar de sonido para NPCs");

        var coldBrain = new NpcBrain(18);
        var coldCompanion = new CompanionEngine();
        coldCompanion.ConfigureSocialTopics(socialTopics.topics);
        var coldFamilies = new List<string>();
        for (int i = 0; i < 5; i++)
        {
            CompanionIntervention next = coldCompanion.SelectSocialTopic(coldBrain);
            Assert(next != null && next.ReasonCodes.Contains("cold_start_family_priority"),
                "la rotación fría debe exponer la prioridad de familia");
            coldFamilies.Add(next.Family);
            coldCompanion.State.InitiativeHistory.Add("social-topic:" + next.ContentId);
        }
        Assert(string.Join(",", coldFamilies) == "everyday,culture,games,reflective,technical",
            "los arranques en frío deben recorrer familias distintas antes de repetir");

        NpcAction a = Talk(brain, companion, "Me gusta World of Warcraft");
        Assert(a != null && a.Utterance.IndexOf("World of Warcraft", StringComparison.OrdinalIgnoreCase) >= 0,
            "una preferencia explícita debe producir una respuesta social relevante");
        Assert(companion.State.SocialMemories.Any(x => x.Kind == "like" && x.Value.IndexOf("World of Warcraft", StringComparison.OrdinalIgnoreCase) >= 0),
            "la preferencia debe entrar en memoria social");

        companion.Advance(20f);
        BrainTurn socialIdle = brain.Tick(20f);
        socialIdle.Action = companion.AdaptIdleAction(brain, socialIdle.Action);
        CompanionIntervention firstSocialTopic = companion.State.LastIntervention;
        Assert(firstSocialTopic != null && firstSocialTopic.ContentId == "wow_pvp",
            "un gusto por World of Warcraft debe elegir el tema propio wow_pvp");
        Assert(firstSocialTopic.Score <= 0.72f && firstSocialTopic.ReasonCodes.Contains("matches_user_like"),
            "la selección debe quedar acotada y explicar su afinidad con el gusto del usuario");
        CompanionTopic promoted = companion.State.Topics.FirstOrDefault(x => x.Status == "active");
        Assert(promoted != null && promoted.OriginId == "wow_pvp" && promoted.Source == "character-social-topic",
            "el tema propio elegido debe promocionarse como tema activo con procedencia explícita");
        CompanionIntervention rotated = companion.SelectSocialTopic(brain);
        Assert(rotated != null && rotated.ContentId != "wow_pvp",
            "el historial de iniciativas debe impedir repetir inmediatamente wow_pvp");

        var dislikeBrain = new NpcBrain(7);
        var dislikeCompanion = new CompanionEngine();
        dislikeCompanion.ConfigureSocialTopics(socialTopics.topics.Where(x => x.id == "local_ai"));
        Talk(dislikeBrain, dislikeCompanion, "No me gusta la IA");
        Assert(dislikeCompanion.SelectSocialTopic(dislikeBrain) == null,
            "los tokens técnicos cortos deben permitir que un dislike de IA excluya local_ai");

        a = Talk(brain, companion, "Estoy creando un juego de tres carriles");
        Assert(companion.State.SocialMemories.Any(x => x.Kind == "project" && x.Value.IndexOf("tres carriles", StringComparison.OrdinalIgnoreCase) >= 0),
            "el proyecto debe entrar en memoria social");
        Assert(companion.State.Pending.Any(x => x.Kind == "project" && x.Status == "open"),
            "el proyecto debe quedar como hilo pendiente");
        Assert(companion.State.Topics.Any(x => x.Label.IndexOf("tres carriles", StringComparison.OrdinalIgnoreCase) >= 0),
            "el proyecto debe convertirse también en tema retomable");

        a = Talk(brain, companion, "Que recuerdas de mi");
        Assert(a.Utterance.IndexOf("World of Warcraft", StringComparison.OrdinalIgnoreCase) >= 0 ||
               a.Utterance.IndexOf("tres carriles", StringComparison.OrdinalIgnoreCase) >= 0,
            "la respuesta de memoria social debe usar recuerdos reales");

        a = Talk(brain, companion, "Que hacemos");
        Assert(a.Utterance.IndexOf("tres carriles", StringComparison.OrdinalIgnoreCase) >= 0 ||
               a.Utterance.IndexOf("retomar", StringComparison.OrdinalIgnoreCase) >= 0,
            "actividad compartida debe reutilizar un hilo previo");

        a = Talk(brain, companion, "Que te gusta");
        Assert(a.Utterance.IndexOf("investigar", StringComparison.OrdinalIgnoreCase) >= 0 &&
               a.Utterance.IndexOf("problemas", StringComparison.OrdinalIgnoreCase) >= 0,
            "NIA debe tener preferencias simuladas de personaje coherentes");

        a = Talk(brain, companion, "Habla conmigo");
        Assert(a.Utterance.IndexOf("podemos", StringComparison.OrdinalIgnoreCase) >= 0 ||
               a.Utterance.IndexOf("hablar", StringComparison.OrdinalIgnoreCase) >= 0,
            "petición de compañía debe recibir una respuesta social");
        Assert(a.Utterance.IndexOf("no me dejes", StringComparison.OrdinalIgnoreCase) < 0,
            "la compañía no debe usar dependencia manipulativa");

        for (int i = 0; i < 16; i++)
            Talk(brain, companion, i % 2 == 0 ? "Gracias" : "Vale");
        Assert(companion.State.Relationship.Stage != "nuevo",
            "la relación debe evolucionar con interacciones repetidas");

        int beforeSensitive = companion.State.SocialMemories.Count;
        Talk(brain, companion, "Mi religión es privada");
        Assert(companion.State.SocialMemories.Count == beforeSensitive,
            "datos sensibles no deben entrar en memoria social selectiva");

        companion.Advance(20f);
        BrainTurn idle = brain.Tick(20f);
        idle.Action = companion.AdaptIdleAction(brain, idle.Action);
        string idleText = idle.Action == null ? string.Empty : idle.Action.Utterance ?? string.Empty;
        Assert(idle.Action != null && idle.Action.Reason.IndexOf("pendiente", StringComparison.OrdinalIgnoreCase) >= 0,
            "un proyecto pendiente debe conservar prioridad sobre los temas propios");
        Assert(idleText.IndexOf("sigues ahi", StringComparison.OrdinalIgnoreCase) < 0 &&
               idleText.IndexOf("esperar orden", StringComparison.OrdinalIgnoreCase) < 0,
            "la iniciativa social no debe usar los monólogos robóticos antiguos");

        brain.Drives.Threat = 0.80f;
        var alert = new NpcAction { Kind = ActionKind.Speak, Utterance = "alerta real", Reason = "riesgo", Utility = 0.95f };
        NpcAction guarded = companion.AdaptIdleAction(brain, alert);
        Assert(object.ReferenceEquals(guarded, alert) && companion.State.LastIntervention == null,
            "una amenaza alta debe conservar la acción de riesgo y suprimir el tema propio");

        Console.WriteLine("C# companion smoke: ok");
        return 0;
    }
}
