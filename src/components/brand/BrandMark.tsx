import { useId } from 'react';

/** Winners' Chapel globe: gold meridians, parallels, and the flame. */
export default function BrandMark({ size = 40, label }: { size?: number; label?: string }) {
  const uid = useId().replace(/:/g, '');
  const gold = `wc-gold-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={gold} x1="16" y1="8" x2="64" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F6D56B" />
          <stop offset="0.45" stopColor="#E8B923" />
          <stop offset="1" stopColor="#B8860B" />
        </linearGradient>
      </defs>
      <path
        d="M40 4c-1.8 6.5-6.8 10-4.2 16.2 1.6-4.2 4.4-5.6 5.6-2.6 1.4-2.8 4.2-1.4 5.4 2.8C49.4 13.8 43.2 10.4 40 4z"
        fill={`url(#${gold})`}
      />
      <path
        d="M40 10c-1.2 3.2-3.8 5-2.4 8.4 1.2-1.8 2-2.4 2.6-.8.7-1.6 1.6-.8 2.6.8C44.2 14.8 42 13.2 40 10z"
        fill="#FFF3C4"
      />
      <ellipse cx="40" cy="58" rx="24" ry="24" stroke={`url(#${gold})`} strokeWidth="2.2" />
      <ellipse cx="40" cy="58" rx="12" ry="24" stroke={`url(#${gold})`} strokeWidth="1.35" />
      <ellipse cx="40" cy="58" rx="24" ry="8" stroke={`url(#${gold})`} strokeWidth="1.2" />
      <ellipse cx="40" cy="58" rx="24" ry="16" stroke={`url(#${gold})`} strokeWidth="1.05" />
      <path d="M40 34v48" stroke={`url(#${gold})`} strokeWidth="1.2" />
      <path d="M16.5 50.5c7.5-4.8 16-7.4 23.5-7.4s16 2.6 23.5 7.4" stroke={`url(#${gold})`} strokeWidth="1.05" />
      <path d="M16.5 65.5c7.5 4.8 16 7.4 23.5 7.4s16-2.6 23.5-7.4" stroke={`url(#${gold})`} strokeWidth="1.05" />
    </svg>
  );
}
