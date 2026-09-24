export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('phi:unauthorized'));
    if (data.code === 'PASSWORD_CHANGE_REQUIRED') window.dispatchEvent(new Event('phi:password-required'));
    throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data.code);
  }
  return data;
}

export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '');
export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
