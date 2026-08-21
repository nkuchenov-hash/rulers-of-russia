# Ruler Page Layout Contract

The ruler page is a constraint layout, not a collection of independently positioned rectangles.

## Structural hierarchy

```text
Page Surface
├─ Header
├─ Workspace
│  ├─ Historical Rail
│  └─ Main Content
│     ├─ Hero
│     ├─ Page Tabs
│     ├─ Primary Row
│     │  ├─ Territory
│     │  ├─ Map
│     │  └─ Facts
│     └─ Thematic Row
│        ├─ Card 1
│        ├─ Card 2
│        ├─ Card 3
│        └─ Card 4
└─ Reign Timeline — full Page Surface width
```

## Rules

1. Structural siblings consume one shared parent container.
2. Increasing one sibling's width reduces the remaining width available to its siblings.
3. A structural size change must reflow the page; it must not create accidental overlap.
4. Vertical modules remain in normal document flow. Changing a module height pushes the modules below it.
5. The Primary Row has no independent minimum height. Its height is resolved from Territory, Map and Facts. If all three become shorter, the Thematic Row must move up immediately.
6. Internal media must obey the explicit height of its parent module. In particular, Map Canvas may not preserve a hidden minimum height after the Map module is made shorter.
7. Hero has one external height contract. Hero image, gradient and content layers obey that container instead of owning independent minimum heights.
8. Reign Timeline is a page-wide band. Its visual width is the full Page Surface, not only Main Content.
9. Studio may request width and height in `px`, `%`, or `auto`, but the displayed `Actual` size is the resolved result after parent/layout constraints.
10. Intentional visual layering is allowed only inside a component (for example Hero artwork + gradient + content), never as a substitute for structural page layout.
11. Mobile/tablet breakpoints may stack structural siblings instead of shrinking them beyond usable widths.
