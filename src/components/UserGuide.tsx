import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import { version } from "../../package.json";
import {
  allowed,
  canUseExecutiveFeatures,
  isAdministrator,
  type User,
  type State,
} from "../core/model";
import {
  guideLessons,
  guideUpdates,
  guideStatus,
  filterGuide,
  readGuideProgress,
  type GuideProgress,
  type GuideLesson,
  type GuideTrack,
  type GuideTarget,
} from "../core/userGuide";
import { productTypeLabels } from "../core/productType";
import "./UserGuide.css";

export function useGuideProgress(userId: string) {
  const key = "codimate-guide:" + userId;
  const [progress, setProgress] = useState<GuideProgress>(() =>
    readGuideProgress(localStorage, key),
  );
  const [storageError, setStorageError] = useState(false);
  const owner = useRef(key);
  useEffect(() => {
    if (owner.current !== key) {
      owner.current = key;
      setProgress(readGuideProgress(localStorage, key));
      setStorageError(false);
    }
  }, [key]);
  const update = (next: GuideProgress) => {
    setProgress(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === key) setProgress(readGuideProgress(localStorage, key));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  return { progress: updateOwner(), update, storageError };
  function updateOwner() {
    return owner.current === key
      ? progress
      : readGuideProgress(localStorage, key);
  }
}
export type GuideLearning = ReturnType<typeof useGuideProgress>;
function mayOpen(lesson: GuideLesson, user: User) {
  if (lesson.requires === "admin") return isAdministrator(user);
  if (lesson.requires === "executive") return canUseExecutiveFeatures(user);
  if (lesson.requires)
    return allowed(user, lesson.requires as Parameters<typeof allowed>[1]);
  return lesson.target !== "settings" || canUseExecutiveFeatures(user);
}
export function UserGuide({
  user,
  state,
  learning,
  onOpen,
}: {
  user: User;
  state: State;
  learning: GuideLearning;
  onOpen: (target: GuideTarget, title: string) => void;
}) {
  const { progress, update, storageError } = learning;
  const initial =
    guideLessons.find((l) => l.id === progress.selected) || guideLessons[0];
  const [track, setTrack] = useState<GuideTrack>(initial.track),
    [selected, setSelected] = useState(initial.id),
    [query, setQuery] = useState(""),
    [changedOnly, setChangedOnly] = useState(false),
    [tocOpen, setTocOpen] = useState(false),
    [answer, setAnswer] = useState<number | null>(null),
    [quizMessage, setQuizMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const contents = useRef<HTMLElement>(null);
  const lesson = guideLessons.find((l) => l.id === selected) || guideLessons[0];
  const status = guideStatus(lesson, progress);
  const entries = filterGuide(track, query, changedOnly, progress);
  const all = guideLessons.filter((l) => l.track === track);
  const count = all.filter((l) => guideStatus(l, progress).completed).length;
  const unread = guideLessons.filter(
    (l) => guideStatus(l, progress).unread,
  ).length;
  const index = all.findIndex((l) => l.id === lesson.id);
  const choose = (id: string) => {
    const item = guideLessons.find((l) => l.id === id)!;
    setSelected(id);
    setTrack(item.track);
    setAnswer(null);
    setQuizMessage("");
    setTocOpen(false);
    update({ ...progress, selected: id });
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  };
  const save = (patch: Partial<GuideProgress["lessons"][string]>) =>
    update({
      ...progress,
      selected: lesson.id,
      lessons: {
        ...progress.lessons,
        [lesson.id]: { ...progress.lessons[lesson.id], ...patch },
      },
    });
  const mark = (step: string, checked: boolean) =>
    save({
      revision: status.revision,
      steps: checked
        ? [...new Set([...status.steps, step])]
        : status.steps.filter((id) => id !== step),
      completed: false,
    });
  const finish = () => {
    if (answer !== lesson.quiz.correct) {
      setQuizMessage("한 번 더 생각해 보세요. " + lesson.quiz.explanation);
      return;
    }
    save({
      revision: status.revision,
      steps: lesson.steps.map((s) => s.id),
      completed: true,
      acknowledged: status.revision,
    });
    setQuizMessage("학습을 완료했습니다. " + lesson.quiz.explanation);
  };
  return (
    <section className="user-guide" aria-label="코디메이트 사용법">
      <header className="guide-hero">
        <div>
          <span className="guide-eyebrow">
            <BookOpen size={15} /> CODIMATE GUIDE
          </span>
          <h1>
            하나씩 따라 하면,
            <br />
            오늘의 상담이 익숙해집니다.
          </h1>
          <p>실무자는 상담의 흐름을, 관리자는 운영의 기준을 익혀보세요.</p>
        </div>
        <div className="guide-release">
          <span>현재 앱 v{version}</span>
          <strong>
            {unread ? `${unread}개 안내 확인하기` : "새 안내를 모두 확인했어요"}
          </strong>
          <small>학습 기록은 계정별로 이 기기에 저장됩니다.</small>
        </div>
      </header>
      <div className="guide-track-tabs" role="group" aria-label="사용법 과정">
        {(
          [
            ["staff", "실무자 사용법", "환자 맞이부터 상담·수납까지"],
            ["admin", "관리자 사용법", "단가표부터 통계·운영 설정까지"],
          ] as const
        ).map(([key, title, sub]) => (
          <button
            key={key}
            aria-pressed={track === key}
            onClick={() => {
              setQuery("");
              setChangedOnly(false);
              choose(guideLessons.find((l) => l.track === key)!.id);
            }}
          >
            <strong>{title}</strong>
            <span>{sub}</span>
          </button>
        ))}
      </div>
      <div className="guide-tools">
        <label className="guide-search">
          <Search size={18} />
          <input
            type="search"
            aria-label="사용법 검색"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setTocOpen(true);
            }}
            placeholder="예: 할인, 동의서, 포인트, 홈페이지 갱신"
          />
        </label>
        <button
          aria-pressed={changedOnly}
          onClick={() => {
            setChangedOnly((v) => !v);
            setTocOpen(true);
          }}
        >
          <Sparkles size={16} />
          변경된 안내만 보기
        </button>
        <button
          className="guide-toc-toggle"
          aria-expanded={tocOpen}
          onClick={() => setTocOpen((v) => !v)}
        >
          목차 {tocOpen ? "닫기" : "열기"}
        </button>
      </div>
      <div className="guide-progress">
        <progress
          value={count}
          max={all.length}
          aria-label={`${track === "staff" ? "실무자" : "관리자"} 학습 진도`}
        />
        <span>
          {count} / {all.length} 과정 완료
        </span>
      </div>
      {storageError && (
        <p role="status">
          이 기기에 학습 진도를 저장하지 못했습니다. 사용법은 계속 볼 수
          있습니다.
        </p>
      )}
      <div className="guide-layout">
        <nav
          className={"guide-toc" + (tocOpen ? " is-open" : "")}
          aria-label="사용법 목차"
          ref={contents}
        >
          <h2>원하는 부분부터 찾아보기</h2>
          {entries.length === 0 ? (
            <p className="guide-empty">
              {query
                ? "검색 결과가 없습니다. 다른 단어로 찾아보세요."
                : "이 과정의 변경 안내를 모두 확인했습니다."}
            </p>
          ) : (
            entries.map((item) => {
              const s = guideStatus(item, progress);
              return (
                <button
                  key={item.id}
                  aria-current={item.id === lesson.id ? "step" : undefined}
                  onClick={() => choose(item.id)}
                >
                  <span>{item.title}</span>
                  <span className="guide-toc-state">
                    {s.unread && (
                      <em
                        className={
                          "guide-change " +
                          (s.change === "수정됨" ? "revised" : "")
                        }
                      >
                        {s.change}
                      </em>
                    )}
                    {s.completed && <Check size={16} aria-label="학습 완료" />}
                  </span>
                </button>
              );
            })
          )}
        </nav>
        <article className="guide-lesson" aria-label={lesson.title}>
          <div className="guide-lesson-top">
            <button
              className="guide-index-link"
              onClick={() => {
                setTocOpen(true);
                requestAnimationFrame(() => {
                  contents.current?.scrollIntoView({ block: "start" });
                });
              }}
            >
              목차
            </button>
            <span>
              {track === "staff" ? "실무자 과정" : "관리자 과정"} · {index + 1}{" "}
              / {all.length}
            </span>
            {status.unread && (
              <span
                className={
                  "guide-change " +
                  (status.change === "수정됨" ? "revised" : "")
                }
              >
                {status.change}
              </span>
            )}
          </div>
          <h2 ref={heading} tabIndex={-1}>
            {lesson.title.replace(/^\d+\. /, "")}
          </h2>
          <p className="guide-summary">{lesson.summary}</p>
          <div className="guide-change-note">
            <Sparkles size={18} />
            <div>
              <strong>
                v{guideUpdates[lesson.id]?.updatedIn || version} 안내
              </strong>
              <p>{lesson.changeNote}</p>
            </div>
            {status.unread && (
              <button onClick={() => save({ acknowledged: status.revision })}>
                이번 안내 확인
              </button>
            )}
          </div>
          <div className="guide-location">
            <div>
              <small>여기에서 시작해요</small>
              <strong>{lesson.where}</strong>
            </div>
            <button
              disabled={!mayOpen(lesson, user)}
              onClick={() => onOpen(lesson.target, lesson.title)}
            >
              <ArrowUpRight size={17} />
              실제 화면 열기
            </button>
          </div>
          {!mayOpen(lesson, user) && (
            <p className="small">
              안내는 읽을 수 있습니다. 실제 기능 실행에는 해당 계정 권한이
              필요합니다.
            </p>
          )}
          <p className="guide-practice-note">
            아래 체크와 복습 문제는 학습용입니다. 실제 환자·금액·설정을 바꾸지
            않습니다.
          </p>
          {lesson.id === "product" && (
            <div className="guide-live-facts">
              <strong>현재 상품 타입</strong>
              <p>{Object.values(productTypeLabels).join(" · ")}</p>
            </div>
          )}
          {lesson.id === "grades-admin" && (
            <div className="guide-live-facts">
              <strong>현재 등록된 등급</strong>
              <p>
                {state.policies[0]?.grades.map((g) => g.name).join(" · ") ||
                  "등급 설정에서 확인해주세요."}
              </p>
              <small>
                지급량과 기간은 현재 설정 화면의 값을 기준으로 확인하세요.
              </small>
            </div>
          )}
          <ol className="guide-steps">
            {lesson.steps.map((step, i) => (
              <li
                key={step.id}
                className={status.steps.includes(step.id) ? "checked" : ""}
              >
                <span className="guide-step-number">
                  {status.steps.includes(step.id) ? <Check size={18} /> : i + 1}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.instruction}</p>
                  <div className="guide-expected">
                    <strong>이렇게 되면 다음으로</strong>
                    <span>{step.result}</span>
                  </div>
                  <label className="guide-step-check">
                    <input
                      type="checkbox"
                      checked={status.steps.includes(step.id)}
                      onChange={(e) => mark(step.id, e.target.checked)}
                    />
                    이 단계를 확인했어요
                  </label>
                </div>
              </li>
            ))}
          </ol>
          <section className="guide-quiz" aria-label="복습 문제">
            <span className="guide-eyebrow">잠깐, 내 것으로 만들기</span>
            <h3>{lesson.quiz.question}</h3>
            <div role="group" aria-label="복습 답변">
              {lesson.quiz.answers.map((text, i) => (
                <button
                  key={text}
                  aria-pressed={answer === i}
                  onClick={() => {
                    setAnswer(i);
                    setQuizMessage("");
                  }}
                >
                  <span>{i + 1}</span>
                  {text}
                </button>
              ))}
            </div>
            <button
              className="primary"
              disabled={
                answer === null || status.steps.length < lesson.steps.length
              }
              onClick={finish}
            >
              {status.completed ? "다시 확인하기" : "확인하고 학습 완료"}
            </button>
            {status.steps.length < lesson.steps.length && (
              <p className="small">
                위 단계를 모두 확인한 뒤 완료할 수 있습니다.
              </p>
            )}
            {quizMessage && <p role="status">{quizMessage}</p>}
            {status.completed && (
              <p className="guide-completed">
                <Check size={18} /> 이 버전의 학습을 완료했습니다.
              </p>
            )}
          </section>
          <footer className="guide-next">
            <button
              disabled={index <= 0}
              onClick={() => choose(all[index - 1].id)}
            >
              <ChevronLeft size={16} />
              이전 과정
            </button>
            {index < all.length - 1 ? (
              <button
                className="primary"
                onClick={() => choose(all[index + 1].id)}
              >
                다음 과정
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                className="primary"
                onClick={() =>
                  choose(guideLessons.find((l) => l.track !== track)!.id)
                }
              >
                다른 과정 살펴보기
                <ChevronRight size={16} />
              </button>
            )}
          </footer>
        </article>
      </div>
    </section>
  );
}
