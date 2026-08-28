'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { RulerQuote } from '@/content/rulers/pageModel';

export function RulerQuoteRotator({
  quotes,
  rotationSeconds,
  inspectorEnabled,
  onInspectQuote
}: {
  quotes: RulerQuote[];
  rotationSeconds: number;
  inspectorEnabled: boolean;
  onInspectQuote: (event: MouseEvent<Element>) => void;
}) {
  const safeQuotes = useMemo(() => quotes.filter((quote) => quote.text.trim().length > 0), [quotes]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (safeQuotes.length <= 1 || paused || inspectorEnabled) return;
    const interval = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % safeQuotes.length);
    }, Math.max(2, rotationSeconds) * 1000);
    return () => window.clearInterval(interval);
  }, [safeQuotes.length, rotationSeconds, paused, inspectorEnabled]);

  useEffect(() => {
    if (activeIndex >= safeQuotes.length) setActiveIndex(0);
  }, [activeIndex, safeQuotes.length]);

  if (!safeQuotes.length) return null;

  const quote = safeQuotes[activeIndex] ?? safeQuotes[0];

  return (
    <div
      className="ruler-quote-rotator"
      data-element-id="key-event-row"
      onClick={onInspectQuote}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="ruler-quote-copy" key={quote.id}>
        <span className="ruler-quote-mark" aria-hidden="true">“</span>
        <blockquote>{quote.text}</blockquote>
        {(quote.context || quote.sourceLabel) && (
          <footer>
            {quote.context && <span>{quote.context}</span>}
            {quote.sourceLabel && <cite>{quote.sourceLabel}</cite>}
          </footer>
        )}
      </div>

      {safeQuotes.length > 1 && (
        <div className="ruler-quote-controls" aria-label="Переключение цитат">
          <button
            type="button"
            aria-label="Предыдущая цитата"
            onClick={(event) => {
              event.stopPropagation();
              setActiveIndex((index) => (index - 1 + safeQuotes.length) % safeQuotes.length);
            }}
          >
            ←
          </button>
          <div className="ruler-quote-dots">
            {safeQuotes.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={index === activeIndex ? 'active' : ''}
                aria-label={`Цитата ${index + 1}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveIndex(index);
                }}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Следующая цитата"
            onClick={(event) => {
              event.stopPropagation();
              setActiveIndex((index) => (index + 1) % safeQuotes.length);
            }}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
