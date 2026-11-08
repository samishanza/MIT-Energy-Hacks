import { Map, Marker, NavigationControl, ScaleControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// MapLibre v6 needs its worker URL set before the first map is created.
setWorkerUrl(workerUrl);

export { Map, Marker, NavigationControl, ScaleControl };
