import { gsmFixable, smsInfo } from '../../lib/sms';

interface Props {
  text: string;
  /** When given, shows a one-click fix for punctuation that forces Unicode (apply toGsm to the source text). */
  onFix?: () => void;
  /** Placeholders like {name} are filled per person, so the count is an estimate. */
  hasPlaceholders?: boolean;
}

export default function SmsCounter({ text, onFix, hasPlaceholders }: Props) {
  const info = smsInfo(text);
  if (info.length === 0) return null;

  const over = info.parts > 1;
  const color = info.unicode || info.parts > 2 ? 'var(--red)' : over ? 'var(--amber)' : 'var(--text-3)';
  const shown = info.nonGsm.map((c) => (c.trim() ? c : 'space')).join(' ');

  return (
    <div style={{ fontSize: '11.5px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color }}>
        <span>
          {info.unicode ? 'Special characters: ' : ''}
          {info.parts === 1 ? `${info.perPart - info.length} characters left` : `${info.parts} pages per SMS`}
          {hasPlaceholders ? ' (estimate, names vary)' : ''}
        </span>
        <span className="mono">
          {info.length} / {info.parts === 1 ? info.perPart : info.perPart * info.parts} · {info.parts} SMS
        </span>
      </div>
      {info.unicode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-2)', flexWrap: 'wrap' }}>
          <span>
            <span className="mono">{shown}</span> can't go in a normal SMS, so each page holds 70 characters instead of 160.
          </span>
          {onFix && gsmFixable(info) && (
            <button type="button" className="btn btn-outline btn-xs" onClick={onFix}>
              Fix characters
            </button>
          )}
        </div>
      )}
      {!info.unicode && over && (
        <span style={{ color: 'var(--text-3)' }}>Each SMS page costs the same, so keep it under 160 to pay for one.</span>
      )}
    </div>
  );
}
