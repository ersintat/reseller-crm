export interface ExchangeRateLookupResult {
  rate: number;
  source: 'Frankfurter';
  sourceDate: string;
  requestedDate: string;
  baseCurrency: string;
  quoteCurrency: 'USD';
}

interface FrankfurterRatesResponse {
  date?: string;
  base?: string;
  quote?: string;
  rates?: Record<string, number>;
  quotes?: Record<string, number>;
  rate?: number;
  message?: string;
}

const FRANKFURTER_API_BASE = 'https://api.frankfurter.dev/v2';

export async function fetchExchangeRateToUsd(
  currency: string,
  date: string,
): Promise<ExchangeRateLookupResult> {
  const baseCurrency = currency.toUpperCase();
  const requestedDate = date || new Date().toISOString().slice(0, 10);

  if (baseCurrency === 'USD') {
    return {
      rate: 1,
      source: 'Frankfurter',
      sourceDate: requestedDate,
      requestedDate,
      baseCurrency,
      quoteCurrency: 'USD',
    };
  }

  if (!requestedDate) {
    throw new Error('A transaction date is required before fetching an exchange rate.');
  }

  const params = new URLSearchParams({
    date: requestedDate,
    base: baseCurrency,
    quotes: 'USD',
  });

  const response = await fetch(`${FRANKFURTER_API_BASE}/rates?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  const payload = (await response.json().catch(() => ({}))) as
    | FrankfurterRatesResponse
    | FrankfurterRatesResponse[];
  const row = Array.isArray(payload) ? payload[0] : payload;

  if (!response.ok) {
    throw new Error((Array.isArray(payload) ? undefined : payload.message) || 'Could not fetch exchange rate.');
  }

  const rate = Number(row?.rates?.USD ?? row?.quotes?.USD ?? row?.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Could not fetch exchange rate.');
  }

  return {
    rate,
    source: 'Frankfurter',
    sourceDate: row?.date || requestedDate,
    requestedDate,
    baseCurrency,
    quoteCurrency: 'USD',
  };
}
