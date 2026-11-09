// The admin's page: who can sign in. Being on this list is the only way in.

import { TrashBin } from "@gravity-ui/icons";
import { Button, Input, Label, TextField } from "@heroui/react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Card, Confirm, Face, StatusLine } from "../bits";
import { Page } from "../frame";
import type { Me, Person } from "../../shared/types";

export default function People({ me }: { me: Me }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; tone: "muted" | "danger" }>({ text: "", tone: "muted" });
  const [removing, setRemoving] = useState<Person | null>(null);

  const complain = (error: unknown, fallback: string) =>
    setSaid({ text: error instanceof ApiError ? error.message : fallback, tone: "danger" });

  useEffect(() => {
    void api
      .people()
      .then(({ people: found }) => setPeople(found))
      .catch((error: unknown) => complain(error, "The list could not be read."));
  }, []);

  async function add() {
    setBusy(true);
    setSaid({ text: "", tone: "muted" });
    try {
      setPeople((await api.addPerson(name, email)).people);
      setName("");
      setEmail("");
      setSaid({ text: "Added", tone: "muted" });
    } catch (error) {
      complain(error, "That person could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(person: Person) {
    setBusy(true);
    try {
      setPeople((await api.removePerson(person.id)).people);
      setSaid({ text: "Removed", tone: "muted" });
    } catch (error) {
      complain(error, "That person could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Card className="flex flex-col gap-3">
        {people.map((person) => (
          <div key={person.id} className="flex items-center gap-3">
            <Face person={person} size={40} photoUrl={person.id === me.id && me.photoKey ? `/api/me/photo?v=${encodeURIComponent(me.photoKey)}` : undefined} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{person.name}</span>
              <span className="truncate text-sm text-muted">{person.email}</span>
            </div>
            {person.role === "admin" ? (
              <span className="text-sm text-muted">Admin</span>
            ) : (
              <Button isIconOnly variant="secondary" aria-label={`Remove ${person.name}`} isDisabled={busy} onPress={() => setRemoving(person)}>
                <TrashBin />
              </Button>
            )}
          </div>
        ))}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">Add a person</h2>
        <TextField fullWidth name="name" value={name} onChange={setName} variant="secondary">
          <Label>Name</Label>
          <Input autoComplete="off" />
        </TextField>
        <TextField fullWidth name="email" type="email" value={email} onChange={setEmail} variant="secondary">
          <Label>E-mail</Label>
          <Input autoComplete="off" inputMode="email" />
        </TextField>
        <div className="flex items-center gap-3">
          <Button isPending={busy} isDisabled={!name.trim() || !email.trim()} onPress={() => void add()}>
            Add
          </Button>
          <StatusLine text={said.text} tone={said.tone} />
        </div>
      </Card>

      <Confirm
        isOpen={!!removing}
        title={`Remove ${removing?.name ?? ""}?`}
        confirmLabel="Remove"
        onConfirm={() => {
          const who = removing;
          setRemoving(null);
          if (who) void remove(who);
        }}
        onClose={() => setRemoving(null)}
      />
    </Page>
  );
}
