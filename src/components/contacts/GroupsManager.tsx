import { useState } from 'react';
import type { AuthUser, Contact, ContactGroup } from '../../types';
import { store } from '../../lib/store';
import { canDeleteRecords } from '../../lib/permissions';
import { useToast } from '../ui/Toast';

interface Props {
  user: AuthUser;
  groups: ContactGroup[];
  /** Contacts currently listed on the Contacts page (after search and filters). */
  shown: Contact[];
  filtered: boolean;
  onClose: () => void;
  onGroupsChange: (g: ContactGroup[]) => void;
  onContactsChange: (c: Contact[]) => void;
}

type Draft = { id?: string; name: string; description: string };

export default function GroupsManager({ user, groups, shown, filtered, onClose, onGroupsChange, onContactsChange }: Props) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const contacts = store.getContacts();
  const activeShown = shown.filter((c) => !c.archived);

  const memberCount = (id: string) => contacts.filter((c) => !c.archived && c.groupIds?.includes(id)).length;

  function persist(next: ContactGroup[]) {
    store.saveGroups(next);
    onGroupsChange(next);
  }

  function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const name = draft.name.trim().replace(/\s+/g, ' ');
    if (!name) { setError('Give the group a name.'); return; }
    if (groups.some((g) => g.id !== draft.id && g.name.toLowerCase() === name.toLowerCase())) { setError('A group with this name already exists.'); return; }
    const description = draft.description.trim();
    if (draft.id) {
      persist(groups.map((g) => (g.id === draft.id ? { ...g, name, description } : g)));
      toast('success', 'Group updated', name);
    } else {
      const group: ContactGroup = { id: 'g' + Date.now().toString(36), name, description, createdBy: user.name, createdAt: new Date().toISOString() };
      persist([...groups, group].sort((a, b) => a.name.localeCompare(b.name)));
      toast('success', 'Group created', name);
    }
    setDraft(null);
    setError('');
  }

  function setMembership(group: ContactGroup, add: boolean) {
    const ids = new Set(activeShown.map((c) => c.id));
    let changed = 0;
    const next = store.getContacts().map((c) => {
      if (!ids.has(c.id)) return c;
      const has = c.groupIds?.includes(group.id) ?? false;
      if (has === add) return c;
      changed++;
      return { ...c, groupIds: add ? [...(c.groupIds ?? []), group.id] : (c.groupIds ?? []).filter((g) => g !== group.id) };
    });
    if (!changed) {
      toast('info', add ? 'Already in the group' : 'Nobody to remove', group.name);
      return;
    }
    store.saveContacts(next);
    onContactsChange(next);
    toast('success', `${changed} contact${changed === 1 ? '' : 's'} ${add ? 'added to' : 'removed from'} ${group.name}`);
  }

  function remove(group: ContactGroup) {
    const n = memberCount(group.id);
    if (!confirm(`Delete the group "${group.name}"?${n ? ` Its ${n} contact${n === 1 ? '' : 's'} stay in Contacts; only the group goes.` : ''} Schedules sent to this group will stop finding anyone.`)) return;
    persist(groups.filter((g) => g.id !== group.id));
    // The database takes the group off every contact; mirror that locally without re-saving.
    const next = store.getContacts().map((c) => (c.groupIds?.includes(group.id) ? { ...c, groupIds: c.groupIds.filter((g) => g !== group.id) } : c));
    store.replaceFromCloud('fp_contacts', next);
    onContactsChange(next);
    toast('info', 'Group deleted', group.name);
  }

  return (
    <div className="overlay">
      <div className="modal modal-tall" style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: 500 }}>Contact groups</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-3)', marginTop: '2px' }}>
              e.g. Choir, Youth, New converts March. Message a whole group at once, or send it scheduled reminders.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>
            {filtered
              ? <>The Contacts page is filtered to <strong>{activeShown.length}</strong> active contact{activeShown.length === 1 ? '' : 's'}. Use “Add shown” to put all of them in a group.</>
              : <>Tip: filter or search the Contacts page first, then use “Add shown” to add just those people. You can also pick groups on each contact’s form.</>}
          </p>

          {groups.length === 0 && !draft && (
            <p style={{ fontSize: '13px', color: 'var(--text-3)', fontStyle: 'italic' }}>No groups yet.</p>
          )}

          {groups.map((g) => (
            <div key={g.id} className="field-row" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: '13.5px' }}>
                  {g.name}{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: '12.5px' }}>
                    · {memberCount(g.id)} contact{memberCount(g.id) === 1 ? '' : 's'}
                  </span>
                </p>
                {g.description && <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>{g.description}</p>}
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline btn-xs" disabled={!activeShown.length} onClick={() => setMembership(g, true)}
                  title={`Add the ${activeShown.length} contacts listed on the Contacts page`}>
                  Add shown ({activeShown.length})
                </button>
                {filtered && (
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMembership(g, false)} title="Remove the listed contacts from this group">
                    Remove shown
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setError(''); setDraft({ id: g.id, name: g.name, description: g.description }); }}>Rename</button>
                {canDeleteRecords(user) && (
                  <button type="button" className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => remove(g)}>Delete</button>
                )}
              </div>
            </div>
          ))}

          {draft ? (
            <form onSubmit={saveDraft} className="form-section" style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
              <p className="form-section-title">{draft.id ? 'Rename group' : 'New group'}</p>
              <div>
                <label className="label">Group name *</label>
                <input className="input" autoFocus value={draft.name} placeholder="e.g. Choir" maxLength={60}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" value={draft.description} placeholder="Optional" maxLength={160}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              {error && <div className="alert alert-red">{error}</div>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setDraft(null); setError(''); }}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">{draft.id ? 'Save' : 'Create group'}</button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn-outline" onClick={() => { setError(''); setDraft({ name: '', description: '' }); }}>+ New group</button>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
