import type { SupabaseClient } from '@supabase/supabase-js';

export interface ActivityInput {
  actorId?: string | null;
  actorName: string;
  action: string;
  entity: string;
  entityId?: string;
  label?: string;
  detail?: string;
  changes?: Record<string, [unknown, unknown]>;
}

/** Records a server-side change. Database triggers record changes made from the browser. */
export async function recordActivity(db: SupabaseClient, entry: ActivityInput): Promise<void> {
  await db.from('activity_log').insert({
    actor_id: entry.actorId ?? null,
    actor_name: entry.actorName,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    label: entry.label ?? null,
    detail: entry.detail ?? null,
    changes: entry.changes ?? null,
  });
}
