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
          <p style={{ fontSize: 16, lineHeight: 1.6 }}>Визуализация не загрузилась. Попробуйте повторить загрузку карты. Если ошибка сохранится, перезагрузите страницу. Исторические границы не будут заменены вымышленными контурами.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <button type="button" onClick={() => this.setState((previous) => ({ failed: false, retryKey: previous.retryKey + 1 }))} style={{ cursor: 'pointer', minHeight: 48, minWidth: 180, flex: '1 1 180px', padding: '12px 16px', borderRadius: 10, border: '1px solid #d6bb7b', background: '#d6bb7b', color: '#10252b', fontSize: 16, fontWeight: 600 }}>Повторить загрузку</button>
            <button type="button" onClick={() => window.location.reload()} style={{ cursor: 'pointer', minHeight: 48, minWidth: 180, flex: '1 1 180px', padding: '12px 16px', borderRadius: 10, border: '1px solid #d6bb7b', background: 'transparent', color: '#f4ead3', fontSize: 16, fontWeight: 600 }}>Перезагрузить страницу</button>
          </div>
        </div>
      </main>
    );
  }
}
