using System;
using NpcInt.Core;
using UnityEngine;

// Frontera estable entre NpcInt.Core y presentación/animación/TTS/networking.
// Los consumidores de Unity deberían preferir este envelope a leer directamente
// campos internos del cerebro. Contrato: contracts/npc-turn.v1.schema.json.
public sealed class NpcTurnContractBehaviour : MonoBehaviour
{
    [SerializeField] private NpcBrainBehaviour brainBehaviour;
    [SerializeField] private bool logContract = false;

    public NpcTurnEnvelope LastEnvelope { get; private set; }
    public event Action<NpcTurnEnvelope> EnvelopeReady;

    private void Awake()
    {
        if (brainBehaviour == null) brainBehaviour = GetComponent<NpcBrainBehaviour>();
    }

    private void OnEnable()
    {
        if (brainBehaviour != null) brainBehaviour.TurnCompleted += OnTurnCompleted;
    }

    private void OnDisable()
    {
        if (brainBehaviour != null) brainBehaviour.TurnCompleted -= OnTurnCompleted;
    }

    private void OnTurnCompleted(BrainTurn turn, MentalCycleResult cycle)
    {
        LastEnvelope = NpcTurnContractBuilder.Build(
            turn,
            cycle,
            brainBehaviour != null ? brainBehaviour.LastIdea : null,
            brainBehaviour != null ? brainBehaviour.Companion : null);

        if (logContract)
            Debug.Log(name + " contract " + LastEnvelope.contractVersion + " turn=" + LastEnvelope.turnId +
                      " decision=" + LastEnvelope.decision.kind + " action=" + LastEnvelope.action.kind);

        Action<NpcTurnEnvelope> handler = EnvelopeReady;
        if (handler != null) handler(LastEnvelope);
    }
}
