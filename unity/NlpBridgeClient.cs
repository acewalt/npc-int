using System;
using System.Threading;
using System.Threading.Tasks;
using NpcInt.Core;
using UnityEngine;
using UnityEngine.Networking;

public sealed class NlpBridgeClient : MonoBehaviour, INlpAnalyzer
{
    [SerializeField] private string baseUrl = "http://127.0.0.1:8766";
    [SerializeField] private int timeoutSeconds = 30;

    public async Task<NlpAnalysis> AnalyzeAsync(string text, CancellationToken cancellationToken)
    {
        if (text == null) throw new ArgumentNullException(nameof(text));
        var request = new NlpAnalyzeRequest { text = text };
        string json = JsonUtility.ToJson(request);
        byte[] body = System.Text.Encoding.UTF8.GetBytes(json);
        string url = baseUrl.TrimEnd('/') + "/v1/analyze";

        using (var web = new UnityWebRequest(url, UnityWebRequest.kHttpVerbPOST))
        {
            web.uploadHandler = new UploadHandlerRaw(body);
            web.downloadHandler = new DownloadHandlerBuffer();
            web.SetRequestHeader("Content-Type", "application/json");
            web.timeout = timeoutSeconds;

            UnityWebRequestAsyncOperation op = web.SendWebRequest();
            while (!op.isDone)
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    web.Abort();
                    cancellationToken.ThrowIfCancellationRequested();
                }
                await Task.Yield();
            }

#if UNITY_2020_2_OR_NEWER
            bool failed = web.result != UnityWebRequest.Result.Success;
#else
            bool failed = web.isNetworkError || web.isHttpError;
#endif
            if (failed)
            {
                return new NlpAnalysis
                {
                    ok = false,
                    backend = "http",
                    error = web.error + " | " + (web.downloadHandler != null ? web.downloadHandler.text : string.Empty)
                };
            }

            NlpAnalysis response = JsonUtility.FromJson<NlpAnalysis>(web.downloadHandler.text);
            if (response == null)
            {
                return new NlpAnalysis { ok = false, backend = "http", error = "Respuesta NLP vacía o inválida." };
            }
            return response;
        }
    }
}
