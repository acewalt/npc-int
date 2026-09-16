using System;
using NpcInt.Core;
using UnityEngine;

// Ejemplo de puente. Copia NpcInt.Core dentro de Assets/NpcInt/Core y este archivo a Assets/NpcInt/Unity.
public sealed class NpcBrainBehaviour : MonoBehaviour
{
    [Header("Simulation")]
    [SerializeField] private float secondsPerBrainTick = 5f;
    [SerializeField] private float simulatedMinutesPerTick = 1f;

    [Header("Debug")]
    [SerializeField] private bool logSymbolicSpeech = true;

    private NpcBrain _brain;
    private MentalCycleEngine _mind;
    private float _timer;

    public NpcBrain Brain { get { return _brain; } }
    public MentalCycleEngine Mind { get { return _mind; } }
    public MentalCycleResult LastMentalCycle { get { return _mind != null ? _mind.LastCycle : null; } }

    // Permite conectar una capa neuronal sin acoplarla al cerebro simbólico.
    public event Action<BrainTurn, MentalCycleResult> TurnCompleted;

    private void Awake()
    {
        _brain = new NpcBrain(GetInstanceID());
        _mind = new MentalCycleEngine(_brain);
        Debug.Log("NPC brain initialized: " + _brain.DescribeState());
    }

    private void Update()
    {
        _timer += Time.deltaTime;
        if (_timer < secondsPerBrainTick) return;
        _timer = 0f;

        BrainTurn turn = _brain.Tick(simulatedMinutesPerTick);
        MentalCycleResult cycle = _mind.ThinkTime(simulatedMinutesPerTick);
        CompleteTurn(turn, cycle);
    }

    public void HearPlayer(string text)
    {
        BrainTurn turn = _brain.ProcessMessage(text, "Jugador");
        MentalCycleResult cycle = _mind.ThinkMessage(text);
        CompleteTurn(turn, cycle);
    }

    public void PerceiveWorldEvent(string description, float importance = 0.6f, float threat = 0f)
    {
        BrainTurn turn = _brain.ProcessWorldEvent(description, importance, threat);
        MentalCycleResult cycle = _mind.ThinkWorld(description, threat, importance);
        CompleteTurn(turn, cycle);
    }

    public void SetHunger(float value)
    {
        _mind.SetNeed("hunger", value);
    }

    public void SetEnergy(float value)
    {
        _mind.SetNeed("energy", value);
    }

    private void CompleteTurn(BrainTurn turn, MentalCycleResult cycle)
    {
        DispatchMental(cycle);
        Dispatch(turn);
        Action<BrainTurn, MentalCycleResult> handler = TurnCompleted;
        if (handler != null) handler(turn, cycle);
    }

    private void Dispatch(BrainTurn turn)
    {
        if (turn == null || turn.Action == null) return;

        if (logSymbolicSpeech &&
            (turn.Action.Kind == ActionKind.Speak || turn.Action.Kind == ActionKind.AskQuestion) &&
            !string.IsNullOrWhiteSpace(turn.Action.Utterance))
        {
            Debug.Log(name + " [symbolic]: " + turn.Action.Utterance);
        }

        if (turn.Action.Kind == ActionKind.Investigate)
            Debug.Log(name + " decidió investigar. Motivo: " + turn.Action.Reason);
    }

    private void DispatchMental(MentalCycleResult cycle)
    {
        if (cycle == null || cycle.Decision == null) return;

        MentalActionOption d = cycle.Decision;
        Debug.Log(name + " mental decision: " + d.Label + " utility=" + d.Utility.ToString("0.00") + " risk=" + d.Risk.ToString("0.00"));

        // Estos casos son puntos de integración, no implementaciones físicas todavía.
        // Aquí puedes conectar NavMeshAgent, Animator, combate, inventario, TTS, etc.
        switch (d.Kind)
        {
            case MentalActionKind.MoveAway:
                // navigator.MoveAwayFrom(perceivedThreat);
                break;
            case MentalActionKind.Investigate:
            case MentalActionKind.Explore:
                // navigator.GoTo(targetOfInterest);
                break;
            case MentalActionKind.Attack:
                // combat.TryAttack(target);  // solo si el sistema de juego valida el objetivo
                break;
            case MentalActionKind.Defend:
                // combat.Defend();
                break;
            case MentalActionKind.Eat:
            case MentalActionKind.SeekFood:
                // needs/Inventory integration.
                break;
            case MentalActionKind.Rest:
                // animation/needs integration.
                break;
        }
    }
}
