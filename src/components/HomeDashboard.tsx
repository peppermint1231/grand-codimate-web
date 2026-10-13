import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  HeartHandshake,
  Settings,
  Users,
  BarChart3,
  UserRoundPlus,
} from "lucide-react";
import type { State, User } from "../core/model";
import { allowed } from "../core/model";
import { ledgerAvailable } from "../core/domain";
import "./HomeDashboard.css";
export const workspaceMenus = [
  {
    key: "quick",
    label: "바로상담",
    detail: "환자정보는 나중에, 상담부터 시작",
    icon: UserRoundPlus,
  },
  {
    key: "patients",
    label: "환자목록",
    detail: "환자 찾기 · 등록 · 수납",
    icon: Users,
  },
  {
    key: "consultations",
    label: "상담이력",
    detail: "상담 이어가기 · 결과 확인",
    icon: ClipboardList,
  },
  {
    key: "discovery",
    label: "맞춤 시술 찾기",
    detail: "상담 요청 · 캘린더 · 추천기",
    icon: HeartHandshake,
  },
  {
    key: "catalog",
    label: "단가표 관리",
    detail: "상품 · 패키지 · 판매 설정",
    icon: FileSpreadsheet,
  },
  {
    key: "stats",
    label: "통계",
    detail: "상담 성과 · 환자 분석",
    icon: BarChart3,
  },
  {
    key: "settings",
    label: "설정",
    detail: "계정 · 병원 운영 설정",
    icon: Settings,
  },
  {
    key: "guide",
    label: "사용법",
    detail: "가상 환자로 직접 연습하기",
    icon: BookOpen,
  },
];
export type HistoryFilter = "all" | "pending" | "held" | "today" | "unpaid";
export function HomeDashboard({
  state,
  user,
  navigate,
  history,
  opinions,
  unread,
}: {
  state: State;
  user: User;
  navigate: (key: string) => void;
  history: (filter: HistoryFilter) => void;
  opinions: () => void;
  unread: number;
}) {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
  const active = state.consultations.filter((c) => !c.cancelled);
  const pendingIds = new Set(
    state.patients
      .filter((p) => p.registrationPending && !p.mergedInto)
      .map((p) => p.id),
  );
  const scheduled = active.filter((c) => c.appointment?.slice(0, 10) === today);
  const waiting = state.opinions.filter(
    (o) => !o.answer && (o.fromId === user.id || o.toId === user.id),
  );
  const cards = [
    {
      title: "오늘 예약된 상담",
      count: scheduled.length,
      hint: "상담에 저장된 예약일 기준",
      click: () => history("today"),
    },
    {
      title: "보류 중인 상담",
      count: active.filter((c) => c.status === "H").length,
      hint: "이어서 진행할 상담",
      click: () => history("held"),
    },
    {
      title: "환자정보 등록 대기",
      count: pendingIds.size,
      hint: "바로상담환자 정보 입력",
      click: () => navigate("quick"),
    },
    ...(allowed(user, "money.read")
      ? [
          {
            title: "미수납 상담",
            count: active.filter(
              (c) =>
                c.status === "P" && ledgerAvailable(state, c.id, "receipt") > 0,
            ).length,
            hint: "성공 상담 중 잔액 확인",
            click: () => history("unpaid"),
          },
        ]
      : []),
    {
      title: "내 의견 요청·답변",
      count: waiting.length,
      hint: `답변 대기 · 새 답변 ${unread}건`,
      click: opinions,
    },
  ];
  return (
    <div className="clinic-home">
      <div className="home-heading">
        <div>
          <span className="home-eyebrow">GRAND CLINIC · WORKSPACE</span>
          <h1>{user.name}님, 오늘의 상담을 시작하세요.</h1>
          <p>필요한 업무로 바로 이동하세요.</p>
        </div>
        <CalendarDays aria-hidden="true" />
      </div>
      <div className="home-primary">
        {workspaceMenus
          .slice(0, 2)
          .map(({ key, label, detail, icon: Icon }) => (
            <button
              key={key}
              className={"home-shortcut " + key}
              onClick={() => navigate(key)}
            >
              <Icon size={32} />
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
              <ArrowRight />
            </button>
          ))}
      </div>
      <h2>먼저 확인할 업무</h2>
      <div className="home-metrics">
        {cards.map((c) => (
          <button key={c.title} onClick={c.click}>
            <span>{c.title}</span>
            <strong>
              {c.count}
              <small>건</small>
            </strong>
            <small>{c.hint}</small>
          </button>
        ))}
      </div>
      <p className="home-scope">
        현재 접근 가능한 상담 기준입니다. 추천기 상담 요청 일정은 ‘맞춤 시술
        찾기’의 캘린더에서 확인하세요.
      </p>
      <h2>업무 메뉴</h2>
      <div className="home-menu-grid">
        {workspaceMenus
          .slice(2)
          .filter((m) => m.key !== "stats" || allowed(user, "stats.read"))
          .map(({ key, label, detail, icon: Icon }) => (
            <button key={key} onClick={() => navigate(key)}>
              <Icon />
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
              <ArrowRight size={18} />
            </button>
          ))}
      </div>
    </div>
  );
}
