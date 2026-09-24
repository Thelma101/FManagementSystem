/**
 * Phone number utilities — E.164 validation & formatting for all countries.
 * Uses Google's libphonenumber via libphonenumber-js.
 */
import {
  parsePhoneNumberFromString,
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  type CountryCode,
} from 'libphonenumber-js';

export type { CountryCode };

export interface CountryOption {
  iso: CountryCode;
  name: string;
  dial: string; // e.g. "234"
  label: string; // e.g. "Nigeria (+234)"
}

/** Display names for ISO country codes (English). */
const COUNTRY_NAMES: Record<string, string> = {
  AF: 'Afghanistan', AL: 'Albania', DZ: 'Algeria', AS: 'American Samoa', AD: 'Andorra',
  AO: 'Angola', AI: 'Anguilla', AG: 'Antigua & Barbuda', AR: 'Argentina', AM: 'Armenia',
  AW: 'Aruba', AU: 'Australia', AT: 'Austria', AZ: 'Azerbaijan', BS: 'Bahamas',
  BH: 'Bahrain', BD: 'Bangladesh', BB: 'Barbados', BY: 'Belarus', BE: 'Belgium',
  BZ: 'Belize', BJ: 'Benin', BM: 'Bermuda', BT: 'Bhutan', BO: 'Bolivia',
  BA: 'Bosnia & Herzegovina', BW: 'Botswana', BR: 'Brazil', IO: 'British Indian Ocean Territory',
  VG: 'British Virgin Islands', BN: 'Brunei', BG: 'Bulgaria', BF: 'Burkina Faso', BI: 'Burundi',
  KH: 'Cambodia', CM: 'Cameroon', CA: 'Canada', CV: 'Cape Verde', KY: 'Cayman Islands',
  CF: 'Central African Republic', TD: 'Chad', CL: 'Chile', CN: 'China', CO: 'Colombia',
  KM: 'Comoros', CG: 'Congo', CD: 'Congo (DRC)', CK: 'Cook Islands', CR: 'Costa Rica',
  CI: "Côte d'Ivoire", HR: 'Croatia', CU: 'Cuba', CW: 'Curaçao', CY: 'Cyprus',
  CZ: 'Czechia', DK: 'Denmark', DJ: 'Djibouti', DM: 'Dominica', DO: 'Dominican Republic',
  EC: 'Ecuador', EG: 'Egypt', SV: 'El Salvador', GQ: 'Equatorial Guinea', ER: 'Eritrea',
  EE: 'Estonia', SZ: 'Eswatini', ET: 'Ethiopia', FK: 'Falkland Islands', FO: 'Faroe Islands',
  FJ: 'Fiji', FI: 'Finland', FR: 'France', GF: 'French Guiana', PF: 'French Polynesia',
  GA: 'Gabon', GM: 'Gambia', GE: 'Georgia', DE: 'Germany', GH: 'Ghana', GI: 'Gibraltar',
  GR: 'Greece', GL: 'Greenland', GD: 'Grenada', GP: 'Guadeloupe', GU: 'Guam',
  GT: 'Guatemala', GG: 'Guernsey', GN: 'Guinea', GW: 'Guinea-Bissau', GY: 'Guyana',
  HT: 'Haiti', HN: 'Honduras', HK: 'Hong Kong', HU: 'Hungary', IS: 'Iceland',
  IN: 'India', ID: 'Indonesia', IR: 'Iran', IQ: 'Iraq', IE: 'Ireland', IM: 'Isle of Man',
  IL: 'Israel', IT: 'Italy', JM: 'Jamaica', JP: 'Japan', JE: 'Jersey', JO: 'Jordan',
  KZ: 'Kazakhstan', KE: 'Kenya', KI: 'Kiribati', XK: 'Kosovo', KW: 'Kuwait',
  KG: 'Kyrgyzstan', LA: 'Laos', LV: 'Latvia', LB: 'Lebanon', LS: 'Lesotho',
  LR: 'Liberia', LY: 'Libya', LI: 'Liechtenstein', LT: 'Lithuania', LU: 'Luxembourg',
  MO: 'Macao', MG: 'Madagascar', MW: 'Malawi', MY: 'Malaysia', MV: 'Maldives',
  ML: 'Mali', MT: 'Malta', MH: 'Marshall Islands', MQ: 'Martinique', MR: 'Mauritania',
  MU: 'Mauritius', YT: 'Mayotte', MX: 'Mexico', FM: 'Micronesia', MD: 'Moldova',
  MC: 'Monaco', MN: 'Mongolia', ME: 'Montenegro', MS: 'Montserrat', MA: 'Morocco',
  MZ: 'Mozambique', MM: 'Myanmar', NA: 'Namibia', NR: 'Nauru', NP: 'Nepal',
  NL: 'Netherlands', NC: 'New Caledonia', NZ: 'New Zealand', NI: 'Nicaragua',
  NE: 'Niger', NG: 'Nigeria', NU: 'Niue', NF: 'Norfolk Island', KP: 'North Korea',
  MK: 'North Macedonia', MP: 'Northern Mariana Islands', NO: 'Norway', OM: 'Oman',
  PK: 'Pakistan', PW: 'Palau', PS: 'Palestine', PA: 'Panama', PG: 'Papua New Guinea',
  PY: 'Paraguay', PE: 'Peru', PH: 'Philippines', PL: 'Poland', PT: 'Portugal',
  PR: 'Puerto Rico', QA: 'Qatar', RE: 'Réunion', RO: 'Romania', RU: 'Russia',
  RW: 'Rwanda', BL: 'Saint Barthélemy', SH: 'Saint Helena', KN: 'Saint Kitts & Nevis',
  LC: 'Saint Lucia', MF: 'Saint Martin', PM: 'Saint Pierre & Miquelon',
  VC: 'Saint Vincent & Grenadines', WS: 'Samoa', SM: 'San Marino', ST: 'São Tomé & Príncipe',
  SA: 'Saudi Arabia', SN: 'Senegal', RS: 'Serbia', SC: 'Seychelles', SL: 'Sierra Leone',
  SG: 'Singapore', SX: 'Sint Maarten', SK: 'Slovakia', SI: 'Slovenia', SB: 'Solomon Islands',
  SO: 'Somalia', ZA: 'South Africa', KR: 'South Korea', SS: 'South Sudan', ES: 'Spain',
  LK: 'Sri Lanka', SD: 'Sudan', SR: 'Suriname', SJ: 'Svalbard & Jan Mayen', SE: 'Sweden',
  CH: 'Switzerland', SY: 'Syria', TW: 'Taiwan', TJ: 'Tajikistan', TZ: 'Tanzania',
  TH: 'Thailand', TL: 'Timor-Leste', TG: 'Togo', TK: 'Tokelau', TO: 'Tonga',
  TT: 'Trinidad & Tobago', TN: 'Tunisia', TR: 'Turkey', TM: 'Turkmenistan',
  TC: 'Turks & Caicos', TV: 'Tuvalu', VI: 'U.S. Virgin Islands', UG: 'Uganda',
  UA: 'Ukraine', AE: 'United Arab Emirates', GB: 'United Kingdom', US: 'United States',
  UY: 'Uruguay', UZ: 'Uzbekistan', VU: 'Vanuatu', VA: 'Vatican City', VE: 'Venezuela',
  VN: 'Vietnam', WF: 'Wallis & Futuna', EH: 'Western Sahara', YE: 'Yemen',
  ZM: 'Zambia', ZW: 'Zimbabwe', AC: 'Ascension Island', TA: 'Tristan da Cunha',
};

