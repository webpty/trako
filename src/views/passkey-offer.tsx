import { Button, Modal, toast } from "@heroui/react";
import { useState } from "react";
import { addPasskey, deviceName } from "../passkeys";

/** Offered once, straight after a sign-in with six digits, and only on a device
    that holds no passkey for this site yet. */
export function PasskeyOffer({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const outcome = await addPasskey(deviceName());
      if (outcome === "added") toast.success("Passkey added");
      onDone();
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "That passkey could not be added.");
      setBusy(false);
    }
  }

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && onDone()}>
      <Modal.Container placement="auto">
        <Modal.Dialog className="sm:max-w-[340px]">
          <Modal.Header>
            <Modal.Heading>Sign in faster next time?</Modal.Heading>
          </Modal.Header>
          <Modal.Footer className="flex flex-row justify-end gap-2">
            <Button variant="secondary" isDisabled={busy} onPress={onDone}>
              Not now
            </Button>
            <Button isPending={busy} onPress={() => void add()}>
              Add a passkey
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
