// Where the vehicles have been, on a map of the world.
//
// Each vehicle is a dot where it last was in the chosen time, with its track
// behind it in its own colour. The panel, as on beary's map, switches vehicles
// on and off one at a time and folds away; with one vehicle shown alone, the
// map closes in on its tracks.

import { Eye, EyeSlash } from "@gravity-ui/icons";
import { Button, Card } from "@heroui/react";
import { CheckboxButtonGroup } from "@heroui-pro/react/checkbox-button-group";
import { LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre draws tiles in a web worker and, left to itself, looks for the
// worker's file next to its own module, which no bundle provides. Vite bundles
// the worker as its own file here and hands back the address.
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { FeatureCollection } from "geojson";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { VehicleDot } from "../bits";
import { DayPicker } from "../components/day-picker";
import { ALL_PERIODS, isPeriodId, periodFrom, periodTo, type PeriodId } from "../components/period-chooser";
import { useBeside } from "../components/phone-top";
import { WaitingOverlay } from "../components/waiting";
import { formatDateTime, preferences } from "../format";
import { TopBar } from "../frame";
import type { MapTrack, Me, Vehicle } from "../../shared/types";

setWorkerUrl(mapWorkerUrl);

// Quiet ground, so the vehicles and their tracks carry all the colour.
const STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

function styleNow(): string {
  return document.documentElement.classList.contains("dark") ? STYLES.dark : STYLES.light;
}

type Frame = { period: PeriodId; from: string; to: string };

/** What the map looked like when it was left, kept in the browser. */
const KEEP = "trako:map";
const FIRST_PERIOD: PeriodId = "30";
type Kept = { period: PeriodId; hidden: string[]; controls?: boolean };

function readKept(): Kept {
  try {
    const kept = JSON.parse(localStorage.getItem(KEEP) ?? "{}") as Partial<Kept>;
    return {
      period: isPeriodId(kept.period) ? kept.period : FIRST_PERIOD,
      controls: kept.controls !== false,
      hidden: Array.isArray(kept.hidden) ? kept.hidden.filter((id) => typeof id === "string") : [],
    };
  } catch {
    return { period: FIRST_PERIOD, hidden: [] };
  }
}

function keep(part: Partial<Kept>) {
  try {
    localStorage.setItem(KEEP, JSON.stringify({ ...readKept(), ...part }));
  } catch {
    // A browser that keeps nothing still shows the map.
  }
}

/** Which period and vehicles a view was last framed for. */
function viewKey(frame: Frame, hidden: Set<string>): string {
  return `${frame.period}|${frame.from}|${[...hidden].sort().join(",")}`;
}

function dotMarker(colour: string): HTMLElement {
  const element = document.createElement("div");
  element.style.cssText = [
    "width:18px",
    "height:18px",
    "border-radius:9999px",
    `background:${colour}`,
    "border:3px solid #fff",
    "box-shadow:0 1px 4px rgba(0,0,0,.4)",
  ].join(";");
  return element;
}

export default function MapPage({ me }: { me: Me }) {
  const beside = useBeside();
  const how = preferences(me);
  const box = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const framedFor = useRef<string | null>(null);
  const [styled, setStyled] = useState(0);
  const [controls, setControls] = useState(() => readKept().controls !== false);
  useEffect(() => {
    keep({ controls });
  }, [controls]);
  const [frame, setFrame] = useState<Frame>(() => ({ period: readKept().period, from: "", to: "" }));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(readKept().hidden));
  useEffect(() => {
    keep({ period: frame.period, hidden: [...hidden] });
  }, [frame.period, hidden]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tracks, setTracks] = useState<MapTrack[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .vehicles()
      .then(({ vehicles: found }) => setVehicles(found))
      .catch((error: unknown) => setProblem(error instanceof ApiError ? error.message : "The vehicles could not be read."));
  }, []);

  // The map itself, made once, its style following the theme.
  useEffect(() => {
    if (!box.current) return;
    // Until there are tracks to show: Panama, Europe and Japan together on a
    // computer, clear of the panel; Europe on a phone (David, 9 Nov 2026).
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const made = new MapLibreMap({
      container: box.current,
      style: styleNow(),
      ...(wide
        ? {
            bounds: [
              [-84, 4],
              [146, 60],
            ] as [[number, number], [number, number]],
            fitBoundsOptions: { padding: { top: 40, bottom: 40, right: 40, left: 424 } },
          }
        : { center: [10, 50] as [number, number], zoom: 3 }),
      // No credits line: the site is private (David, 9 Nov 2026).
      attributionControl: false,
    });
    map.current = made;
    made.on("style.load", () => setStyled((n) => n + 1));
    made.on("error", (event) => console.error("map", event.error));
    let current = styleNow();
    const watch = new MutationObserver(() => {
      const next = styleNow();
      if (next === current) return;
      current = next;
      made.setStyle(next);
    });
    watch.observe(document.documentElement, { attributeFilter: ["class"], attributes: true });
    return () => {
      watch.disconnect();
      for (const one of markers.current) one.remove();
      markers.current = [];
      made.remove();
      map.current = null;
    };
  }, []);

  // The tracks in the chosen time.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .map(
        frame.from ? `${frame.from}T00:00:00.000Z` : periodFrom(frame.period),
        frame.to ? `${frame.to}T23:59:59.999Z` : periodTo(frame.period),
      )
      .then((answer) => {
        if (cancelled) return;
        setTracks(answer.tracks);
        setProblem(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(error instanceof ApiError ? error.message : "The map could not be read.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [frame]);

  const colourOf = (id: string) => vehicles.find((v) => v.id === id)?.colour ?? "#1e40af";
  const nameOf = (id: string) => vehicles.find((v) => v.id === id)?.name ?? "";

  // Lines and dots, drawn again whenever anything changes and after the style
  // is swapped, which wipes whatever was on it.
  useEffect(() => {
    const made = map.current;
    if (!made || styled === 0 || !tracks) return;
    const shown = tracks.filter((track) => !hidden.has(track.vehicleId));

    const lines: FeatureCollection = {
      type: "FeatureCollection",
      features: shown
        .filter((track) => track.points.length > 1)
        .map((track) => ({
          type: "Feature",
          properties: { colour: colourOf(track.vehicleId) },
          geometry: { type: "LineString", coordinates: track.points },
        })),
    };
    const source = made.getSource("tracks") as GeoJSONSource | undefined;
    if (source) source.setData(lines);
    else {
      made.addSource("tracks", { type: "geojson", data: lines });
      made.addLayer({
        id: "track-lines",
        type: "line",
        source: "tracks",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "colour"], "line-width": 3, "line-opacity": 0.8 },
      });
    }

    for (const one of markers.current) one.remove();
    markers.current = [];
    for (const track of shown) {
      if (!track.last) continue;
      const element = dotMarker(colourOf(track.vehicleId));
      element.title = `${nameOf(track.vehicleId)}\n${formatDateTime(track.last.at, how)}`;
      markers.current.push(new Marker({ element }).setLngLat([track.last.lon, track.last.lat]).addTo(made));
    }
    // colourOf, nameOf and how follow vehicles and me, both listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, hidden, styled, vehicles, me]);

  // The view takes in whatever is shown, clear of the panel, when the time or
  // the vehicles change. One vehicle alone is closed in on.
  useEffect(() => {
    const made = map.current;
    if (!made || !tracks) return;
    const wanted = viewKey(frame, hidden);
    if (framedFor.current === wanted) return;
    framedFor.current = wanted;
    const shown = tracks.filter((track) => !hidden.has(track.vehicleId));
    const bounds = new LngLatBounds();
    let any = false;
    for (const track of shown) {
      for (const point of track.points) {
        bounds.extend(point);
        any = true;
      }
    }
    if (!any) return;
    const width = made.getContainer().clientWidth;
    const height = made.getContainer().clientHeight;
    const card = legend.current;
    const padding =
      width >= 720
        ? { top: 48, bottom: 48, right: 48, left: Math.min(width / 2, (card?.offsetWidth ?? 0) + 64) }
        : { top: Math.min(height / 2, (card?.offsetHeight ?? 0) + 40), bottom: 32, right: 32, left: 32 };
    // One vehicle with a track, alone or because it is the only one that
    // moved, is closed in on; several are seen together.
    const moving = shown.filter((track) => track.points.length > 0).length;
    made.fitBounds(bounds, { padding, maxZoom: moving === 1 ? 16 : 9, duration: 500 });
  }, [tracks, hidden, frame]);

  const toggle = (
    <Button
      aria-label={controls ? "Hide the controls" : "Show the controls"}
      isIconOnly={!beside}
      onPress={() => setControls((open) => !open)}
      size="sm"
      variant="secondary"
    >
      {controls ? <EyeSlash className={beside ? "mr-1.5 size-4" : "size-4"} /> : <Eye className={beside ? "mr-1.5 size-4" : "size-4"} />}
      {beside ? (controls ? "Hide controls" : "Show controls") : null}
    </Button>
  );

  return (
    <div className="map-page relative w-full overflow-hidden">
      {/* Placed inline: the map's own stylesheet makes its box relative, which
          would otherwise leave it no height at all. */}
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      <WaitingOverlay ground="page" on={loading} />
      {/* On a phone the control that folds the panel away is up in the header,
          and the panel is only drawn while it is open. */}
      {beside ? null : <TopBar>{toggle}</TopBar>}
      <div
        className={`absolute top-4 left-4 z-40 max-w-[calc(100%-32px)] ${controls ? "w-[360px]" : "w-auto"} ${beside || controls ? "" : "hidden"}`}
        ref={legend}
      >
        <Card>
          <Card.Content className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              {beside ? toggle : null}
              {controls ? (
                <Button
                  isDisabled={vehicles.every((vehicle) => hidden.has(vehicle.id))}
                  onPress={() => setHidden(new Set(vehicles.map((vehicle) => vehicle.id)))}
                  size="sm"
                >
                  Clear all
                </Button>
              ) : null}
            </div>
            {controls ? (
              <>
                <CheckboxButtonGroup
                  aria-label="Vehicles shown"
                  className="flex flex-col gap-2 [--checkbox-button-group-item-radius:10px]"
                  onChange={(values) => {
                    const shown = new Set(values);
                    setHidden(new Set(vehicles.filter((v) => !shown.has(v.id)).map((v) => v.id)));
                  }}
                  value={vehicles.filter((vehicle) => !hidden.has(vehicle.id)).map((vehicle) => vehicle.id)}
                  variant="secondary"
                >
                  {vehicles.map((vehicle) => (
                    <CheckboxButtonGroup.Item aria-label={`Show ${vehicle.name}`} className="w-full" key={vehicle.id} value={vehicle.id}>
                      <CheckboxButtonGroup.Indicator />
                      <CheckboxButtonGroup.ItemContent className="flex-row items-center gap-3">
                        <VehicleDot colour={vehicle.colour} size={20} />
                        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">{vehicle.name}</span>
                      </CheckboxButtonGroup.ItemContent>
                    </CheckboxButtonGroup.Item>
                  ))}
                </CheckboxButtonGroup>
                <div className="grid grid-cols-3 gap-1.5">
                  {ALL_PERIODS.map((option) => (
                    <Button
                      fullWidth
                      key={option.id}
                      onPress={() => setFrame({ period: option.id, from: "", to: "" })}
                      size="sm"
                      variant={frame.period === option.id ? "primary" : "secondary"}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                {/* One day of it. The buttons above clear it. */}
                <DayPicker
                  className="w-full"
                  label="One day"
                  onChange={(day) => setFrame({ period: frame.period, from: day, to: day })}
                  person={how}
                  value={frame.from === frame.to ? frame.from : ""}
                />
                <p className="reserve-line text-danger text-xs">{problem ?? ""}</p>
              </>
            ) : null}
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
