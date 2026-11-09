// The whole site once signed in: one app frame with a sidebar. Full width on a
// computer, a menu button and a sliding sidebar on a phone. A page that wants
// controls in the header puts them there through <TopBar>.

import { ArrowRightFromSquare, Car, ChartColumn, Display, Gear, ListUl, MapPin, Moon, Persons, Sun } from "@gravity-ui/icons";
import { AppLayout } from "@heroui-pro/react/app-layout";
import { Navbar } from "@heroui-pro/react/navbar";
import { Segment } from "@heroui-pro/react/segment";
import { Sidebar } from "@heroui-pro/react/sidebar";
import { createContext, useContext, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { applyTheme, readTheme, type Theme } from "./theme";
import { Outlet, useLocation, useNavigate } from "react-router";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { href: "/", label: "Map", icon: MapPin },
  { href: "/records", label: "Raw data", icon: ListUl },
  { href: "/dashboard", label: "Dashboard", icon: ChartColumn },
];

/** The admin's own pages. */
const ADMIN: NavItem[] = [
  { href: "/vehicles", label: "Vehicles", icon: Car },
  { href: "/people", label: "People", icon: Persons },
];

const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: Gear };

function current(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Where a page's own top bar goes: the frame's, so the menu button is always
    beside it. */
const TopBarSlot = createContext<HTMLElement | null>(null);

/** A page's own top bar, drawn into the frame's. */
export function TopBar({ children }: { children: ReactNode }) {
  const slot = useContext(TopBarSlot);
  return slot ? createPortal(children, slot) : null;
}

export function Frame({ isAdmin, onSignOut }: { isAdmin: boolean; onSignOut: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // Every page opens at its top. In braces: newer browsers answer scrollTo
  // with a promise, and an effect that returns anything but a function
  // crashes the page when it is left (9 Nov 2026).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const title = [...NAV, ...ADMIN, SETTINGS].find((item) => current(pathname, item.href))?.label ?? "";

  return (
    <AppLayout
      navigate={(href) => navigate(href)}
      // The page itself scrolls. Holding it in a box the height of the screen
      // left a black strip at the bottom on the iPhone.
      scrollMode="page"
      sidebarCollapsible="offcanvas"
      navbar={
        <Navbar maxWidth="full">
          <Navbar.Header className="relative">
            <AppLayout.MenuToggle variant="secondary" size="md" aria-label="Menu" />
            <Sidebar.Trigger />
            {/* The page's name, with room on the right for its own buttons. */}
            <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{title}</h1>
            <div ref={setSlot} className="flex items-center gap-3" />
          </Navbar.Header>
        </Navbar>
      }
      sidebar={
        <>
          <Sidebar>
            <Contents isAdmin={isAdmin} pathname={pathname} onSignOut={onSignOut} />
          </Sidebar>
          <Sidebar.Mobile>
            <Contents idPrefix="mobile-" isAdmin={isAdmin} pathname={pathname} onSignOut={onSignOut} />
          </Sidebar.Mobile>
        </>
      }
    >
      <TopBarSlot.Provider value={slot}>
        <Outlet />
      </TopBarSlot.Provider>
    </AppLayout>
  );
}

function Contents({
  idPrefix = "",
  isAdmin,
  pathname,
  onSignOut,
}: {
  idPrefix?: string;
  isAdmin: boolean;
  pathname: string;
  onSignOut: () => void;
}) {
  return (
    <>
      <Sidebar.Header className={idPrefix ? "pt-[max(1rem,env(safe-area-inset-top))]" : undefined}>
        {/* The site's icon and name. Set by hand: the sidebar's own rules
            centre and unpad whatever sits in its header. */}
        <div className="flex" style={{ width: "100%", justifyContent: "flex-start", padding: "0.5rem 0.25rem" }}>
          <span className="flex items-center gap-2.5">
            <img alt="" src="/icon-192.png" className="size-7 shrink-0 rounded-[10px]" draggable={false} />
            <span className="wordmark text-xl">trako</span>
          </span>
        </div>
      </Sidebar.Header>
      <Sidebar.Content>
        {/* One block, so every gap in the menu is the same. */}
        <Sidebar.Group>
          <Menu items={isAdmin ? [...NAV, ...ADMIN] : NAV} label="Pages" idPrefix={idPrefix} pathname={pathname} />
        </Sidebar.Group>
      </Sidebar.Content>
      <Sidebar.Footer>
        <ThemeChoice />
        <Sidebar.Menu aria-label="Account">
          {[SETTINGS].map((item) => (
            <Sidebar.MenuItem
              key={item.href}
              href={item.href}
              id={`${idPrefix}${item.href}`}
              isCurrent={current(pathname, item.href)}
              textValue={item.label}
            >
              <Sidebar.MenuIcon>
                <item.icon className="size-4" />
              </Sidebar.MenuIcon>
              <Sidebar.MenuLabel>{item.label}</Sidebar.MenuLabel>
            </Sidebar.MenuItem>
          ))}
          <Sidebar.MenuItem id={`${idPrefix}sign-out`} textValue="Sign out" onAction={onSignOut}>
            <Sidebar.MenuIcon>
              <ArrowRightFromSquare className="size-4" />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>Sign out</Sidebar.MenuLabel>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
        {/* The build's own number, bottom right as on every site. */}
        <p className="px-3 pt-2 pb-1 text-right text-xs tabular-nums text-muted">{__VERSION__}</p>
      </Sidebar.Footer>
    </>
  );
}

function Menu({ items, label, idPrefix, pathname }: { items: NavItem[]; label: string; idPrefix: string; pathname: string }) {
  return (
    <Sidebar.Menu aria-label={label}>
      {items.map((item) => (
        <Sidebar.MenuItem
          key={item.href}
          href={item.href}
          id={`${idPrefix}${item.href}`}
          isCurrent={current(pathname, item.href)}
          textValue={item.label}
        >
          <Sidebar.MenuIcon>
            <item.icon className="size-4" />
          </Sidebar.MenuIcon>
          <Sidebar.MenuLabel>{item.label}</Sidebar.MenuLabel>
        </Sidebar.MenuItem>
      ))}
    </Sidebar.Menu>
  );
}

/** Light, dark, or whatever the device is doing, as one control. The sidebar
    is drawn twice, for a computer and for a phone, so both copies hear of a
    change. */
function ThemeChoice() {
  const [theme, setTheme] = useState<Theme>(readTheme());

  useEffect(() => {
    const heard = () => setTheme(readTheme());
    window.addEventListener("trako:theme", heard);
    return () => window.removeEventListener("trako:theme", heard);
  }, []);

  // Following the device means noticing when it changes its mind.
  useEffect(() => {
    if (theme !== "system") return;
    const watch = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    watch.addEventListener("change", onChange);
    return () => watch.removeEventListener("change", onChange);
  }, [theme]);

  return (
    <div className="flex justify-center px-2 pb-2">
      <Segment
        aria-label="Light or dark"
        className="theme-choice"
        selectedKey={theme}
        size="sm"
        onSelectionChange={(key) => {
          const next = String(key) as Theme;
          applyTheme(next);
          setTheme(next);
          window.dispatchEvent(new Event("trako:theme"));
        }}
      >
        <Segment.Item aria-label="Light" id="light">
          <Sun className="size-4" />
        </Segment.Item>
        <Segment.Item aria-label="Dark" id="dark">
          <Moon className="size-4" />
        </Segment.Item>
        <Segment.Item aria-label="Same as this device" id="system">
          <Display className="size-4" />
        </Segment.Item>
      </Segment>
    </div>
  );
}

/** One page's body: room to breathe on a computer, the edges of the phone on
    a phone. The title is in the frame's own header. */
export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={`flex w-full flex-col gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-6 ${wide ? "max-w-6xl" : "max-w-3xl"}`}
    >
      {children}
    </div>
  );
}


