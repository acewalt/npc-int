using System;
using System.Threading;
using System.Threading.Tasks;
using NpcInt.Core;
using UnityEngine;

// Puente principal entre NpcInt.Core y Unity.
// El orden deliberado es: lenguaje -> cerebro -> ciclo mental -> ideas -> companion -> salida.
public sealed class NpcBrainBehaviour : MonoBehaviour
{
    [Header("Simulation")]
    [SerializeField] private float secondsPerBrainTick = 5f;
    [SerializeField] private float simulatedMinutesPerTick = 1f;

    [Header("Language Understanding")]
    [SerializeField] private bool useNlpBridge = true;
    [SerializeField] private NlpBridgeClient nlpBridge;
    [SerializeField] private bool logNlpFailures = true;

    [Header("Idea Formation")]
    [SerializeField] private bool useIdeaFormation = true;
    [SerializeField] private bool logIdeas = true;

    [Header("Companion / Social")]
    [SerializeField] private bool useCompanionEngine = true;
    [SerializeField] private bool logCompanionState = false;

    [Header("Debug")]
    [SerializeField] private bool logSymbolicSpeech = true;

    private NpcBrain _brain;
    private MentalCycleEngine _mind;
    private IdeaFormationEngine _ideas;
    private CompanionEngine _companion;
    private float _timer;
    private readonly SemaphoreSlim _hearGate = new SemaphoreSlim(1, 1);

    public NpcBrain Brain { get { return _brain; } }
    public MentalCycleEngine Mind { get { return _mind; } }
    public IdeaFormationEngine Ideas { get { return _ideas; } }
    public CompanionEngine Companion { get { return _companion; } }
    public MentalCycleResult LastMentalCycle { get { return _mind != null ? _mind.LastCycle : null; } }
    public NpcIdea LastIdea { get; private set; }
    public NlpAnalysis LastNlpAnalysis { get; private set; }
    public DialogueAct LastDialogueAct { get; private set; }

    // Permite conectar la capa neuronal de generación sin acoplarla al cerebro simbólico.
    public event Action<BrainTurn, MentalCycleResult> TurnCompleted;
    // Permite inspeccionar/registrar el análisis lingüístico previo a la decisión.
    public event Action<NlpAnalysis, DialogueAct> LanguageAnalyzed;
    // Expone la síntesis causal a UI, debug, memoria externa o un planner físico.
    public event Action<NpcIdea> IdeaFormed;
    // Permite UI/debug reaccionar a cambios del modelo social.
    public event Action<CompanionState> CompanionStateChanged;

    private void Awake()
    {
        _brain = new NpcBrain(GetInstanceID());
        _mind = new MentalCycleEngine(_brain);
        _ideas = new IdeaFormationEngine();
        _companion = new CompanionEngine();
        if (nlpBridge == null) nlpBridge = GetComponent<NlpBridgeClient>();
        Debug.Log("NPC brain initialized: " + _brain.DescribeState());
    }

    private void Update()
    {
        _timer += Time.deltaTime;
        if (_timer < secondsPerBrainTick) return;
        _timer = 0f;

        if (useCompanionEngine) _companion.Advance(simulatedMinutesPerTick);

        BrainTurn turn = _brain.Tick(simulatedMinutesPerTick);
        MentalCycleResult cycle = _mind.ThinkTime(simulatedMinutesPerTick);

        // El cerebro base puede producir monólogos de inactividad. El CompanionEngine
        // decide si hay una razón social real para hablar o si el silencio aporta más.
        if (useCompanionEngine)
        {
            turn.Action = _companion.AdaptIdleAction(_brain, turn.Action);
            ObserveCompanionReply(turn);
        }

        CompleteTurn(turn, cycle);
    }

    // Mantiene una firma void compatible con Button, InputField y UnityEvent.
    public void HearPlayer(string text)
    {
        _ = HearPlayerAsync(text);
    }

