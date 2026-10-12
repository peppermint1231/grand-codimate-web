/** Never display an upstream HTML error page or mistake it for an expired session. */
export async function apiResponse<T>(response: Response): Promise<T> {
  let data: any;
  try {
    data = await response.json();
    if (!data || typeof data !== "object") throw new Error("Invalid response");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw Object.assign(
      new Error(
        response.status === 429
          ? "서버 이용량이 많아 잠시 연결을 제한하고 있습니다. 잠시 후 다시 연결해주세요."
          : `서버 연결이 일시적으로 중단되었습니다. 잠시 후 다시 연결해주세요.${response.status >= 400 ? ` (HTTP ${response.status})` : ""}`,
      ),
      {
        // A non-JSON 401 can come from an intermediary, not our login service.
        status:
          response.status >= 500 || response.status === 429
            ? response.status
            : 503,
        code: "INVALID_SERVER_RESPONSE",
      },
    );
  }
  if (!response.ok)
    throw Object.assign(new Error(data.error || "요청 실패"), {
      status: response.status,
      code: data.code,
    });
  return data as T;
}
