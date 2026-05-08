const PREFIX = 'dealer-settlement-manager:v1';

export const storageKey = (slice: string) => `${PREFIX}:${slice}`;

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Storage parse failed for ${key}, using fallback.`, error);
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch (error) {
    console.warn(`Storage save failed for ${key}.`, error);
  }
}

export function clearAppStorage() {
  const keys = ['statements','transactions','dealerPayments','dealerPaymentAllocations','employeeCommissions','employeePayments','employeePaymentAllocations','role'];
  keys.forEach((k) => localStorage.removeItem(storageKey(k)));
}
