using System;
using System.Threading;
using NpcInt.Core;
using UnityEngine;
using UnityEngine.Events;

public sealed class NpcNeuralDialogueBehaviour : MonoBehaviour
{
    [Serializable]
    public sealed class StringEvent : UnityEvent<string> { }

    [SerializeField] private NpcBrainBehaviour brainBehaviour;
    [SerializeField] private NanochatBridgeClient neuralClient;
    [SerializeField] private bool generateOnlyForLanguageActions = true;
    [SerializeField] private bool logNeuralSpeech = true;
    [SerializeField] private bool enforceCompanionOutputSafety = true;
    [SerializeField] private StringEvent onNeuralUtterance = new StringEvent();

    private CancellationTokenSource _cts;

    private void Awake()
    {
        if (brainBehaviour == null) brainBehaviour = GetComponent<NpcBrainBehaviour>();
        if (neuralClient == null) neuralClient = GetComponent<NanochatBridgeClient>();
        _cts = new CancellationTokenSource();
    }

    private void OnEnable()
    {
        if (brainBehaviour != null)
            brainBehaviour.TurnCompleted += OnTurnCompleted;
    }

    private void OnDisable()
    {
        if (brainBehaviour != null)
            brainBehaviour.TurnCompleted -= OnTurnCompleted;
    }

    private void OnDestroy()
    {
        if (_cts != null)
        {
            _cts.Cancel();
            _cts.Dispose();
            _cts = null;
        }
    }

    private async void OnTurnCompleted(BrainTurn turn, MentalCycleResult cycle)
    {
        if (brainBehaviour == null || neuralClient == null || cycle == null || cycle.Decision == null)
            return;

        if (generateOnlyForLanguageActions && !IsLanguageAction(cycle.Decision.Kind))
            return;

        string input = turn != null && turn.Stimulus != null ? turn.Stimulus.Text : string.Empty;
        NeuralRequest request = NeuralPromptBuilder.ForUtterance(
            brainBehaviour.Brain,
            cycle,
            input);

        try
        {
            NeuralResponse response = await neuralClient.GenerateAsync(request, _cts.Token);
            if (response == null || !response.ok || string.IsNullOrWhiteSpace(response.text))
            {
                if (response != null && !string.IsNullOrWhiteSpace(response.error))
                    Debug.LogWarning(name + " neural bridge: " + response.error);
                return;
            }

            string symbolicFallback = turn != null && turn.Action != null ? turn.Action.Utterance : null;
            string utterance = enforceCompanionOutputSafety
                ? CompanionOutputSafety.Sanitize(response.text, symbolicFallback)
                : response.text.Trim();

            if (logNeuralSpeech)
            {
                OutputSafetyResult safety = CompanionOutputSafety.Inspect(response.text);
                string suffix = safety.Safe ? string.Empty : " [filtered: " + string.Join(",", safety.Hits) + "]";
                Debug.Log(name + " [neural/" + response.backend + "]: " + utterance + suffix);
            }

            onNeuralUtterance.Invoke(utterance);
        }
        catch (OperationCanceledException)
        {
            // Object disabled/destroyed while a request was active.
        }
        catch (Exception ex)
        {
            Debug.LogException(ex, this);
        }
    }

    private static bool IsLanguageAction(MentalActionKind kind)
    {
        return kind == MentalActionKind.Speak ||
               kind == MentalActionKind.AskQuestion ||
               kind == MentalActionKind.SetBoundary;
    }
}
