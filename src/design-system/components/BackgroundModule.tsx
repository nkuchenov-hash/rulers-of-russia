import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export function BackgroundModule({
  children,
  style,
  inspectorEnabled,
  onInspect
}: {
  children: ReactNode;
  style?: CSSProperties;
  inspectorEnabled: boolean;
  onInspect: () => void;
}) {
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!inspectorEnabled || event.target !== event.currentTarget) return;
    onInspect();
  }

  return (
    <div
      className={`background-module ${inspectorEnabled ? 'is-inspectable' : ''}`}
      style={style}
      data-module-id="background"
      onClick={handleClick}
    >
      {children}
    </div>
  );
}
