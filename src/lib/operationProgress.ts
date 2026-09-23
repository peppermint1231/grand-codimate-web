export type ProgressUpdate = {
  title: string;
  detail?: string;
  percent?: number;
  metric?: string;
};
export type OperationProgress = ProgressUpdate & {
  id: number;
  startedAt: number;
};
let snapshot: OperationProgress | null = null;
let sequence = 0;
let active: ProgressHandle | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
export const progressSnapshot = () => snapshot;
export const watchProgress = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export interface ProgressHandle {
  update: (value: ProgressUpdate) => void;
  end: () => void;
}
export const currentProgress = () => active;
export function beginProgress(title: string): ProgressHandle {
  const id = ++sequence;
  snapshot = { id, title, startedAt: Date.now() };
  const handle: ProgressHandle = {
    update(value) {
      if (snapshot?.id !== id) return;
      snapshot = {
        ...value,
        id,
        startedAt: snapshot.startedAt,
        percent: Number.isFinite(value.percent)
          ? Math.max(0, Math.min(100, value.percent!))
          : undefined,
      };
      emit();
    },
    end() {
      if (snapshot?.id === id) {
        snapshot = null;
        active = undefined;
        emit();
      }
    },
  };
  active = handle;
  emit();
  return handle;
}
export async function withProgress<T>(
  title: string,
  run: () => Promise<T>,
): Promise<T> {
  if (active) return run();
  const operation = beginProgress(title);
  try {
    return await run();
  } finally {
    operation.end();
  }
}
export type TransferProgress = {
  loaded: number;
  total?: number;
  waiting: boolean;
};
export function transferPercent(p: TransferProgress) {
  return p.total && p.total > 0
    ? Math.floor(Math.min(1, p.loaded / p.total) * 100)
    : undefined;
}
export function reportTransfer(
  operation: ProgressHandle | undefined,
  p: TransferProgress,
  label = "자료",
) {
  operation?.update({
    title: p.waiting ? "서버에 저장 중입니다" : "업로드 진행 중입니다",
    detail: p.waiting
      ? "전송을 마쳤습니다. 서버 저장이 확인될 때까지 기다려주세요."
      : `${label}를 전송하고 있습니다.`,
    percent: transferPercent(p),
    metric: "전송 진행률",
  });
}
