import { useState, useEffect, useRef } from "react";

interface ExchangeRateResult {
  rate: number | null;
  loading: boolean;
  error: string | null;
}

export function useExchangeRate(from: string, date: string): ExchangeRateResult {
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (from === "EUR") {
      setRate(1);
      setLoading(false);
      setError(null);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/.netlify/functions/getExchangeRate?from=${encodeURIComponent(from)}&to=EUR&date=${date}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRate(typeof data.rate === "number" ? data.rate : null);
      } catch (e: any) {
        setError(e.message || "Taux indisponible");
        setRate(null);
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [from, date]);

  return { rate, loading, error };
}
