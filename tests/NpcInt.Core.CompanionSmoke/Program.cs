using System;
using System.Linq;
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

    public static int Main()
    {
        var brain = new NpcBrain(42);
        var companion = new CompanionEngine();

        NpcAction a = Talk(brain, companion, "Me gusta World of Warcraft");
        Assert(a != null && a.Utterance.IndexOf("World of Warcraft", StringComparison.OrdinalIgnoreCase) >= 0,
            "una preferencia explícita debe producir una respuesta social relevante");
        Assert(companion.State.SocialMemories.Any(x => x.Kind == "like" && x.Value.IndexOf("World of Warcraft", StringComparison.OrdinalIgnoreCase) >= 0),
            "la preferencia debe entrar en memoria social");

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
        Assert(idleText.IndexOf("sigues ahi", StringComparison.OrdinalIgnoreCase) < 0 &&
               idleText.IndexOf("esperar orden", StringComparison.OrdinalIgnoreCase) < 0,
            "la iniciativa social no debe usar los monólogos robóticos antiguos");

        Console.WriteLine("C# companion smoke: ok");
        return 0;
    }
}
