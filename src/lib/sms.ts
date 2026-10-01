// GSM 03.38: the only characters an SMS can carry at 160 per page. One character
// outside this set switches the whole message to Unicode (70 per page).
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€\f';

const BASIC = new Set(GSM_BASIC);
const EXTENDED = new Set(GSM_EXTENDED);

const REPLACEMENTS: Record<string, string> = {
  '—': '-', '–': '-', '‒': '-', '―': '-', '−': '-',
  '‘': "'", '’': "'", '‚': "'", '′': "'", '`': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '…': '...', '•': '-', '·': '-',
  '\u00a0': ' ', '\u2009': ' ', '\u202f': ' ', '\u200b': '',
};

export interface SmsInfo {
  /** Length as the network counts it (extended characters count twice). */
  length: number;
  parts: number;
  unicode: boolean;
  /** Characters allowed per page for this encoding and length. */
  perPart: number;
  /** Characters that force Unicode, in order of first appearance. */
  nonGsm: string[];
}

export function smsInfo(text: string): SmsInfo {
  const chars = [...text];
  const nonGsm = [...new Set(chars.filter((c) => !BASIC.has(c) && !EXTENDED.has(c)))];
  const unicode = nonGsm.length > 0;
  const length = unicode
    ? chars.reduce((n, c) => n + (c.codePointAt(0)! > 0xffff ? 2 : 1), 0)
    : chars.reduce((n, c) => n + (EXTENDED.has(c) ? 2 : 1), 0);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const parts = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  return { length, parts, unicode, perPart: parts > 1 ? multi : single, nonGsm };
}

/** Swaps typographic punctuation for plain equivalents so the message stays at 160 per page. */
export function toGsm(text: string): string {
  return [...text].map((c) => REPLACEMENTS[c] ?? c).join('');
}

/** True when toGsm() would make the message fully SMS-safe. */
export function gsmFixable(info: SmsInfo): boolean {
  return info.nonGsm.length > 0 && info.nonGsm.every((c) => c in REPLACEMENTS);
}
