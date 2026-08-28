# Point-control geometry recipes

History Core may verify historical boundary control locations without claiming the line between them.

Use `geometryType: "MultiPoint"` with `interpolation: "source-vertices"` when an authoritative source publishes geodetic positions for boundary pillars, monuments or named controls but the legal boundary between those controls follows rivers, watersheds, ridges, coastlines or another non-straight rule that has not yet been digitized from its canonical source.

A MultiPoint control network is a verified non-area fragment. It may be attached to a `geometry-verified` metadata-only territory change, but it must never be interpreted as a straight inter-point boundary or as territory-area geometry.
