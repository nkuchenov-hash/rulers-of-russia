import type { CSSProperties } from 'react';

export interface HeroGradientStop {
  at: number;
  opacity: number;
}

export interface HeroGradientSettings {
  enabled: boolean;
  direction: 'to-right' | 'to-left';
  widthPercent: number;
  blurPx: number;
  tintToken: '--surface-primary' | '--ambient-deep' | '--page-bg';
  stops: HeroGradientStop[];
  edgeSoftnessPercent: number;
}

export const defaultHeroGradientSettings: HeroGradientSettings = {
  enabled: true,
  direction: 'to-right',
  widthPercent: 58,
  blurPx: 8,
  tintToken: '--surface-primary',
  stops: [
    { at: 0, opacity: 0.96 },
    { at: 34, opacity: 0.82 },
    { at: 66, opacity: 0.42 },
    { at: 100, opacity: 0 }
  ],
  edgeSoftnessPercent: 12
};

function alphaPercent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function heroGradientStyle(settings: HeroGradientSettings): CSSProperties {
  if (!settings.enabled) return { display: 'none' };

  const direction = settings.direction === 'to-left' ? '270deg' : '90deg';
  const color = `var(${settings.tintToken})`;
  const stops = settings.stops
    .map((stop) => `color-mix(in srgb, ${color} ${alphaPercent(stop.opacity)}, transparent) ${stop.at}%`)
    .join(', ');

  return {
    width: `${settings.widthPercent}%`,
    background: `linear-gradient(${direction}, ${stops})`,
    backdropFilter: settings.blurPx > 0 ? `blur(${settings.blurPx}px)` : undefined,
    WebkitBackdropFilter: settings.blurPx > 0 ? `blur(${settings.blurPx}px)` : undefined,
    '--hero-gradient-edge-softness': `${settings.edgeSoftnessPercent}%`
  } as CSSProperties;
}

export const heroImageProductionFlow = [
  'ChatGPT или редактор формирует визуальный бриф для одной цельной Hero-картинки: правитель, среда, свет и эпоха уже являются одной композицией.',
  'ChatGPT создаёт отдельный файл изображения. Файл не встраивается напрямую в код страницы.',
  'Файл сохраняется в Медиатеке и получает статус «на проверке».',
  'Кандидат показывается именно в реальном Hero: на всю ширину блока, под настоящим градиентом, текстом, метаданными и карточкой ключевых событий.',
  'Человек проверяет композицию и выбирает «Одобрить» или «Отклонить».',
  'Только одобренный asset может быть записан в hero.imageAssetId и использоваться публично.'
] as const;
