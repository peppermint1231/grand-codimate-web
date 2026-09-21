export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
export interface DriveEnv {
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  APP_ORIGIN: string;
}
const authority = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
export function loginUrl(env: DriveEnv, state: string) {
  return (
    authority +
    "/authorize?" +
    new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: env.APP_ORIGIN + "/api/onedrive/callback",
      scope: "openid offline_access Files.ReadWrite",
      state,
      prompt: "select_account",
    }).toString()
  );
}
export async function exchange(
  env: DriveEnv,
  values: Record<string, string>,
): Promise<OAuthTokens> {
  const r = await fetch(authority + "/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      redirect_uri: env.APP_ORIGIN + "/api/onedrive/callback",
      scope: "openid offline_access Files.ReadWrite",
      ...values,
    }),
  });
  const d = (await r.json()) as any;
  if (!r.ok) throw new Error("OneDrive 재연결이 필요합니다");
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + d.expires_in * 1000,
  };
}
export class Drive {
  private knownFolders = new Map<string, number>();
  constructor(private token: () => Promise<string>) {}
  async request(path: string, init: RequestInit = {}) {
    const r = await fetch("https://graph.microsoft.com/v1.0" + path, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers)),
        Authorization: "Bearer " + (await this.token()),
      },
    });
    if (!r.ok) {
      const e = new Error(
        r.status === 401
          ? "OneDrive 재연결이 필요합니다"
          : r.status === 507
            ? "OneDrive 저장공간이 부족합니다"
            : r.status === 429
              ? "OneDrive 요청 한도입니다. 잠시 후 재시도하세요"
              : `OneDrive 저장 실패 (${r.status})`,
      );
      throw e;
    }
    return r;
  }
  async folders(path: string) {
    const parts = path.split("/").filter(Boolean);
    let parent = "";
    for (const name of parts) {
      const current = parent ? parent + "/" + name : name;
      if ((this.knownFolders.get(current) || 0) > Date.now()) {
        parent = current;
        continue;
      }
      const url = parent
        ? `/me/drive/root:/${parent.split("/").map(encodeURIComponent).join("/")}:/children`
        : "/me/drive/root/children";
      const r = await fetch("https://graph.microsoft.com/v1.0" + url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + (await this.token()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      });
      if (!r.ok && r.status !== 409)
        throw new Error(`OneDrive 폴더 생성 실패 (${r.status})`);
      parent = current;
      this.knownFolders.set(current, Date.now() + 300000);
    }
  }
  async exists(path: string) {
    const r = await fetch(
      "https://graph.microsoft.com/v1.0/me/drive/root:/" +
        path.split("/").map(encodeURIComponent).join("/") +
        "?$select=id,name,size,folder",
      { headers: { Authorization: "Bearer " + (await this.token()) } },
    );
    if (r.status === 404) return undefined;
    if (!r.ok) throw new Error(`OneDrive 파일 확인 실패 (${r.status})`);
    return (await r.json()) as {
      id: string;
      name: string;
      size: number;
      folder?: object;
    };
  }
  async item(id: string) {
    return (await (
      await this.request(
        "/me/drive/items/" +
          encodeURIComponent(id) +
          "?$select=id,name,folder,parentReference",
      )
    ).json()) as {
      id: string;
      name: string;
      folder?: object;
      parentReference?: { id?: string };
    };
  }
  async renameFolder(id: string, name: string) {
    const item = await this.item(id);
    if (!item.folder) throw new Error("저장 폴더를 찾을 수 없습니다");
    const conflict = await this.exists(name);
    if (conflict && conflict.id !== id)
      throw new Error(
        "같은 이름의 파일이나 폴더가 이미 있습니다. 다른 이름을 입력하세요",
      );
    try {
      await this.request("/me/drive/items/" + encodeURIComponent(id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      });
    } finally {
      this.knownFolders.clear();
    }
  }
  async put(path: string, data: BodyInit, mime = "application/octet-stream") {
    if (path.includes("/"))
      await this.folders(path.slice(0, path.lastIndexOf("/")));
    const r = await this.request(
      "/me/drive/root:/" +
        path.split("/").map(encodeURIComponent).join("/") +
        ":/content",
      { method: "PUT", body: data, headers: { "Content-Type": mime } },
    );
    return (await r.json()) as { id: string; size: number; eTag: string };
  }
  async remove(id: string) {
    const r = await fetch(
      "https://graph.microsoft.com/v1.0/me/drive/items/" +
        encodeURIComponent(id),
      {
        method: "DELETE",
        headers: { Authorization: "Bearer " + (await this.token()) },
      },
    );
    if (!r.ok && r.status !== 404)
      throw new Error(`OneDrive 접수 삭제 실패 (${r.status})`);
  }
  async get(id: string) {
    return this.request(
      "/me/drive/items/" + encodeURIComponent(id) + "/content",
    );
  }
  async listCommits(folder = "commits", root = "상담") {
    const r = await this.request(
      "/me/drive/root:/" +
        encodeURIComponent(root) +
        "/_codimate/" +
        encodeURIComponent(folder) +
        ":/children?$top=200&$select=id,name",
    );
    let d = (await r.json()) as any;
    const items: any[] = [...d.value];
    while (d["@odata.nextLink"]) {
      const url = new URL(d["@odata.nextLink"]);
      if (url.origin !== "https://graph.microsoft.com")
        throw new Error("잘못된 페이지 주소");
      d = await (
        await this.request(url.pathname.replace("/v1.0", "") + url.search)
      ).json();
      items.push(...d.value);
    }
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }
}