    public async Task HearPlayerAsync(string text)
    {
        text = (text ?? string.Empty).Trim();
        if (text.Length == 0) return;

        await _hearGate.WaitAsync();
        try
        {
            DialogueAct act = null;
            NlpAnalysis analysis = null;

            if (useNlpBridge && nlpBridge != null)
            {
                try
                {
                    analysis = await nlpBridge.AnalyzeAsync(text, CancellationToken.None);
                    if (analysis != null && analysis.ok)
                    {
                        act = NlpDialogueInterpreter.Interpret(analysis);
                        LastNlpAnalysis = analysis;
                        LastDialogueAct = act;

                        Action<NlpAnalysis, DialogueAct> languageHandler = LanguageAnalyzed;
                        if (languageHandler != null) languageHandler(analysis, act);
                    }
                    else if (logNlpFailures && analysis != null && !string.IsNullOrWhiteSpace(analysis.error))
                    {
                        Debug.LogWarning(name + " NLP fallback: " + analysis.error);
                    }
                }
                catch (Exception ex)
                {
                    if (logNlpFailures) Debug.LogWarning(name + " NLP bridge unavailable; using symbolic fallback. " + ex.Message);
                }
            }

            if (useCompanionEngine) _companion.ObserveUserTurn(_brain, text);

            string ideaIntent = ClassifyIdeaIntent(text, act);

            BrainTurn turn = act != null
                ? _brain.ProcessMessageAnalyzed(text, act, "Jugador")
                : _brain.ProcessMessage(text, "Jugador");

            // El ciclo mental sigue siendo la autoridad para objetivos/acciones.
            MentalCycleResult cycle = _mind.ThinkMessage(text);

            if (useIdeaFormation && !string.IsNullOrEmpty(ideaIntent))
            {
                EnsureIdeaFromRecentWorld(cycle);
                if (LastIdea != null)
                {
                    turn.Action.Kind = ActionKind.Speak;
                    turn.Action.Utterance = _ideas.Verbalize(LastIdea, ideaIntent);
                    turn.Action.Reason = "respuesta construida desde hipótesis, crítica y síntesis causal";
                    turn.Action.Utility = 0.90f;
                }
            }

            // Último árbitro simbólico: conserva la decisión cognitiva, pero añade
            // continuidad de relación, memoria social y naturalidad conversacional.
            if (useCompanionEngine)
            {
                turn.Action = _companion.AdaptConversationAction(_brain, text, turn.Action, act);
                ObserveCompanionReply(turn);
            }

            CompleteTurn(turn, cycle);
        }
        finally
        {
            _hearGate.Release();
        }
    }

    public void PerceiveWorldEvent(string description, float importance = 0.6f, float threat = 0f)
    {
        BrainTurn turn = _brain.ProcessWorldEvent(description, importance, threat);
        MentalCycleResult cycle = _mind.ThinkWorld(description, threat, importance);
        if (useIdeaFormation) FormIdea(description, cycle);
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

    public string DescribeCompanionState()
    {
        return _companion != null ? _companion.DescribeState() : "companion no inicializado";
    }

    private void ObserveCompanionReply(BrainTurn turn)
    {
        if (_companion == null || turn == null || turn.Action == null) return;
        if ((turn.Action.Kind == ActionKind.Speak || turn.Action.Kind == ActionKind.AskQuestion) &&
            !string.IsNullOrWhiteSpace(turn.Action.Utterance))
        {
            _companion.ObserveNpcReply(turn.Action.Utterance);
        }

        if (logCompanionState)
            Debug.Log(name + " companion: " + _companion.DescribeState());

        Action<CompanionState> handler = CompanionStateChanged;
        if (handler != null) handler(_companion.State);
    }

    private void FormIdea(string focus, MentalCycleResult cycle)
    {
        if (_ideas == null || string.IsNullOrWhiteSpace(focus)) return;
        LastIdea = _ideas.FormIdea(focus, cycle);
        if (logIdeas && LastIdea != null)
        {
            Debug.Log(name + " idea: " + LastIdea.Claim + " | crítica: " + LastIdea.Critique + " | prueba: " + LastIdea.RecommendedTest);
        }
        Action<NpcIdea> handler = IdeaFormed;
        if (handler != null && LastIdea != null) handler(LastIdea);
    }

    private void EnsureIdeaFromRecentWorld(MentalCycleResult currentCycle)
    {
        if (LastIdea != null || _brain == null || _brain.Memory == null) return;
        MemoryEntry recent = null;
        for (int i = _brain.Memory.Items.Count - 1; i >= 0; i--)
        {
            MemoryEntry item = _brain.Memory.Items[i];
            if (item.Kind == "world") { recent = item; break; }
        }
        if (recent != null) FormIdea(recent.Text, currentCycle);
    }

    private static string ClassifyIdeaIntent(string text, DialogueAct act)
    {
        if (act != null && act.Intent == "ask_current_thought") return "ask_current_thought";
        string n = Fold(text);
        if (ContainsAny(n, "que posibilidades hay", "que posibilidades ves", "que explicaciones", "que hipotesis", "cuales son tus hipotesis", "que podria ser", "que pudo causar", "que podria haberlo causado"))
            return "ask_hypotheses";
        if (ContainsAny(n, "que opinas", "que crees que pasa", "que crees que paso", "que idea tienes", "que se te ocurre", "cual es tu teoria", "formula una idea"))
            return "ask_idea";
        if (ContainsAny(n, "que estas pensando", "que piensas", "en que piensas", "que tienes en mente"))
            return "ask_current_thought";
        return null;
    }

    private static string Fold(string value)
    {
        string s = (value ?? string.Empty).ToLowerInvariant();
        return s.Replace("á", "a").Replace("é", "e").Replace("í", "i").Replace("ó", "o").Replace("ú", "u").Replace("ü", "u");
    }

    private static bool ContainsAny(string source, params string[] values)
    {
        for (int i = 0; i < values.Length; i++)
            if (source.IndexOf(values[i], StringComparison.Ordinal) >= 0) return true;
        return false;
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

        // Puntos de integración física: NavMeshAgent, Animator, combate, inventario, TTS, etc.
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