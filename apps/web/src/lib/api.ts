'use client';

import type { ApiResponse, PaginationMeta } from '@fabriq/shared';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

const ACCESS_KEY = 'fabriq_access_token';
const REFRESH_KEY = 'fabriq_refresh_token';

export const tokenStore = {
  getAccess: () => (typeof window !== 'undefined' ? window.localStorage.getItem(ACCESS_KEY) : null),
  getRefresh: () => (typeof window !== 'undefined' ? window.localStorage.getItem(REFRESH_KEY) : null),
  set: (access: string, refresh: string) => {
    window.localStorage.setItem(ACCESS_KEY, access);
    window.localStorage.setItem(REFRESH_KEY, refresh);
    document.cookie = 'fabriq_auth=1; path=/; max-age=604800; samesite=lax';
  },
  clear: () => {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    document.cookie = 'fabriq_auth=; path=/; max-age=0';
  },
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  isFormData?: boolean;
}

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return null;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as ApiResponse<{ accessToken: string; refreshToken: string }>;
  if (!json.success || !json.data) return null;
  tokenStore.set(json.data.accessToken, json.data.refreshToken);
  return json.data.accessToken;
}

interface Envelope<T> {
  data: T;
  meta?: PaginationMeta;
  success: boolean;
  error?: { code: string; message: string };
}

/** Core fetch wrapper: attaches bearer token, auto-refreshes once on 401. */
async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<Envelope<T>> {
  const access = tokenStore.getAccess();
  const headers: Record<string, string> = {
    ...(options.isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(access ? { Authorization: `Bearer ${access}` } : {}),
    ...options.headers,
  };

  const method = options.method ?? 'GET';
  let res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: options.isFormData ? (options.body as FormData) : options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (!refreshing) {
      refreshing = refreshAccessToken().finally(() => {
        refreshing = null;
      });
    }
    const newAccess = await refreshing;
    if (newAccess) {
      res = await fetch(`${API_URL}${path}`, {
        method,
        headers: { ...headers, Authorization: `Bearer ${newAccess}` },
        body: method === 'GET' ? undefined : (options.body as BodyInit | null),
        cache: 'no-store',
      });
    } else {
      tokenStore.clear();
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.success) {
    const message = json?.error?.message ?? `Request failed (${res.status})`;
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = json?.error?.code;
    throw err;
  }
  return json;
}

/** Returns just the data payload. */
export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const envelope = await apiRequest<T>(path, options);
  return envelope.data;
}

export const http = {
  get: <T = unknown>(path: string) => api<T>(path),
  post: <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body }),
  patch: <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body }),
  put: <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body }),
  del: <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' }),
  upload: <T = unknown>(path: string, form: FormData) => api<T>(path, { method: 'POST', body: form, isFormData: true }),
};

/** Paginated list helper — returns items + pagination meta. */
export async function list<T = Record<string, unknown>>(
  path: string,
): Promise<{ items: T[]; meta: PaginationMeta }> {
  const envelope = await apiRequest<unknown>(path);
  return {
    items: (envelope.data as T[]) ?? [],
    meta: envelope.meta ?? { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  };
}
