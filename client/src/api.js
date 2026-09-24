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

export async function uploadFile(path, file, headers = {}) {
  const enc = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, encodeURIComponent(v ?? '')]));
  const res = await fetch(`/api${path}`, {
    method: 'POST', credentials: 'same-origin', body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), ...enc },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || (res.status === 413 ? 'That file is too large (25 MB maximum).' : `Upload failed (${res.status}).`), res.status);
  return data;
}

export const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export const fmtPHP = (n) => `PHP ${Math.round(n).toLocaleString('en-PH')}`;
