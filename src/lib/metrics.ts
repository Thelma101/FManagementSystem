import { supabase } from './supabase';

let sessionId: string | null = null;
let lastBeat = Date.now();
let stopWatch: (() => void) | null = null;

export function logMetric(
  action: 'signed_in' | 'signed_out' | 'downloaded' | 'sent' | 'imported',
  entity: string,
  detail?: string,
  label?: string,
  entityId?: string,
): void {
  if (!supabase) return;
  void supabase.rpc('log_metric', {
    p_action: action,
    p_entity: entity,
    p_entity_id: entityId ?? null,
    p_label: label ?? null,
    p_detail: detail ?? null,
  });
}

async function pulse(): Promise<void> {
  if (!supabase || !sessionId) return;
  const add = Math.round((Date.now() - lastBeat) / 1000);
  lastBeat = Date.now();
  if (add <= 0) return;
  await supabase.rpc('heartbeat_session', { p_id: sessionId, p_add: add }).then(() => undefined, () => undefined);
}

export async function beginSession(): Promise<void> {
  if (!supabase || sessionId) return;
  const { data } = await supabase.rpc('start_session');
  sessionId = typeof data === 'string' ? data : null;
  lastBeat = Date.now();
  if (!sessionId || stopWatch) return;

  const onTick = () => {
    if (document.visibilityState === 'visible') void pulse();
  };
  const onVis = () => {
    if (document.visibilityState === 'hidden') void pulse();
    else lastBeat = Date.now();
  };

  const onHide = () => { void pulse(); };
  const tick = window.setInterval(onTick, 20000);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', onHide);
  stopWatch = () => {
    window.clearInterval(tick);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', onHide);
    stopWatch = null;
  };
}

export async function endSession(): Promise<void> {
  await pulse();
  stopWatch?.();
  sessionId = null;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0 min';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

export interface UsageRow {
  userId: string;
  name: string;
  email: string;
  logins: number;
  seconds: number;
  lastSeen?: string;
}

export async function loadUsage(): Promise<UsageRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('usage_stats');
  if (error || !data) return [];
  return (data as { user_id: string; name: string; email: string; logins: number; seconds: number; last_seen: string | null }[]).map((r) => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    logins: Number(r.logins) || 0,
    seconds: Number(r.seconds) || 0,
    lastSeen: r.last_seen ?? undefined,
  }));
}
