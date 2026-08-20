# Module System — рабочая основа

> Статус: архитектура утверждаема; **состав каждого модуля ещё нужно обсудить отдельно**.

## Что такое модуль

Модуль — самостоятельный смысловой блок страницы правителя, который:

- имеет чёткую историческую функцию;
- получает структурированные данные;
- умеет существовать или отсутствовать;
- имеет desktop/mobile поведение;
- использует общую дизайн-систему;
- реагирует на Historical Visual State через токены, а не через отдельные версии компонента.

## Базовый контракт модуля

Каждый модуль должен описывать:

1. purpose — зачем он нужен;
2. data contract — какие данные получает;
3. hierarchy — что внутри главное/вторичное;
4. slots — допустимые композиционные области;
5. variants — только смысловые варианты;
6. responsive behavior;
7. interaction model;
8. loading/empty/error;
9. relation to timeline;
10. relation to map;
11. historical-state hooks — какие визуальные токены разрешено использовать;
12. editorial limits — сколько текста/элементов модуль способен показать без деградации.

## Предварительный реестр для обсуждения

Это НЕ финальный список:

- Ruler Hero
- Reign Snapshot
- Historical Context
- Territory / Map
- Key Events
- Reforms / Internal Policy
- Foreign Policy / Diplomacy
- Wars & Campaigns
- State / Institutions
- Society & Everyday Life
- Economy
- Culture / Science / Architecture
- Personal Dimension
- Quotes / Documents
- Gallery / Artifacts
- Controversies / Historiography
- Legacy / Consequences
- Succession / Transition

## Следующий этап

Для каждого модуля отдельно определить:

- обязательные элементы;
- необязательные элементы;
- максимальную плотность;
- визуальную доминанту;
- взаимодействие с общей хронологией;
- когда модуль вообще не показывается;
- что происходит на мобильном;
- какие типы исторического материала он поддерживает.
