import type { TransferProgress } from "./operationProgress";
// Upload completion means the browser sent the bytes, not that OneDrive saved them.
export function uploadRequest<T>(
  url: string,
  init: RequestInit & { body: string | Blob },
  progress: (value: TransferProgress) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const size =
      typeof init.body === "string"
        ? new TextEncoder().encode(init.body).byteLength
        : init.body.size;
    const abort = () => xhr.abort();
    const finish = (error?: Error, result?: T) => {
      init.signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(result!);
    };
    xhr.upload.onprogress = (e) =>
      progress({
        loaded: e.loaded,
        total: e.lengthComputable ? e.total : undefined,
        waiting: false,
      });
    xhr.upload.onload = () =>
      progress({ loaded: size, total: size, waiting: true });
    xhr.onload = () => {
      let result: any;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        finish(
          Object.assign(
            new Error(
              "서버 응답을 확인하지 못했습니다. 저장 상태를 확인한 후 다시 시도해주세요.",
            ),
            { status: xhr.status >= 400 ? xhr.status : 503 },
          ),
        );
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300)
        finish(
          Object.assign(new Error(result.error || "요청 실패"), {
            status: xhr.status,
          }),
        );
      else finish(undefined, result);
    };
    xhr.onerror = () =>
      finish(new Error("서버 연결이 끊겼습니다. 연결 상태를 확인해주세요."));
    xhr.ontimeout = () =>
      finish(
        new Error(
          "서버 응답이 지연되고 있습니다. 저장 상태를 확인한 후 다시 시도해주세요.",
        ),
      );
    xhr.onabort = () =>
      finish(
        Object.assign(new Error("전송이 중단되었습니다."), {
          name: "AbortError",
        }),
      );
    xhr.open(init.method || "POST", url);
    xhr.withCredentials = true;
    xhr.timeout = 300000;
    new Headers(init.headers).forEach((value, key) =>
      xhr.setRequestHeader(key, value),
    );
    if (init.signal?.aborted) {
      finish(
        Object.assign(new Error("전송이 중단되었습니다."), {
          name: "AbortError",
        }),
      );
      return;
    }
    init.signal?.addEventListener("abort", abort, { once: true });
    progress({ loaded: 0, total: size, waiting: false });
    xhr.send(init.body);
  });
}
