'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean; retryKey: number };

export class TerritoryRenderBoundary extends Component<Props, State> {
  state: State = { failed: false, retryKey: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Historical territory map failed to render', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return <div key={this.state.retryKey} style={{ display: "contents" }}>{this.props.children}</div>;
    return (
      <main role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#071821', color: '#f4ead3', textAlign: 'center' }}>
        <div style={{ maxWidth: 460 }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 500, fontSize: 'clamp(24px, 5vw, 34px)' }}>Не удалось открыть карту</h1>
          <p style={{ fontSize: 16, lineHeight: 1.6 }}>Визуализация не загрузилась. Попробуйте перезагрузить страницу. Исторические границы не будут заменены вымышленными контурами.</p>
          <button type="button" onClick={() => this.setState((previous) => ({ failed: false, retryKey: previous.retryKey + 1 }))} style={{ cursor: "pointer", padding: "12px 20px", borderRadius: 10, border: "1px solid #d6bb7b", background: "#d6bb7b", color: "#10252b", fontSize: 16, fontWeight: 600, marginRight: 8 }}>Повторить загрузку</button>
          <button type="button" onClick={() => window.location.reload()} style={{ cursor: 'pointer', padding: '12px 20px', borderRadius: 10, border: '1px solid #d6bb7b', background: '#d6bb7b', color: '#10252b', fontSize: 16, fontWeight: 600 }}>Перезагрузить карту</button>
        </div>
      </main>
    );
  }
}
