import { GuideLearningAdmin } from "./GuideLearningAdmin";
import { GuidePractice } from "./GuidePractice";
import type { GuideLearning } from "../lib/guideProgress";
import { practiceRecipe } from "../core/guideTraining";
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
  type GuideLesson,
  type GuideTrack,
  type GuideTarget,
} from "../core/userGuide";
import { productTypeLabels } from "../core/productType";
import "./UserGuide.css";

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
  const { progress, loading, error } = learning;
  const [practice, setPractice] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
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
    void learning.change("select", id).catch(() => {});
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  };
  useEffect(() => {
    if (progress.selected && !loading) {
      const item = guideLessons.find((l) => l.id === progress.selected);
      if (item) {
        setSelected(item.id);
        setTrack(item.track);
      }
    }
  }, [loading]);
  const finish = () =>
    setQuizMessage(
      answer === lesson.quiz.correct
        ? "정답입니다. " + lesson.quiz.explanation
        : "한 번 더 생각해 보세요. " + lesson.quiz.explanation,
    );
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
          <small>
            학습 진도와 새 안내 확인은 계정에 저장되어 다른 기기에서도
            이어집니다.
          </small>
        </div>
      </header>
      {isAdministrator(user) && (
        <div className="guide-admin-entry">
          <button
            aria-expanded={showAccounts}
            onClick={() => setShowAccounts((v) => !v)}
          >
            직원 학습 현황 {showAccounts ? "닫기" : "열기"}
          </button>
          {showAccounts && <GuideLearningAdmin />}
        </div>
      )}
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
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">계정의 학습 진도를 불러오고 있습니다.</p>}
      {practice && (
        <GuidePractice
          key={lesson.id}
          lessonId={lesson.id}
          learning={learning}
          onClose={() => setPractice(false)}
        />
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
              <button
                onClick={() =>
                  void learning.change("ack", lesson.id).catch(() => {})
                }
              >
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
              업무 화면으로 이동
            </button>
          </div>
          {!mayOpen(lesson, user) && (
            <p className="small">
              안내는 읽을 수 있습니다. 실제 기능 실행에는 해당 계정 권한이
              필요합니다.
            </p>
          )}
          <div className="guide-practice-launch">
            <strong>실제 화면에서 가상 자료로 직접 연습해요</strong>
            <p>
              상황을 읽고 필요한 판단을 고른 뒤, 업무 목표를 직접 해결합니다.
              막힐 때만 힌트를 열어보세요. 조작 결과로 진도를 자동 기록하며,
              운영 환자나 금액은 바뀌지 않습니다. 작은 안내 수정은 기존
              수료·진도를 유지합니다. 새 필수 단계나 큰 개편만 추가 학습이
              필요하며, 새 안내 확인은 수료와 별도로 표시합니다. 성공창에서
              Enter·Space로 다음 목표로 이동하고, 넘어간 지시문은 미완료로
              남습니다.
            </p>
            <button
              className="primary"
              disabled={loading || !practiceRecipe(lesson.id)}
              onClick={() => setPractice(true)}
            >
              {status.completed
                ? "다시 연습하기"
                : status.steps.length || status.skipped.length
                  ? "연습 이어가기"
                  : "연습 시작"}
            </button>
            {status.steps.length > 0 && (
              <small>
                {" "}
                {status.steps.length} /{" "}
                {practiceRecipe(lesson.id)?.steps.length} 단계 완료
              </small>
            )}
          </div>
          {status.skipped.length > 0 && (
            <p className="guide-skipped-note">
              넘어간 미완료 {status.skipped.length}개 · 모두 성공해야
              수료됩니다.
            </p>
          )}
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
          <details className="guide-reference">
            <summary>설명·확인 결과·복습 문제 찾아보기</summary>
            <ol className="guide-steps">
              {lesson.steps.map((step, i) => (
                <li
                  key={step.id}
                  className={status.steps.includes(step.id) ? "checked" : ""}
                >
                  <span className="guide-step-number">
                    {status.steps.includes(step.id) ? (
                      <Check size={18} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.instruction}</p>
                    <div className="guide-expected">
                      <strong>이렇게 되면 다음으로</strong>
                      <span>{step.result}</span>
                    </div>
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
                disabled={answer === null}
                onClick={finish}
              >
                정답 확인
              </button>
              {quizMessage && <p role="status">{quizMessage}</p>}
              {status.completed && (
                <p className="guide-completed">
                  <Check size={18} /> 이 버전의 학습을 완료했습니다.
                </p>
              )}
            </section>
          </details>
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
