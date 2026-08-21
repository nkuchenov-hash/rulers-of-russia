# Правители России

Интерактивная историческая система о правителях России.

## Текущий этап

Проект находится на этапе Core Design System + page architecture. Главная страница проекта — канонический интерактивный skeleton будущей страницы правителя. Это не отдельный mockup: она собрана из тех же компонентов, Historical Visual State tokens и module contracts, которые должны использоваться в реальном сайте.

### Канонические слои

- `src/components/core-system/CoreDesignSystemSkeleton.tsx` — живая структура страницы.
- `src/design-system/components/BackgroundModule.tsx` — внешний фон/ambient layer как самостоятельный Core-модуль.
- `src/modules/core/modulePassports.ts` — единый реестр внутреннего устройства модулей для Core Inspector.
- `src/historical-state/` — Historical Visual State resolver и визуальные слои эпох/периодов/правлений.
- `src/design-system/tokens/base.css` — базовые semantic tokens.
- `src/app/page.tsx` — рендерит каноническую систему напрямую.

Временные standalone HTML-preview удалены. Параллельных копий интерфейса в проекте быть не должно.

## Запуск

```bash
npm install
npm run dev
```

Проверки:

```bash
npm run typecheck
npm run build
```

## Live deployment

`.github/workflows/pages.yml` собирает непосредственно Next.js-проект и публикует статический export на GitHub Pages. Live deployment не имеет отдельной кодовой базы.
