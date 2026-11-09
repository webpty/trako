// The admin's page: who each vehicle is given to, and which vehicle each
// tracker is in. A tracker connecting for the first time appears here,
// unassigned, until it is put in a vehicle.

import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Card, Picker, StatusLine, VehicleDot } from "../bits";
import { ago, formatDateTime, preferences } from "../format";
import { Page } from "../frame";
import type { Me, Person, Tracker, Vehicle } from "../../shared/types";

export default function Vehicles({ me }: { me: Me }) {
  const how = preferences(me);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [said, setSaid] = useState<{ text: string; tone: "muted" | "danger" }>({ text: "", tone: "muted" });

  const complain = (error: unknown, fallback: string) =>
    setSaid({ text: error instanceof ApiError ? error.message : fallback, tone: "danger" });

  useEffect(() => {
    void Promise.all([api.vehicles(), api.trackers(), api.people()])
      .then(([v, t, p]) => {
        setVehicles(v.vehicles);
        setTrackers(t.trackers);
        setPeople(p.people);
      })
      .catch((error: unknown) => complain(error, "This page could not be read."));
  }, []);

  async function give(vehicle: Vehicle, personId: string) {
    try {
      setVehicles((await api.assignVehicle(vehicle.id, personId || null)).vehicles);
      setSaid({ text: "Saved", tone: "muted" });
    } catch (error) {
      complain(error, "That could not be saved.");
    }
  }

  async function place(tracker: Tracker, vehicleId: string) {
    try {
      const answer = await api.placeTracker(tracker.imei, vehicleId || null);
      setTrackers(answer.trackers);
      setVehicles(answer.vehicles);
      setSaid({ text: "Saved", tone: "muted" });
    } catch (error) {
      complain(error, "That could not be saved.");
    }
  }

  return (
    <Page>
      <StatusLine text={said.text} tone={said.tone} />

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">Trackers</h2>
        {trackers.length === 0 && <p className="text-sm text-muted">None yet</p>}
        {trackers.map((tracker) => (
          <div key={tracker.imei} className="flex flex-col gap-2 border-t border-border pt-3 first-of-type:border-0 first-of-type:pt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium tabular-nums">{tracker.imei}</span>
              <span className="text-sm text-muted" title={formatDateTime(tracker.lastSeenAt, how)}>
                {tracker.records.toLocaleString("en-GB")} records · {ago(tracker.lastSeenAt)}
              </span>
            </div>
            <Picker
              label="Vehicle"
              value={tracker.vehicleId ?? ""}
              items={[{ id: "", label: "Unassigned" }, ...vehicles.map((v) => ({ id: v.id, label: v.name }))]}
              onChange={(value) => void place(tracker, value)}
            />
          </div>
        ))}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">Vehicles</h2>
        {vehicles.map((vehicle) => (
          <div key={vehicle.id} className="flex flex-col gap-2 border-t border-border pt-3 first-of-type:border-0 first-of-type:pt-0">
            <div className="flex items-center gap-2">
              <VehicleDot colour={vehicle.colour} size={18} />
              <span className="min-w-0 flex-1 truncate font-medium">{vehicle.name}</span>
              <span className="text-sm text-muted">{[vehicle.region, vehicle.tracker].filter(Boolean).join(" · ")}</span>
            </div>
            <Picker
              label="Person"
              value={vehicle.personId ?? ""}
              items={[{ id: "", label: "Nobody" }, ...people.map((p) => ({ id: p.id, label: p.name }))]}
              onChange={(value) => void give(vehicle, value)}
            />
          </div>
        ))}
      </Card>
    </Page>
  );
}
