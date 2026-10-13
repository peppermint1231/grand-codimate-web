/** This flag is fixed before the app loads; an uninitialised training API fails closed. */
export const trainingMode =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).get("training") === "1";
export type TrainingRoute = {
  page: string;
  patientId?: string;
  consultId?: string;
  tab?: string;
};
export interface TrainingRuntime {
  api(path: string, init?: RequestInit): Promise<any>;
  media(id: string): Blob;
  editor?(id: string): any;
  draft?(id: string): import("../core/model").Consultation | undefined;
}
let runtime: TrainingRuntime | undefined;
export const setTrainingRuntime = (value: TrainingRuntime) => {
  runtime = value;
};
export const trainingRuntime = () => {
  if (!runtime)
    throw new Error("연습 화면 준비 중입니다. 사용법에서 다시 시작해주세요.");
  return runtime;
};
