import type { RulerRecord } from '@/content/rulers/types';
import { HistoricalStateShell } from './HistoricalStateShell';

export function RulerPage({ ruler }: { ruler: RulerRecord }) {
  return (
    <HistoricalStateShell state={ruler.visualState}>
      <main className="ruler-page">
        <header className="ruler-hero-placeholder">
          <p>{ruler.polity}</p>
          <h1>{ruler.canonicalName}</h1>
          <p>{ruler.reign.start} — {ruler.reign.end}</p>
        </header>
        <section className="architecture-note">
          <strong>Module composition is provisional.</strong>
          <p>Следующий этап — согласовать составляющие каждого модуля до полноценной экранной реализации.</p>
        </section>
      </main>
    </HistoricalStateShell>
  );
}
