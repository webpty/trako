import { Spinner, Toast } from "@heroui/react";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { api } from "./api";
import { Frame } from "./frame";
import { deviceHasOne, supported } from "./passkeys";
import Dashboard from "./views/Dashboard";
import MapPage from "./views/MapPage";
import { PasskeyOffer } from "./views/passkey-offer";
import People from "./views/People";
import RawData from "./views/RawData";
import Settings from "./views/Settings";
import SignIn from "./views/SignIn";
import Vehicles from "./views/Vehicles";
import type { Me } from "../shared/types";

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  // Asked once, straight after six digits, and only where this device holds
  // none: the moment the quick way back in is most obviously worth it.
  const [offerPasskey, setOfferPasskey] = useState(false);

  useEffect(() => {
    void api
      .state()
      .then((state) => setMe(state.me))
      .catch(() => {
        // Nothing answering. The sign-in page is next, and says so when used.
      })
      .finally(() => setReady(true));
  }, []);

  return (
    <>
      <Toast.Provider placement="top" />
      {inside()}
      {offerPasskey && <PasskeyOffer onDone={() => setOfferPasskey(false)} />}
    </>
  );

  function inside() {
    if (!ready) {
      return (
        <main className="flex min-h-dvh items-center justify-center">
          <Spinner />
        </main>
      );
    }

    if (!me) {
      return (
        <SignIn
          onSignedIn={(person, withACode) => {
            setMe(person);
            if (withACode && supported() && !deviceHasOne()) setOfferPasskey(true);
          }}
        />
      );
    }

    const admin = me.role === "admin";
    return (
      <BrowserRouter>
        <Routes>
          <Route element={<Frame isAdmin={admin} onSignOut={() => void api.signOut().finally(() => setMe(null))} />}>
            <Route path="/" element={<MapPage me={me} />} />
            <Route path="/records" element={<RawData me={me} />} />
            <Route path="/dashboard" element={<Dashboard me={me} />} />
            {admin && <Route path="/vehicles" element={<Vehicles me={me} />} />}
            {admin && <Route path="/people" element={<People me={me} />} />}
            <Route path="/settings" element={<Settings me={me} onSaved={setMe} />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }
}
