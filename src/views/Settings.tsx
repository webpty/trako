import { Button, Input, Label, Switch, TextField } from "@heroui/react";
import { TrashBin } from "@gravity-ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { Card, Confirm, Face, Picker, StatusLine } from "../bits";
import { preferences, sample, zones } from "../format";
import { Page } from "../frame";
import { browserLanguage, countries, LANGUAGES, languageName } from "../locale";
import { addPasskey, deviceName, listPasskeys, removePasskey, supported, type KnownPasskey } from "../passkeys";
import { PhotoCropper } from "../photo";
import type { DateOrder, Me } from "../../shared/types";

const DATE_ORDERS: DateOrder[] = ["dmmmy", "dmy", "mdy", "ymd"];

export default function Settings({ me, onSaved }: { me: Me; onSaved: (me: Me) => void }) {
  const [name, setName] = useState(me.name);
  const [country, setCountry] = useState(me.country ?? "");
  // Until a language is chosen here, the browser's stands in for it.
  const [language, setLanguage] = useState((me.languageChosen && me.language ? me.language : browserLanguage()).slice(0, 2));
  const [languageTouched, setLanguageTouched] = useState(false);
  const [dateOrder, setDateOrder] = useState<DateOrder>(me.dateOrder);
  const [clock24h, setClock24h] = useState(me.clock24h);
  const [timeZone, setTimeZone] = useState(me.timeZone);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<{ text: string; tone: "muted" | "danger" }>({ text: "", tone: "muted" });
  const [keys, setKeys] = useState<KnownPasskey[]>([]);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keySaid, setKeySaid] = useState<{ text: string; tone: "muted" | "danger" }>({ text: "", tone: "muted" });
  const [picked, setPicked] = useState<File | null>(null);
  const [asking, setAsking] = useState<{ kind: "photo" } | { kind: "passkey"; id: string; label: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const how = preferences({ ...me, dateOrder, clock24h, timeZone, language });
  const countryList = useMemo(() => countries(language), [language]);
  const languages = LANGUAGES.includes(language) ? LANGUAGES : [...LANGUAGES, language];

  useEffect(() => {
    if (supported()) void listPasskeys().then(setKeys);
  }, []);

  async function save() {
    setSaving(true);
    setSaid({ text: "", tone: "muted" });
    try {
      const { me: fresh } = await api.saveSettings({
        name,
        country: country || null,
        // Sent only once it has been chosen here, so a default stays a default.
        ...(languageTouched || me.languageChosen ? { language } : {}),
        dateOrder,
        clock24h,
        timeZone,
      });
      onSaved(fresh);
      setSaid({ text: "Saved", tone: "muted" });
    } catch (error) {
      setSaid({ text: error instanceof ApiError ? error.message : "That could not be saved.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function usePhoto(blob: Blob) {
    setPicked(null);
    try {
      onSaved(await api.savePhoto(blob));
      setSaid({ text: "Photo changed", tone: "muted" });
    } catch (error) {
      setSaid({ text: error instanceof ApiError ? error.message : "That photo could not be saved.", tone: "danger" });
    }
  }

  async function dropPhoto() {
    try {
      onSaved((await api.removePhoto()).me);
    } catch {
      setSaid({ text: "That photo could not be removed.", tone: "danger" });
    }
  }

  async function addOne() {
    setKeyBusy(true);
    setKeySaid({ text: "", tone: "muted" });
    try {
      const outcome = await addPasskey(deviceName());
      if (outcome === "already-here") setKeySaid({ text: "This device already has one.", tone: "muted" });
      else if (outcome === "added") {
        setKeys(await listPasskeys());
        setKeySaid({ text: "Passkey added", tone: "muted" });
      }
    } catch (error) {
      setKeySaid({ text: error instanceof Error ? error.message : "That passkey could not be added.", tone: "danger" });
    } finally {
      setKeyBusy(false);
    }
  }

  async function removeOne(id: string) {
    setKeyBusy(true);
    try {
      await removePasskey(id);
      setKeys(await listPasskeys());
    } catch {
      setKeySaid({ text: "That passkey could not be removed.", tone: "danger" });
    } finally {
      setKeyBusy(false);
    }
  }

  return (
    <Page>
      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">You</h2>
        <div className="flex items-center gap-4">
          <Face person={me} size={72} photoUrl={me.photoKey ? `/api/me/photo?v=${encodeURIComponent(me.photoKey)}` : undefined} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onPress={() => fileInput.current?.click()}>
              Change photo
            </Button>
            {me.photoKey && (
              <Button variant="danger-soft" onPress={() => setAsking({ kind: "photo" })}>
                Remove photo
              </Button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) setPicked(file);
            }}
          />
        </div>

        <TextField fullWidth name="name" value={name} onChange={setName} variant="secondary">
          <Label>Name</Label>
          <Input autoComplete="name" />
        </TextField>

        <TextField fullWidth isDisabled name="email" value={me.email} variant="secondary">
          <Label>E-mail</Label>
          <Input />
        </TextField>

        <Picker
          label="Country"
          value={country}
          items={[{ id: "", label: "Not set" }, ...countryList.map((c) => ({ id: c.code, label: c.name }))]}
          onChange={setCountry}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">Language and time</h2>
        <Picker
          label="Language"
          value={language}
          items={languages.map((code) => ({ id: code, label: languageName(code) }))}
          onChange={(value) => {
            setLanguage(value);
            setLanguageTouched(true);
          }}
        />
        <Picker
          label="Date"
          value={dateOrder}
          items={DATE_ORDERS.map((order) => ({ id: order, label: sample(order, how) }))}
          onChange={(value) => setDateOrder(value as DateOrder)}
        />
        <Picker
          label="Time zone"
          value={timeZone}
          items={zones().map((zone) => ({ id: zone, label: zone.replace(/_/g, " ") }))}
          onChange={setTimeZone}
        />
        <Switch className="w-full" isSelected={clock24h} onChange={setClock24h}>
          <Switch.Content className="flex w-full items-center justify-between">
            24-hour clock
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </Card>

      <div className="flex items-center gap-3">
        <Button isPending={saving} onPress={() => void save()}>
          Save
        </Button>
        <StatusLine text={said.text} tone={said.tone} />
      </div>

      {supported() && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Passkeys</h2>
          {keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between gap-3">
              <span className="truncate">{key.label ?? "Passkey"}</span>
              <Button
                isIconOnly
                variant="secondary"
                aria-label="Remove"
                isDisabled={keyBusy}
                onPress={() => setAsking({ kind: "passkey", id: key.id, label: key.label ?? "this passkey" })}
              >
                <TrashBin />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <Button variant="secondary" isPending={keyBusy} onPress={() => void addOne()}>
              Add a passkey
            </Button>
            <StatusLine text={keySaid.text} tone={keySaid.tone} />
          </div>
        </Card>
      )}

      <Confirm
        isOpen={!!asking}
        title={asking?.kind === "passkey" ? `Remove ${asking.label}?` : "Remove your photo?"}
        confirmLabel="Remove"
        onConfirm={() => {
          const was = asking;
          setAsking(null);
          if (was?.kind === "photo") void dropPhoto();
          if (was?.kind === "passkey") void removeOne(was.id);
        }}
        onClose={() => setAsking(null)}
      />

      {picked && <PhotoCropper file={picked} onClose={() => setPicked(null)} onCut={(blob) => void usePhoto(blob)} />}
    </Page>
  );
}
