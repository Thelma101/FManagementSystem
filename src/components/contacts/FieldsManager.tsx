import { useState } from 'react';
import type { AuthUser, ContactField, FieldType } from '../../types';
import { store } from '../../lib/store';
import { FIELD_TYPE_LABEL, activeFields, describeField } from '../../lib/customFields';
import { useToast } from '../ui/Toast';

interface Props {
  user: AuthUser;
  onClose: () => void;
  onChange: (fields: ContactField[]) => void;
}

type Draft = { id?: string; label: string; type: FieldType; askDate: boolean; askPlace: boolean; options: string };

const BLANK: Draft = { label: '', type: 'yesno', askDate: true, askPlace: false, options: '' };

/** Built-in questions that already exist on every contact, so admins don't duplicate them. */
const BUILT_IN = ['born again', 'saved', 'salvation', 'baptised', 'baptized', 'baptism', 'cell fellowship', 'wsf', 'name', 'phone', 'notes', 'tags'];

export default function FieldsManager({ user, onClose, onChange }: Props) {
  const { toast } = useToast();
  const [fields, setFields] = useState(() => store.getFields());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  const active = activeFields(fields);
  const hidden = fields.filter((f) => f.archived);

  function persist(next: ContactField[]) {
    store.saveFields(next);
    setFields(next);
    onChange(next);
  }

  function edit(f: ContactField) {
    setError('');
    setDraft({ id: f.id, label: f.label, type: f.type, askDate: !!f.askDate, askPlace: !!f.askPlace, options: (f.options ?? []).join('\n') });
  }

  function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const label = draft.label.trim();
    if (!label) { setError('Give the field a name.'); return; }
    if (BUILT_IN.includes(label.toLowerCase())) { setError(`"${label}" is already a standard question on every contact.`); return; }
    if (fields.some((f) => f.id !== draft.id && f.label.toLowerCase() === label.toLowerCase())) {
      setError('A field with this name already exists (check hidden fields too).');
      return;
    }
    const options = [...new Set(draft.options.split(/[\n,]/).map((o) => o.trim()).filter(Boolean))];
    if (draft.type === 'choice' && options.length < 2) { setError('Add at least two answers to pick from.'); return; }

    const shape = {
      label,
      askDate: draft.type === 'yesno' ? draft.askDate : undefined,
      askPlace: draft.type === 'yesno' ? draft.askPlace : undefined,
      options: draft.type === 'choice' ? options : undefined,
    };
    if (draft.id) {
      persist(fields.map((f) => (f.id === draft.id ? { ...f, ...shape } : f)));
      toast('success', 'Field updated', label);
    } else {
      const position = Math.max(0, ...fields.map((f) => f.position)) + 1;
      persist([...fields, { id: 'f' + Date.now(), type: draft.type, position, createdBy: user.name, ...shape }]);
      toast('success', 'Field added', `${label} now appears on every contact`);
    }
    setDraft(null);
  }

  function move(f: ContactField, dir: -1 | 1) {
    const i = active.findIndex((x) => x.id === f.id);
    const other = active[i + dir];
    if (!other) return;
    persist(fields.map((x) => (x.id === f.id ? { ...x, position: other.position } : x.id === other.id ? { ...x, position: f.position } : x)));
  }

  function setArchived(f: ContactField, archived: boolean) {
    if (archived && !confirm(`Hide "${f.label}"? It disappears from forms and imports. Answers already saved are kept, and you can restore it any time.`)) return;
    persist(fields.map((x) => (x.id === f.id ? { ...x, archived: archived || undefined } : x)));
  }

  return (
    <div className="overlay">
      <div className="modal modal-tall" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: 500 }}>Contact fields</h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-3)', marginTop: '2px' }}>
              Extra questions asked for every contact, e.g. Bible school or Foundation class
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>
            Always asked: born again (date, place), baptised (date, place), cell fellowship, where you met, and service commitment.
          </p>

          {active.length === 0 && !draft && (
            <p style={{ fontSize: '13px', color: 'var(--text-3)', fontStyle: 'italic' }}>No extra fields yet.</p>
          )}

          {active.map((f, i) => (
            <div key={f.id} className="field-row" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: '13.5px' }}>{f.label}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>{describeField(f)}</p>
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button type="button" className="btn btn-ghost btn-xs" disabled={i === 0} onClick={() => move(f, -1)} aria-label="Move up">↑</button>
                <button type="button" className="btn btn-ghost btn-xs" disabled={i === active.length - 1} onClick={() => move(f, 1)} aria-label="Move down">↓</button>
                <button type="button" className="btn btn-outline btn-xs" onClick={() => edit(f)}>Edit</button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setArchived(f, true)}>Hide</button>
              </div>
            </div>
          ))}

          {draft ? (
            <form onSubmit={saveDraft} className="form-section" style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
              <p className="form-section-title">{draft.id ? 'Edit field' : 'New field'}</p>
              <div className="grid-2">
                <div>
                  <label className="label">Field name *</label>
                  <input className="input" autoFocus value={draft.label} placeholder="e.g. Bible school"
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                </div>
                <div>
                  <label className="label">Answer type</label>
                  <select className="input" value={draft.type} disabled={!!draft.id}
                    title={draft.id ? 'The answer type can’t change once a field exists, so saved answers stay valid.' : ''}
                    onChange={(e) => setDraft({ ...draft, type: e.target.value as FieldType })}>
                    {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
                  </select>
                </div>
              </div>
              {draft.type === 'yesno' && (
                <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-2)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={draft.askDate} onChange={(e) => setDraft({ ...draft, askDate: e.target.checked })} />
                    When answered Yes, ask for the date
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={draft.askPlace} onChange={(e) => setDraft({ ...draft, askPlace: e.target.checked })} />
                    …and the place
                  </label>
                </div>
              )}
              {draft.type === 'choice' && (
                <div>
                  <label className="label">Answers to pick from (one per line)</label>
                  <textarea className="input" rows={4} value={draft.options} placeholder={'Choir\nUshering\nProtocol'}
                    onChange={(e) => setDraft({ ...draft, options: e.target.value })} />
                </div>
              )}
              {error && <div className="alert alert-red">{error}</div>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setDraft(null); setError(''); }}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">{draft.id ? 'Save field' : 'Add field'}</button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn-outline" onClick={() => { setError(''); setDraft({ ...BLANK }); }}>+ Add a field</button>
          )}

          {hidden.length > 0 && (
            <div>
              <p className="label" style={{ marginTop: '6px' }}>Hidden fields</p>
              {hidden.map((f) => (
                <div key={f.id} className="field-row" style={{ padding: '6px 2px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>{f.label} · {describeField(f)}</span>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setArchived(f, false)}>Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
