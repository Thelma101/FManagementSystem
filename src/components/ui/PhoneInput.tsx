import { useMemo, useState } from 'react';
import {
  getCountryOptions,
  parsePhone,
  formatAsYouType,
  countryFromE164,
  nationalFromE164,
  type CountryCode,
} from '../../lib/phone';

interface Props {
  /** Current E.164 value (or empty). */
  value: string;
  onChange: (e164: string, meta: { country: CountryCode; valid: boolean; error?: string }) => void;
  defaultCountry?: CountryCode;
  id?: string;
  autoFocus?: boolean;
}

export default function PhoneInput({
  value,
  onChange,
  defaultCountry = 'NG',
  id,
  autoFocus,
}: Props) {
  const countries = useMemo(() => getCountryOptions(), []);
  const initialCountry = value ? countryFromE164(value, defaultCountry) : defaultCountry;
  const [country, setCountry] = useState<CountryCode>(initialCountry);
  const [national, setNational] = useState(() =>
    value ? nationalFromE164(value, initialCountry) : ''
  );
  const [touched, setTouched] = useState(false);

  const result = parsePhone(national, country);

  function emit(nextNational: string, nextCountry: CountryCode) {
    const parsed = parsePhone(nextNational, nextCountry);
    onChange(parsed.e164 ?? '', {
      country: parsed.country ?? nextCountry,
      valid: parsed.valid,
      error: parsed.error,
    });
  }

  function handleCountryChange(iso: CountryCode) {
    setCountry(iso);
    // Re-format national digits under the new country
    const digits = national.replace(/\D/g, '');
    const formatted = formatAsYouType(digits, iso);
    setNational(formatted);
    emit(formatted, iso);
  }

  function handleNationalChange(raw: string) {
    // If user pastes a full international number, detect country
    if (raw.trim().startsWith('+')) {
      const parsed = parsePhone(raw);
      if (parsed.country) {
        setCountry(parsed.country);
        const nat = parsed.national || raw;
        setNational(nat);
        emit(raw, parsed.country);
        return;
      }
    }
    const formatted = formatAsYouType(raw, country);
    setNational(formatted);
    emit(formatted, country);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <select
          className="input"
          value={country}
          onChange={(e) => handleCountryChange(e.target.value as CountryCode)}
          aria-label="Country code"
          style={{ width: '160px', flexShrink: 0, fontSize: '13px' }}
        >
          {countries.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          className="input mono"
          value={national}
          onChange={(e) => handleNationalChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Phone number"
          autoFocus={autoFocus}
          required
          style={{ flex: 1 }}
          inputMode="tel"
          autoComplete="tel-national"
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '4px' }}>
        <p style={{ fontSize: '11.5px', color: 'var(--text-3)' }}>
          {result.valid && result.e164
            ? `Saves as ${result.e164}`
            : 'Select country, then enter the local number — or paste +…'}
        </p>
        {touched && !result.valid && result.error && (
          <p className="field-error" style={{ marginTop: 0, textAlign: 'right' }}>{result.error}</p>
        )}
      </div>
    </div>
  );
}
