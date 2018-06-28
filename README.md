# Mapbox GL JS + Pelias Geocoding API

Pelias Geocoding API plugin for Mapbox GL JS maps.

## Features

-   Remove duplicates based on coordinates. (`opts.removeDuplicates`: Boolean)
-   Choose Fly-to or Jump-to when result is selected. (`opts.flyTo`: `true`, `false` or `hybrid`)
-   Fly-to or Jump-to using the best zoom level.
-   Show errors from pelias.
-   Choose custom url. (`opts.url`: String)
-   Choose custom placeholder. (`opts.placeholder`: String)
-   Add custom parameters to add in requests. (`opts.params`: Object)
-   Choose specific sources for requests (`oa`, `osm`, `wof`, `gn`). (`opts.sources`: Array or String)
-   Send request only when you use Enter key. (`opts.onSubmitOnly`: Boolean)
-   Add marker to show results. The marker must be in the sprites of your style. (`opts.marker`: Object `{ icon: 'marker-15', anchor: 'bottom' }`)
-   0 dependencies.

## [GitHub Pages](https://joxit.github.io/pelias-mapbox-gl-js) and [Live Demo](https://joxit.github.io/pelias-mapbox-gl-js/demo)
