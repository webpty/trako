// The admin's SIM cards: each one's number and ICCID, and the tracker and
// vehicle it is in, as the trackers report it.

import { TrashBin } from "@gravity-ui/icons";
import { Button, Input, Label, TextField } from "@heroui/react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Card, Confirm, StatusLine, VehicleDot } from "../bits";
import { Page } from "../frame";
import type { Sim, Vehicle } from "../../shared/types";

export default function Sims() {
  const [sims, setSims] = useState<Sim[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [msisdn, setMsisdn] = useState("");
  const [iccid, setIccid] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; tone: "muted" | "danger" }>({ text: "", tone: "muted" });
  const [removing, setRemoving] = useState<Sim | null>(null);

  const complain = (error: unknown, fallback: string) =>
    setSaid({ text: error instanceof ApiError ? error.message : fallback, tone: "danger" });

  useEffect(() => {
    void Promise.all([api.sims(), api.vehicles()])
      .then(([s, v]) => {
        setSims(s.sims);
        setVehicles(v.vehicles);
      })
      .catch((error: unknown) => complain(error, "The list could not be read."));
  }, []);

  async function add() {
    setBusy(true);
    setSaid({ text: "", tone: "muted" });
    try {
      setSims((await api.addSim(iccid, msisdn)).sims);
      setMsisdn("");
      setIccid("");
      setSaid({ text: "Added", tone: "muted" });
    } catch (error) {
      complain(error, "That SIM could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(sim: Sim) {
    setBusy(true);
    try {
      setSims((await api.removeSim(sim.iccid)).sims);
      setSaid({ text: "Removed", tone: "muted" });
    } catch (error) {
      complain(error, "That SIM could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Card className="flex flex-col gap-3">
        {sims.map((sim) => {
          const vehicle = vehicles.find((v) => v.id === sim.vehicleId);
          return (
            <div key={sim.iccid} className="flex items-center gap-3 border-t border-border pt-3 first:border-0 first:pt-0">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium tabular-nums">{sim.msisdn}</span>
                <span className="text-sm text-muted tabular-nums">{sim.iccid}</span>
              </div>
              <div className="flex min-w-0 flex-col items-end text-sm">
                {vehicle && (
                  <span className="flex items-center gap-2">
                    <VehicleDot colour={vehicle.colour} />
                    <span className="truncate">{vehicle.name}</span>
                  </span>
                )}
                {sim.imei && <span className="text-muted tabular-nums">{sim.imei}</span>}
              </div>
              <Button isIconOnly variant="secondary" aria-label={`Remove ${sim.msisdn}`} isDisabled={busy} onPress={() => setRemoving(sim)}>
                <TrashBin />
              </Button>
            </div>
          );
        })}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">Add a SIM card</h2>
        <TextField fullWidth name="msisdn" value={msisdn} onChange={setMsisdn} variant="secondary">
          <Label>Number</Label>
          <Input autoComplete="off" inputMode="numeric" />
        </TextField>
        <TextField fullWidth name="iccid" value={iccid} onChange={setIccid} variant="secondary">
          <Label>ICCID</Label>
          <Input autoComplete="off" inputMode="numeric" />
        </TextField>
        <div className="flex items-center gap-3">
          <Button isPending={busy} isDisabled={!msisdn.trim() || !iccid.trim()} onPress={() => void add()}>
            Add
          </Button>
          <StatusLine text={said.text} tone={said.tone} />
        </div>
      </Card>

      <Confirm
        isOpen={!!removing}
        title={`Remove ${removing?.msisdn ?? ""}?`}
        confirmLabel="Remove"
        onConfirm={() => {
          const sim = removing;
          setRemoving(null);
          if (sim) void remove(sim);
        }}
        onClose={() => setRemoving(null)}
      />
    </Page>
  );
}
