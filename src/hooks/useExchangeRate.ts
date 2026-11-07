import { useState, useEffect, useRef } from "react";
import { getHistoricalExchangeRate } from "../exchangeRate";

interface ExchangeRateResult {
  rate: number | null;
  loading: boolean;
  error: string | null;
}

/** Taux `from` → `to` (par défaut EUR) à une date donnée ; fonctionne en local (Frankfurter) et en prod (Netlify, repli Frankfurter). */
export function useExchangeRate(from: string, date: string, to: string = "EUR"): ExchangeRateResult {
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (from === to) {
      setRate(1);
      setLoading(false);
      setError(null);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    let cancelled = false;

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await getHistoricalExchangeRate(from, to, date);
        if (!cancelled) setRate(typeof r === "number" ? r : null);
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || "Taux indisponible");
          setRate(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [from, to, date]);

  return { rate, loading, error };
}
