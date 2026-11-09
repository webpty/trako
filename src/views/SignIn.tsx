import { Button, Input, InputOTP, Label, TextField } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { StatusLine } from "../bits";
import { deviceHasOne, signInWithPasskey, supported } from "../passkeys";
import type { Me } from "../../shared/types";

/** The code step has its own address, /code, and the address the code went
    to is remembered for as long as the code lasts, so a browser that reloads
    the page while the code is being copied lands back on the boxes. */
const WAITING = "trako:code-sent";
const CODE_MINUTES = 10;

function waitingFor(): string | null {
  try {
    const kept = JSON.parse(localStorage.getItem(WAITING) ?? "null") as { email?: string; until?: number } | null;
    return kept?.email && (kept.until ?? 0) > Date.now() ? kept.email : null;
  } catch {
    return null;
  }
}

function remember(email: string | null): void {
  try {
    if (email) localStorage.setItem(WAITING, JSON.stringify({ email, until: Date.now() + CODE_MINUTES * 60_000 }));
    else localStorage.removeItem(WAITING);
  } catch {
    // Nothing remembered: a reload goes back to the address step.
  }
}

/** Two steps: an address, then the six digits sent to it. Nothing on this page
    says what the site is. */
export default function SignIn({ onSignedIn }: { onSignedIn: (me: Me, withACode: boolean) => void }) {
  const [step, setStep] = useState<"address" | "code">(() =>
    location.pathname === "/code" && waitingFor() ? "code" : "address",
  );
  const [email, setEmail] = useState(() => waitingFor() ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const boxes = useRef<HTMLInputElement>(null);
  // Only where this device actually holds one: a sheet that opens on nothing
  // reads as a fault.
  const offerPasskey = supported() && deviceHasOne();

  useEffect(() => {
    const locked = step === "code";
    document.documentElement.classList.toggle("no-scroll", locked);
    return () => document.documentElement.classList.remove("no-scroll");
  }, [step]);

  // The page's address follows the step, and the browser's back button takes
  // the code step away again.
  useEffect(() => {
    const wanted = step === "code" ? "/code" : "/";
    if (location.pathname !== wanted && !location.search) history.replaceState(null, "", wanted);
    const back = () => {
      if (location.pathname !== "/code") {
        setStep("address");
        setCode("");
      }
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [step]);

  // A link from a message that did not work comes back here saying so.
  useEffect(() => {
    if (location.search.includes("link-no-good")) {
      setProblem("That link has expired or was already used.");
      history.replaceState(null, "", "/");
    }
  }, []);

  function complain(error: unknown, fallback: string): void {
    setProblem(error instanceof ApiError ? error.message : fallback);
  }

  async function ask() {
    if (!email.trim()) return;
    setBusy(true);
    setProblem("");
    try {
      await api.askForCode(email);
      remember(email.trim());
      history.pushState(null, "", "/code");
      setStep("code");
    } catch (error) {
      complain(error, "The code could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function signIn(value: string) {
    setBusy(true);
    setProblem("");
    try {
      const { me } = await api.signIn(email, value);
      remember(null);
      history.replaceState(null, "", "/");
      onSignedIn(me, true);
    } catch (error) {
      setCode("");
      complain(error, "That did not work.");
      // Back in the boxes, ready for the next paste.
      setTimeout(() => boxes.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }

  async function useAPasskey() {
    setBusy(true);
    setProblem("");
    try {
      const me = await signInWithPasskey();
      if (me) {
        remember(null);
        onSignedIn(me, false);
      }
    } catch (error) {
      complain(error, "That passkey was not recognised.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-5">
      <div className="flex justify-center pb-2">
        <img src="/icon-192.png" alt="" width={88} height={88} className="rounded-[22px]" draggable={false} />
      </div>

      {step === "address" ? (
        <>
          {offerPasskey && (
            <Button fullWidth isPending={busy} onPress={() => void useAPasskey()}>
              Sign in with a passkey
            </Button>
          )}
          <TextField fullWidth name="email" type="email" value={email} onChange={setEmail} isDisabled={busy} variant="secondary">
            <Label>E-mail</Label>
            <Input
              autoComplete="email"
              inputMode="email"
              onKeyDown={(event) => {
                if (event.key === "Enter") void ask();
              }}
            />
          </TextField>
          <Button fullWidth variant={offerPasskey ? "secondary" : "primary"} isPending={busy} onPress={() => void ask()}>
            Send a code
          </Button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-4">
          {/* No saved password is offered here: it is a code, not a password. */}
          {/* Focused as it appears, so a pasted code fills all six boxes. */}
          <InputOTP
            ref={boxes}
            autoFocus
            maxLength={6}
            value={code}
            autoComplete="one-time-code"
            data-1p-ignore
            data-lpignore="true"
            isDisabled={busy}
            onChange={setCode}
            onComplete={(value) => void signIn(value)}
          >
            <InputOTP.Group>
              <InputOTP.Slot index={0} />
              <InputOTP.Slot index={1} />
              <InputOTP.Slot index={2} />
            </InputOTP.Group>
            <InputOTP.Separator />
            <InputOTP.Group>
              <InputOTP.Slot index={3} />
              <InputOTP.Slot index={4} />
              <InputOTP.Slot index={5} />
            </InputOTP.Group>
          </InputOTP>
          <Button
            variant="secondary"
            isDisabled={busy}
            onPress={() => {
              remember(null);
              setCode("");
              setProblem("");
              setStep("address");
            }}
          >
            Use another address
          </Button>
        </div>
      )}
      <StatusLine text={problem} tone="danger" />
    </main>
  );
}
