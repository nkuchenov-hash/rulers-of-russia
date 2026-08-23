# Historical globe renderer invariants

1. The physical Earth surface and relief layer is permanent. Historical political data is always rendered above it; never replace the physical globe with a flat political raster.
2. Historical state borders are rendered once as one crisp vector line set. Never stack a second Russia outline on top of the world border layer.
3. City labels are zoom-level detail: hidden in the default globe view; capitals appear at country-level zoom; regional cities appear only at close regional zoom.
4. The default camera is focused on Russia at a useful readable scale, not a distant whole-Earth thumbnail.
