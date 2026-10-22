import {
  Children, isValidElement, useEffect, useId, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type ChangeEventLike = { target: { value: string } };

interface Props {
  value: string;
  onChange: (e: ChangeEventLike) => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  autoFocus?: boolean;
  title?: string;
  'aria-label'?: string;
}

interface Item {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

function itemsFrom(children: ReactNode, group?: string): Item[] {
  const out: Item[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const type = child.type;
    const props = child.props as { value?: string; label?: string; disabled?: boolean; children?: ReactNode };
    if (type === 'optgroup') {
      out.push(...itemsFrom(props.children, props.label));
      return;
    }
    if (type === 'option') {
      const label = typeof props.children === 'string' || typeof props.children === 'number'
        ? String(props.children)
        : String(props.value ?? '');
      out.push({ value: String(props.value ?? ''), label, disabled: props.disabled, group });
    }
  });
  return out;
}

export default function Select({
  value, onChange, children, className, style, disabled, autoFocus, title, 'aria-label': ariaLabel,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const items = useMemo(() => itemsFrom(children), [children]);
  const selected = items.find((i) => i.value === value) ?? items[0];

  function place() {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const openUp = below < 220 && r.top > below;
    setPos({
      position: 'fixed',
      left: r.left,
      width: Math.max(r.width, 168),
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
    });
  }

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pick(item: Item) {
    if (item.disabled) return;
    onChange({ target: { value: item.value } });
    setOpen(false);
  }

  const wrapStyle: CSSProperties = {
    width: style?.width ?? '100%',
    minWidth: style?.minWidth,
    maxWidth: style?.maxWidth,
    flex: style?.flex,
    flexShrink: style?.flexShrink,
  };

  const menu = open && createPortal(
    <ul id={listId} role="listbox" className="app-select-menu" ref={menuRef} style={pos}>
      {items.map((item, i) => {
        const showGroup = item.group && item.group !== items[i - 1]?.group;
        return (
          <li key={`${item.group ?? ''}:${item.value}:${i}`}>
            {showGroup && <p className="app-select-group">{item.group}</p>}
            <button
              type="button"
              role="option"
              aria-selected={item.value === value}
              disabled={item.disabled}
              className={`app-select-option${item.value === value ? ' on' : ''}`}
              onClick={() => pick(item)}
            >
              {item.label}
            </button>
          </li>
        );
      })}
    </ul>,
    document.body,
  );

  return (
    <div className="app-select" style={wrapStyle} ref={rootRef}>
      <button
        type="button"
        className={`input app-select-btn${className && className !== 'input' ? ` ${className}` : ''}`}
        style={{ width: '100%', padding: style?.padding, fontSize: style?.fontSize }}
        disabled={disabled}
        autoFocus={autoFocus}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
      >
        {selected?.label ?? ''}
      </button>
      {menu}
    </div>
  );
}
