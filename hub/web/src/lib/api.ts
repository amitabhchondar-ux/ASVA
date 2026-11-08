export type User = {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
};

export type Device = {
  id: string;
  name: string;
  location: string;
  firmware_version: string;
  last_seen_at: number;
  online: number;
  led_on: number;
  threshold: number;
  created_at: number;
};

export type Event = {
  id: string;
  device_id: string;
  session_id: string | null;
  kind: 'wake' | 'command';
  text: string;
  confidence: number;
  latency_ms: number;
  wrong: number;
  ts: number;
};

export type Session = {
  id: string;
  name: string;
  device_id: string;
  speaker: string;
  distance_m: number;
  noise_level: string;
  attempts: number;
  notes: string;
  started_at: number;
  ended_at: number | null;
  event_count?: number;
};

export type TelemetryPoint = {
  id: string;
  device_id: string;
  heap_bytes: number;
  rssi: number;
  uptime_s: number;
  ts: number;
};

export type SessionSummary = {
  session: Session;
  metrics: {
    totalEvents: number;
    wakeCount: number;
    commandCount: number;
    wrongCount: number;
    validWakeCount: number;
    attempts: number;
    detectionRate: number;
    durationSeconds: number;
    durationFormatted: string;
    falseActivationsPerHour: number;
    avgLatency: number;
    p95Latency: number;
    avgConfidence: number;
    telemetry: {
      sampleCount: number;
      avgHeapBytes: number;
      minHeapBytes: number;
      avgRssi: number;
    };
  };
  events: Event[];
};

const API_BASE = '/api';

async function request(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...opts.headers,
    },
    credentials: 'include',
  });

  if (res.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  if (res.headers.get('content-type')?.includes('text/csv')) {
    return res.text();
  }

  return res.json();
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
  },
  devices: {
    list: () => request('/devices'),
    get: (id: string) => request(`/devices/${id}`),
    update: (id: string, body: { name?: string; location?: string }) =>
      request(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string, deleteHistory?: boolean) =>
      request(`/devices/${id}?deleteHistory=${deleteHistory === true}`, { method: 'DELETE' }),
    command: (id: string, body: { cmd: string; state?: string; value?: number }) =>
      request(`/devices/${id}/commands`, { method: 'POST', body: JSON.stringify(body) }),
    telemetry: (id: string, params?: { from?: string; to?: string; limit?: string }) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/devices/${id}/telemetry?${qs}`);
    },
  },
  events: {
    list: (params?: { device?: string; kind?: string; from?: string; to?: string; minConf?: string; page?: string; limit?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return request(`/events?${qs}`);
    },
    markWrong: (id: string, wrong: boolean) =>
      request(`/events/${id}`, { method: 'PATCH', body: JSON.stringify({ wrong }) }),
    export: (params?: { device?: string; kind?: string; minConf?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return request(`/events/export.csv?${qs}`);
    },
  },
  sessions: {
    list: () => request('/sessions'),
    create: (body: { name: string; device_id: string; speaker?: string; distance_m?: number; noise_level?: string; attempts?: number; notes?: string }) =>
      request('/sessions', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Session>) =>
      request(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    stop: (id: string) => request(`/sessions/${id}/stop`, { method: 'POST' }),
    summary: (id: string) => request(`/sessions/${id}/summary`) as Promise<SessionSummary>,
    export: (id: string) => request(`/sessions/${id}/export.csv`),
  },
  users: {
    list: () => request('/users'),
    create: (body: { email: string; password: string; role?: string }) =>
      request('/users', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: { role?: string; active?: boolean; password?: string }) =>
      request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),
  },
};
