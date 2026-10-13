/**
 * Application-wide Currency and Number Formatting Utility.
 * 
 * Default Currency: Indian Rupees (₹ / INR) with en-IN formatting.
 * Examples:
 *   formatCurrency(5000) -> "₹5,000"
 *   formatCurrency(125000) -> "₹1,25,000"
 *   formatCurrency(1250000) -> "₹12,50,000"
 */

import { useState, useEffect } from 'react';

export const SUPPORTED_CURRENCIES = [
  { code: 'INR', symbol: '₹', locale: 'en-IN', label: 'Indian Rupee (₹ / INR)' },
  { code: 'USD', symbol: '$', locale: 'en-US', label: 'US Dollar ($ / USD)' },
  { code: 'EUR', symbol: '€', locale: 'de-DE', label: 'Euro (€ / EUR)' },
  { code: 'GBP', symbol: '£', locale: 'en-GB', label: 'British Pound (£ / GBP)' },
  { code: 'CAD', symbol: 'CA$', locale: 'en-CA', label: 'Canadian Dollar (CA$ / CAD)' },
  { code: 'AUD', symbol: 'A$', locale: 'en-AU', label: 'Australian Dollar (A$ / AUD)' }
];

export const DEFAULT_CURRENCY = 'INR';
const STORAGE_KEY = 'app_currency';
const CURRENCY_CHANGE_EVENT = 'app_currency_changed';

/**
 * Get the currently configured application currency code.
 * Defaults to 'INR' for all fresh installs and first-time users.
 */
export function getStoredCurrency() {
  if (typeof window === 'undefined') return DEFAULT_CURRENCY;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_CURRENCIES.some(c => c.code === saved)) {
      return saved;
    }
  } catch (e) {
    console.debug('Could not read stored currency from localStorage:', e);
  }
  return DEFAULT_CURRENCY;
}

/**
 * Persist the selected currency code to localStorage and notify listeners.
 */
export function setStoredCurrency(code) {
  if (typeof window === 'undefined') return;
  const valid = SUPPORTED_CURRENCIES.some(c => c.code === code) ? code : DEFAULT_CURRENCY;
  try {
    localStorage.setItem(STORAGE_KEY, valid);
  } catch (e) {
    console.debug('Could not write currency to localStorage:', e);
  }
  window.dispatchEvent(new CustomEvent(CURRENCY_CHANGE_EVENT, { detail: valid }));
}

/**
 * Get the symbol for a given currency code.
 */
export function getCurrencySymbol(currencyCode) {
  const code = currencyCode || getStoredCurrency();
  const found = SUPPORTED_CURRENCIES.find(c => c.code === code);
  return found ? found.symbol : (code === 'INR' ? '₹' : code);
}

/**
 * Format a numeric monetary amount using locale-aware formatting.
 * 
 * @param {number|string|null|undefined} amount - The numeric or string amount.
 * @param {string} [currencyCode] - Optional override. If omitted, uses active application currency.
 * @param {object} [options] - Optional formatting overrides (e.g. showDecimals).
 * @returns {string} - Formatted currency string, e.g. "₹1,25,000".
 */
export function formatCurrency(amount, currencyCode, options = {}) {
  if (amount === null || amount === undefined || amount === '') {
    return '';
  }

  const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) {
    return String(amount);
  }

  const code = currencyCode || getStoredCurrency();
  const meta = SUPPORTED_CURRENCIES.find(c => c.code === code) || { locale: 'en-IN', code: 'INR' };

  try {
    const formatter = new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: meta.code,
      maximumFractionDigits: options.showDecimals ? 2 : 0,
      minimumFractionDigits: options.showDecimals ? 2 : 0
    });
    return formatter.format(num);
  } catch (e) {
    // Fallback if Intl format fails
    const sym = getCurrencySymbol(code);
    return `${sym}${num.toLocaleString(meta.locale)}`;
  }
}

/**
 * React hook to access and subscribe to active application currency.
 */
export function useCurrency() {
  const [currency, setCurrencyState] = useState(getStoredCurrency);

  useEffect(() => {
    const handleCurrencyChange = (e) => {
      if (e.detail) {
        setCurrencyState(e.detail);
      } else {
        setCurrencyState(getStoredCurrency());
      }
    };

    window.addEventListener(CURRENCY_CHANGE_EVENT, handleCurrencyChange);
    window.addEventListener('storage', handleCurrencyChange);
    return () => {
      window.removeEventListener(CURRENCY_CHANGE_EVENT, handleCurrencyChange);
      window.removeEventListener('storage', handleCurrencyChange);
    };
  }, []);

  const changeCurrency = (code) => {
    setStoredCurrency(code);
    setCurrencyState(code);
  };

  const format = (amount, overrideCode, options) => {
    return formatCurrency(amount, overrideCode || currency, options);
  };

  return {
    currency,
    setCurrency: changeCurrency,
    formatCurrency: format,
    symbol: getCurrencySymbol(currency),
    supportedCurrencies: SUPPORTED_CURRENCIES
  };
}

export default {
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
  getStoredCurrency,
  setStoredCurrency,
  getCurrencySymbol,
  formatCurrency,
  useCurrency
};
