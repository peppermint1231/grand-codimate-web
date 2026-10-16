import { useState } from "react";
import type { User } from "../core/model";
import { api } from "../lib/api";
export function FirstPasswordChange({
  user,
  complete,
  logout,
  embedded = false,
}: {
  embedded?: boolean;
  user: User;
  complete: (result: { token: string; user: User }) => Promise<void>;
  logout: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className={embedded ? "password-change" : "login-page"}>
      <section className={embedded ? "" : "login-card"}>
        <h1>
          {user.mustChangePassword ? "내 비밀번호 설정" : "비밀번호 변경"}
        </h1>
        <p>
          {user.mustChangePassword
            ? `${user.name}님, 처음 로그인하거나 비밀번호가 초기화된 계정입니다. 본인만 아는 비밀번호로 변경한 뒤 시작하세요.`
            : "현재 비밀번호를 확인한 뒤, 본인만 아는 12자 이상의 새 비밀번호로 변경하세요."}
        </p>
        <p className="small">
          아이디: <b>{user.username}</b>
          {user.mustChangePassword && " · 초기 비밀번호는 아이디와 같습니다."}
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const data = new FormData(event.currentTarget),
              password = String(data.get("password"));
            setError("");
            if (password !== data.get("confirmation")) {
              setError("새 비밀번호가 서로 다릅니다.");
              return;
            }
            if (password === user.username) {
              setError("아이디와 다른 비밀번호를 입력하세요.");
              return;
            }
            setBusy(true);
            try {
              await complete(
                await api("/password", {
                  method: "POST",
                  body: JSON.stringify({
                    currentPassword: data.get("currentPassword"),
                    password,
                  }),
                }),
              );
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "비밀번호를 변경하지 못했습니다.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            현재 비밀번호
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <label className="field">
            새 비밀번호 (12자 이상)
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <label className="field">
            새 비밀번호 확인
            <input
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "변경 중…"
              : user.mustChangePassword
                ? "비밀번호 변경하고 시작"
                : "비밀번호 변경"}
          </button>
          <button type="button" disabled={busy} onClick={logout}>
            {embedded ? "취소" : "로그아웃"}
          </button>
        </form>
      </section>
    </div>
  );
}
