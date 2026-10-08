/** A provider quota is a temporary service failure, never an expired login. */
export function storageQuotaResponse(error: unknown, now = new Date()) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    !/Exceeded allowed rows (?:read|written) in Durable Objects free tier/i.test(
      message,
    )
  )
    return;
  const retryAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const reset = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(retryAt);
  return Response.json(
    {
      code: "STORAGE_DAILY_LIMIT",
      error: `서버의 일일 데이터 이용 한도에 도달해 조회·로그인을 잠시 사용할 수 없습니다. 저장된 자료는 유지됩니다. 무료 한도 초기화: ${reset}. 즉시 복구하려면 관리자가 서버 요금제를 변경해야 합니다.`,
      retryAt: retryAt.toISOString(),
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(
          Math.ceil((retryAt.getTime() - now.getTime()) / 1000),
        ),
      },
    },
  );
}
