using System;
using System.Threading;
using System.Threading.Tasks;
using NpcInt.Core;
using UnityEngine;
using UnityEngine.Networking;

public sealed class NanochatBridgeClient : MonoBehaviour, INeuralLanguageModel
{
    [SerializeField] private string baseUrl = "http://127.0.0.1:8765";
    [SerializeField] private int timeoutSeconds = 30;

    public async Task<NeuralResponse> GenerateAsync(
        NeuralRequest request,
        CancellationToken cancellationToken)
    {
        if (request == null) throw new ArgumentNullException(nameof(request));

        string url = baseUrl.TrimEnd('/') + "/v1/generate";
        string json = JsonUtility.ToJson(request);
        byte[] body = System.Text.Encoding.UTF8.GetBytes(json);

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
                return new NeuralResponse
                {
                    ok = false,
                    error = web.error + " | " + (web.downloadHandler != null ? web.downloadHandler.text : string.Empty),
                    backend = "http"
                };
            }

            NeuralResponse response = JsonUtility.FromJson<NeuralResponse>(web.downloadHandler.text);
            if (response == null)
            {
                return new NeuralResponse
                {
                    ok = false,
                    error = "Respuesta JSON vacía o inválida.",
                    backend = "http"
                };
            }
            return response;
        }
    }

    public async Task<NeuralResponse> HealthAsync(CancellationToken cancellationToken)
    {
        string url = baseUrl.TrimEnd('/') + "/health";
        using (var web = UnityWebRequest.Get(url))
        {
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
                return new NeuralResponse { ok = false, backend = "http", error = web.error };

            return new NeuralResponse
            {
                ok = true,
                backend = "bridge",
                text = web.downloadHandler.text
            };
        }
    }
}
