export type User = {
  id: string;
  name: string;
  email: string | null;
  is_demo: boolean;
};
let accountId: string | null = null;
export function setApiAccount(id: string | null) {
  accountId = id;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Tempo-Request": "1",
      ...(accountId ? { "X-Tempo-User": accountId } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail =
      typeof body.detail === "string"
        ? body.detail
        : "Please check your details and try again.";
    if (res.status === 401 && !path.startsWith("auth/"))
      window.dispatchEvent(new Event("tempo:unauthorized"));
    throw new ApiError(detail, res.status);
  }
  const result = res.status === 204 ? (undefined as T) : await res.json();
  if (
    options?.method &&
    options.method !== "GET" &&
    /^(sessions|habits)(\/|$)/.test(path)
  )
    window.dispatchEvent(new Event("tempo:activity"));
  return result;
}