/** Priority countries shown at the top of the picker. */
const PRIORITY: CountryCode[] = ['NG', 'GH', 'KE', 'ZA', 'US', 'GB', 'CA', 'IN', 'AE'];

let _countries: CountryOption[] | null = null;

export function getCountryOptions(): CountryOption[] {
  if (_countries) return _countries;
  const all = getCountries()
    .filter((iso: CountryCode) => isSupportedCountry(iso))
    .map((iso: CountryCode) => {
      const dial = getCountryCallingCode(iso);
      const name = COUNTRY_NAMES[iso] ?? iso;
      return { iso, name, dial, label: `${name} (+${dial})` };
    })
    .sort((a: CountryOption, b: CountryOption) => a.name.localeCompare(b.name));

  const seen = new Set<string>();
  const priority = PRIORITY
    .map((iso) => all.find((c: CountryOption) => c.iso === iso))
    .filter((c): c is CountryOption => !!c && !seen.has(c.iso) && (seen.add(c.iso), true));

  const rest = all.filter((c: CountryOption) => !seen.has(c.iso));
  _countries = [...priority, ...rest];
  return _countries;
}

export interface PhoneParseResult {
  valid: boolean;
  e164: string | null;
  country: CountryCode | null;
  national: string;
  error?: string;
}

/**
 * Parse & validate a phone number.
 * Accepts full international (+…), or national digits with an explicit country.
 */
export function parsePhone(raw: string, defaultCountry: CountryCode = 'NG'): PhoneParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, e164: null, country: null, national: '', error: 'Phone number is required.' };
  }

  const parsed = trimmed.startsWith('+')
    ? parsePhoneNumberFromString(trimmed)
    : parsePhoneNumberFromString(trimmed, defaultCountry);

  if (!parsed) {
    return {
      valid: false,
      e164: null,
      country: defaultCountry,
      national: trimmed,
      error: 'Enter a valid phone number with country code (e.g. +234 803 123 4567).',
    };
  }

  if (!parsed.isValid()) {
    const lengths = parsed.nationalNumber?.length ?? 0;
    return {
      valid: false,
      e164: parsed.number || null,
      country: parsed.country ?? defaultCountry,
      national: parsed.formatNational(),
      error: `Invalid number for ${parsed.country ?? 'this country'} (${lengths} digits). Check length and format.`,
    };
  }

  return {
    valid: true,
    e164: parsed.format('E.164'),
    country: parsed.country ?? defaultCountry,
    national: parsed.formatNational(),
  };
}

/** Legacy helpers kept for call sites — now country-aware. */
export function validateE164(phone: string): boolean {
  return parsePhone(phone).valid;
}

export function toE164(raw: string, defaultCountry: CountryCode = 'NG'): string {
  const result = parsePhone(raw, defaultCountry);
  if (result.e164) return result.e164;
  // Best-effort fallback so callers still get a string
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return '+' + digits;
  return raw.trim();
}

/** Detect country ISO from an E.164 string. */
export function countryFromE164(e164: string, fallback: CountryCode = 'NG'): CountryCode {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed?.country ?? fallback;
}

/** Format as the user types within a given country. */
export function formatAsYouType(raw: string, country: CountryCode): string {
  return new AsYouType(country).input(raw);
}

/** National number digits for a stored E.164 + country. */
export function nationalFromE164(e164: string, country: CountryCode): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (parsed) return parsed.formatNational();
  const dial = getCountryCallingCode(country);
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith(dial)) return digits.slice(dial.length);
  return digits;
}
