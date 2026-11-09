// Every record a vehicle's tracker has sent, newest first, as it arrived.

import { DataGrid, type DataGridColumn } from "@heroui-pro/react/data-grid";
import { Spinner } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import { Picker, StatusLine } from "../bits";
import { formatDateTime, preferences } from "../format";
import { Page } from "../frame";
import { IO, ioName, readable } from "../../shared/io";
import type { Me, StoredRecord, Tracker, Vehicle } from "../../shared/types";

/** The values that already have a column of their own. */
const IN_COLUMNS = new Set<string>([IO.ignition, IO.fuelPct, IO.fuelTenthsL, IO.odometer, IO.externalMv].map(String));

export default function RawData({ me }: { me: Me }) {
  const how = preferences(me);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loose, setLoose] = useState<Tracker[]>([]);
  const [chosen, setChosen] = useState("");
  const [rows, setRows] = useState<StoredRecord[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const { vehicles: found } = await api.vehicles();
        setVehicles(found);
        // The admin can also read a tracker that is in no vehicle yet.
        const trackers = me.role === "admin" ? (await api.trackers()).trackers.filter((t) => !t.vehicleId) : [];
        setLoose(trackers);
        setChosen((was) => was || (found[0] ? `v:${found[0].id}` : trackers[0] ? `t:${trackers[0].imei}` : ""));
      } catch (error) {
        setProblem(error instanceof ApiError ? error.message : "The vehicles could not be read.");
      }
    })();
  }, [me.role]);

  const which = useMemo(
    () => (chosen.startsWith("v:") ? { vehicle: chosen.slice(2) } : chosen.startsWith("t:") ? { imei: chosen.slice(2) } : null),
    [chosen],
  );

  const load = useCallback(
    async (before: number | null) => {
      if (!which) return;
      setLoading(true);
      try {
        const page = await api.records(which, before);
        setRows((old) => (before ? [...old, ...page.records] : page.records));
        setMore(page.more);
        setProblem("");
      } catch (error) {
        setProblem(error instanceof ApiError ? error.message : "The records could not be read.");
      } finally {
        setLoading(false);
      }
    },
    [which],
  );

  useEffect(() => {
    setRows([]);
    void load(null);
  }, [load]);

  const columns: DataGridColumn<StoredRecord>[] = [
    { id: "at", header: "Time", isRowHeader: true, pinned: "start", width: 170, minWidth: 170, cell: (r) => formatDateTime(r.at, how) },
    { id: "speed", header: "Speed", align: "end", width: 90, cell: (r) => `${r.speed} km/h` },
    { id: "heading", header: "Heading", align: "end", width: 90, cell: (r) => `${r.heading}°` },
    { id: "lat", header: "Latitude", align: "end", width: 110, cell: (r) => r.lat.toFixed(6) },
    { id: "lon", header: "Longitude", align: "end", width: 110, cell: (r) => r.lon.toFixed(6) },
    { id: "altitude", header: "Altitude", align: "end", width: 90, cell: (r) => `${r.altitude} m` },
    { id: "satellites", header: "Satellites", align: "end", width: 100, cell: (r) => String(r.satellites) },
    { id: "ignition", header: "Ignition", width: 90, cell: (r) => (r.ignition === null ? "" : r.ignition ? "On" : "Off") },
    { id: "fuel", header: "Fuel", align: "end", width: 110, cell: (r) => fuel(r) },
    { id: "odometer", header: "Odometer", align: "end", width: 120, cell: (r) => (r.odometerM === null ? "" : `${(r.odometerM / 1000).toFixed(1)} km`) },
    { id: "voltage", header: "Voltage", align: "end", width: 90, cell: (r) => (r.voltageMv === null ? "" : `${(r.voltageMv / 1000).toFixed(2)} V`) },
    {
      id: "io",
      header: "Other values",
      width: 520,
      cell: (r) => (
        <span className="text-xs text-muted">
          {Object.entries(r.io)
            .filter(([id]) => !IN_COLUMNS.has(id))
            .map(([id, value]) => `${ioName(id)} ${readable(id, value)}`)
            .join(" · ")}
        </span>
      ),
    },
    { id: "imei", header: "IMEI", width: 160, cell: (r) => r.imei },
    { id: "received", header: "Received", width: 170, cell: (r) => formatDateTime(r.receivedAt, how) },
  ];

  return (
    <Page wide>
      <div className="max-w-md">
        <Picker
          label="Vehicle"
          value={chosen}
          items={[
            ...vehicles.map((v) => ({ id: `v:${v.id}`, label: v.name })),
            ...loose.map((t) => ({ id: `t:${t.imei}`, label: `Unassigned ${t.imei}` })),
          ]}
          onChange={setChosen}
        />
      </div>
      <StatusLine text={problem} tone="danger" />
      <DataGrid
        aria-label="Records"
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        stickyHeader
        contentClassName="min-w-[2100px]"
        scrollContainerClassName="max-h-[calc(100dvh-14rem)] overflow-auto"
        onLoadMore={more && !loading ? () => void load(rows[rows.length - 1]?.id ?? null) : undefined}
        isLoadingMore={loading}
        loadMoreContent={<Spinner size="sm" />}
        renderEmptyState={() => <span className="text-muted">{loading ? "" : "No records"}</span>}
      />
    </Page>
  );
}

function fuel(r: StoredRecord): string {
  const parts = [r.fuelPct === null ? "" : `${r.fuelPct} %`, r.fuelL === null ? "" : `${r.fuelL.toFixed(1)} L`].filter(Boolean);
  return parts.join(" · ");
}
