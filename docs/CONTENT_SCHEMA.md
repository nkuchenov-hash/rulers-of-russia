# Content Schema

## Принцип

Исторические данные должны быть отделены от способа отображения.

Один объект события может одновременно использоваться:

- в timeline;
- на карте;
- в Key Events;
- в войнах;
- в сравнении периодов.

## Ruler

Основные поля:

- id / slug;
- canonical name;
- short name;
- titles;
- reign start/end;
- predecessor/successor relations;
- government/polity;
- visual state layers;
- portrait/media references;
- summary;
- module composition;
- source references.

## Event

- id;
- date or date range;
- title;
- summary;
- importance;
- event type;
- people;
- places;
- map geometry reference;
- related ruler(s);
- related modules;
- source references.

## Geography

Территория не хранится картинкой внутри страницы. Страница хранит ссылки на исторические map-state / boundary-state.

## Sources

Каждый содержательный факт должен иметь возможность хранить источник отдельно от UI.
