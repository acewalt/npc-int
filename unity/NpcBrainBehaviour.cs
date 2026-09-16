using NpcInt.Core;
using UnityEngine;

// Ejemplo de puente. Copia NpcInt.Core dentro de Assets/NpcInt/Core y este archivo a Assets/NpcInt/Unity.
public sealed class NpcBrainBehaviour : MonoBehaviour
{
    [Header("Simulation")]
    [SerializeField] private float secondsPerBrainTick = 5f;
    [SerializeField] private float simulatedMinutesPerTick = 1f;

    private NpcBrain _brain;
    private float _timer;

    public NpcBrain Brain { get { return _brain; } }

    private void Awake()
    {
        _brain = new NpcBrain(GetInstanceID());
        Debug.Log("NPC brain initialized: " + _brain.DescribeState());
    }

    private void Update()
    {
        _timer += Time.deltaTime;
        if (_timer < secondsPerBrainTick) return;
        _timer = 0f;

        BrainTurn turn = _brain.Tick(simulatedMinutesPerTick);
        Dispatch(turn);
    }

    public void HearPlayer(string text)
    {
        BrainTurn turn = _brain.ProcessMessage(text, "Jugador");
        Dispatch(turn);
    }

    public void PerceiveWorldEvent(string description, float importance = 0.6f, float threat = 0f)
    {
        BrainTurn turn = _brain.ProcessWorldEvent(description, importance, threat);
        Dispatch(turn);
    }

    private void Dispatch(BrainTurn turn)
    {
        if (turn == null || turn.Action == null) return;

        // Sustituye esto por UI, audio/TTS, animación o un sistema de acciones.
        if ((turn.Action.Kind == ActionKind.Speak || turn.Action.Kind == ActionKind.AskQuestion) &&
            !string.IsNullOrWhiteSpace(turn.Action.Utterance))
        {
            Debug.Log(name + ": " + turn.Action.Utterance);
        }

        if (turn.Action.Kind == ActionKind.Investigate)
        {
            // Aquí se conectaría con navegación/GOAP/Utility AI del juego.
            Debug.Log(name + " decidió investigar. Motivo: " + turn.Action.Reason);
        }
    }
}
