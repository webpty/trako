// The small pieces every screen uses, so a card, a face or a confirmation looks
// the same wherever it turns up.

import { Button, ListBox, Modal } from "@heroui/react";
import { CellSelect } from "@heroui-pro/react/cell-select";
import type { ReactNode } from "react";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`surface surface--default p-4 ${className}`}>{children}</section>;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/** Gradients for faces without a photo, chosen by the name so a person keeps
    theirs. */
const GRADIENTS = [
  ["#6366f1", "#1e3a8a"],
  ["#ec4899", "#7c3aed"],
  ["#06b6d4", "#1e40af"],
  ["#f472b6", "#be185d"],
  ["#a78bfa", "#4c1d95"],
];

function gradient(name: string): string {
  const n = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % GRADIENTS.length;
  return `linear-gradient(140deg, ${GRADIENTS[n][0]}, ${GRADIENTS[n][1]})`;
}

/** A person's round face: their photo, or their initials. */
export function Face({ person, size = 40, photoUrl }: { person: { name: string; photoKey: string | null }; size?: number; photoUrl?: string }) {
  if (person.photoKey && photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        draggable={false}
        className="shrink-0 select-none rounded-full border-2 border-border object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center rounded-full border-2 border-border font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: gradient(person.name) }}
    >
      {initials(person.name)}
    </span>
  );
}

/** A vehicle's round mark in its own colour. */
export function VehicleDot({ colour, size = 14 }: { colour: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full border-2 border-white shadow-sm"
      style={{ width: size, height: size, background: colour }}
    />
  );
}

export interface Choice {
  id: string;
  label: string;
}

export function Picker({
  label,
  value,
  items,
  onChange,
  isDisabled,
}: {
  label: string;
  value: string;
  items: Choice[];
  onChange: (value: string) => void;
  isDisabled?: boolean;
}) {
  return (
    <CellSelect aria-label={label} value={value} isDisabled={isDisabled} onChange={(key) => onChange(String(key ?? ""))}>
      <CellSelect.Trigger>
        <CellSelect.Label>{label}</CellSelect.Label>
        <CellSelect.Value />
        <CellSelect.Indicator />
      </CellSelect.Trigger>
      <CellSelect.Popover>
        <ListBox>
          {items.map((item) => (
            <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
              {item.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </CellSelect.Popover>
    </CellSelect>
  );
}

/** Asked in a window of its own before anything is removed. */
export function Confirm({
  isOpen,
  title,
  confirmLabel,
  onConfirm,
  onClose,
  isBusy,
}: {
  isOpen: boolean;
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  isBusy?: boolean;
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container placement="auto">
        <Modal.Dialog className="sm:max-w-[360px]">
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Footer className="flex flex-row justify-end gap-2">
            <Button variant="secondary" onPress={onClose}>
              Keep
            </Button>
            <Button variant="danger" isPending={isBusy} onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

/** A line under a control that is always there, empty or not, so nothing
    moves when it fills. */
export function StatusLine({ text, tone = "muted" }: { text: string; tone?: "muted" | "danger" }) {
  return (
    <p role="status" className={`reserve-line text-sm ${tone === "danger" ? "text-danger" : "text-muted"}`}>
      {text}
    </p>
  );
}
