// The vehicles' figures added up: for all of them or one, over all time or
// the last stretch of it.

import { DataGrid, type DataGridColumn } from "@heroui-pro/react/data-grid";
import { Segment } from "@heroui-pro/react/segment";
import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Card, Picker, StatusLine, VehicleDot } from "../bits";
import { WaitingOverlay } from "../components/waiting";
import { Page } from "../frame";
import type { Dashboard as DashboardData, DashboardPeriod, Figures, Me, Vehicle } from "../../shared/types";

const PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: "all", label: "All" },
  { id: "year", label: "This year" },
  { id: "90", label: "3 months" },
  { id: "30", label: "1 month" },
];

const KEEP = "trako:dashboard";

function readKept(): { vehicle: string; period: DashboardPeriod } {
  try {
    const kept = JSON.parse(localStorage.getItem(KEEP) ?? "{}") as { vehicle?: string; period?: DashboardPeriod };
    return {
      vehicle: typeof kept.vehicle === "string" ? kept.vehicle : "all",
      period: PERIODS.some((p) => p.id === kept.period) ? kept.period! : "all",
    };
  } catch {
    return { vehicle: "all", period: "all" };
  }
}

export default function Dashboard({ me }: { me: Me }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicle, setVehicle] = useState(() => readKept().vehicle);
  const [period, setPeriod] = useState<DashboardPeriod>(() => readKept().period);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(KEEP, JSON.stringify({ vehicle, period }));
    } catch {
      // Nothing remembered; the page still works.
    }
  }, [vehicle, period]);

  useEffect(() => {
    void api
      .vehicles()
      .then(({ vehicles: found }) => {
        setVehicles(found);
        if (vehicle !== "all" && !found.some((v) => v.id === vehicle)) setVehicle("all");
      })
      .catch((error: unknown) => setProblem(error instanceof ApiError ? error.message : "The vehicles could not be read."));
    // Once: the choice is checked against the list when it arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .dashboard(vehicle, period)
      .then((answer) => {
        if (cancelled) return;
        setData(answer);
        setProblem("");
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(error instanceof ApiError ? error.message : "The figures could not be read.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicle, period]);

  const total = data?.total;
  const byVehicle = (data?.vehicles ?? []).map((row) => ({ ...row, vehicle: vehicles.find((v) => v.id === row.vehicleId) }));

  const columns: DataGridColumn<(typeof byVehicle)[number]>[] = [
    {
      id: "vehicle",
      header: "Vehicle",
      isRowHeader: true,
      pinned: "start",
      width: 260,
      minWidth: 220,
      cell: (row) => (
        <span className="flex items-center gap-2">
          <VehicleDot colour={row.vehicle?.colour ?? "#999"} />
          <span className="truncate">{row.vehicle?.name ?? row.vehicleId}</span>
        </span>
      ),
    },
    { id: "distance", header: "Distance", align: "end", width: 120, cell: (row) => km(row.distanceM) },
    { id: "driving", header: "Driving time", align: "end", width: 130, cell: (row) => duration(row.drivingS) },
    { id: "max", header: "Max speed", align: "end", width: 120, cell: (row) => `${row.maxSpeed} km/h` },
    { id: "average", header: "Average speed", align: "end", width: 140, cell: (row) => average(row) },
    { id: "trips", header: "Trips", align: "end", width: 90, cell: (row) => String(row.trips) },
    { id: "fuel", header: "Fuel used", align: "end", width: 110, cell: (row) => litres(row.fuelUsedL) },
    { id: "days", header: "Days driven", align: "end", width: 120, cell: (row) => String(row.days) },
  ];

  return (
    <Page wide>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <Picker
            label="Vehicle"
            value={vehicle}
            items={[{ id: "all", label: "All vehicles" }, ...vehicles.map((v) => ({ id: v.id, label: v.name }))]}
            onChange={setVehicle}
          />
        </div>
        <Segment aria-label="Period" selectedKey={period} onSelectionChange={(key) => setPeriod(String(key) as DashboardPeriod)}>
          {PERIODS.map((p) => (
            <Segment.Item key={p.id} id={p.id}>
              {p.label}
            </Segment.Item>
          ))}
        </Segment>
      </div>
      <StatusLine text={problem} tone="danger" />

      <div className="relative grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <WaitingOverlay ground="page" on={loading} />
        <Stat label="Distance" value={total ? km(total.distanceM) : ""} />
        <Stat label="Driving time" value={total ? duration(total.drivingS) : ""} />
        <Stat label="Max speed" value={total ? `${total.maxSpeed} km/h` : ""} />
        <Stat label="Average speed" value={total ? average(total) : ""} />
        <Stat label="Trips" value={total ? String(total.trips) : ""} />
        <Stat label="Fuel used" value={total ? litres(total.fuelUsedL) : ""} />
      </div>

      {vehicle === "all" && byVehicle.length > 0 && (
        <DataGrid
          aria-label="Each vehicle"
          data={byVehicle}
          columns={columns}
          getRowId={(row) => row.vehicleId}
          contentClassName="min-w-[1080px]"
        />
      )}
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      <span className="min-h-8 text-2xl font-semibold tabular-nums">{value}</span>
    </Card>
  );
}

function km(metres: number): string {
  return `${(metres / 1000).toLocaleString("en-GB", { maximumFractionDigits: metres < 100_000 ? 1 : 0 })} km`;
}

function duration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours.toLocaleString("en-GB")} h ${minutes} min` : `${minutes} min`;
}

/** Distance over time spent driving. */
function average(f: Pick<Figures, "distanceM" | "drivingS">): string {
  return f.drivingS > 0 ? `${Math.round(f.distanceM / 1000 / (f.drivingS / 3600))} km/h` : "0 km/h";
}

function litres(value: number | null): string {
  return value === null ? "–" : `${value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} L`;
}
