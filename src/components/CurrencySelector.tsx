import React, { useState, useRef, useEffect } from "react";
import { ALL_CURRENCIES, getCurrencyInfo } from "../currencyUtils";

interface CurrencySelectorProps {
  value: string;
  preferred: string[];
  onChange: (currency: string) => void;
}

const CurrencySelector: React.FC<CurrencySelectorProps> = ({ value, preferred, onChange }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  const filtered = query.trim()
    ? ALL_CURRENCIES.filter(
        (c) =>
          c.code.toLowerCase().includes(query.toLowerCase()) ||
          c.label.toLowerCase().includes(query.toLowerCase())
      )
    : ALL_CURRENCIES.filter((c) => !preferred.includes(c.code));

  const current = getCurrencyInfo(value);

  return (
    <div className="currency-selector">
      {/* Favoris en haut */}
      <div className="currency-preferred-row">
        {preferred.map((code) => {
          const info = getCurrencyInfo(code);
          return (
            <button
              key={code}
              type="button"
              className={`currency-preferred-btn ${value === code ? "currency-preferred-btn--active" : ""}`}
              onClick={() => onChange(code)}
            >
              <span className="currency-flag">{info.flag}</span>
              <span className="currency-code">{code}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`currency-preferred-btn ${!preferred.includes(value) ? "currency-preferred-btn--active" : ""}`}
          onClick={() => setSearchOpen((v) => !v)}
          title="Autre devise"
        >
          <span className="currency-flag">🔍</span>
          <span className="currency-code">{!preferred.includes(value) ? current.code : "Autre"}</span>
        </button>
      </div>

      {/* Dropdown recherche toutes devises */}
      {searchOpen && (
        <div className="currency-search-dropdown" ref={searchRef}>
          <input
            autoFocus
            type="text"
            className="currency-search-input"
            placeholder="Rechercher (USD, HKD, BTC…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="currency-search-list">
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                className={`currency-search-item ${value === c.code ? "currency-search-item--active" : ""}`}
                onClick={() => {
                  onChange(c.code);
                  setSearchOpen(false);
                  setQuery("");
                }}
              >
                <span className="currency-flag">{c.flag}</span>
                <span className="currency-code">{c.code}</span>
                <span className="currency-label">{c.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="currency-search-empty">Aucune devise trouvée</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CurrencySelector;
