"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";
import { useCommandMode } from "./command-mode-context";
import {
  IconChevronLeft,
  IconChevronRight,
  IconDashboard,
  IconQuizzes,
  IconSettings,
} from "./sidebar-icons";

const SIDEBAR_COLLAPSED_KEY = "recall:sidebarCollapsed:v1";

function navLinkActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/quizzes" && pathname.startsWith("/quiz")) return true;
  return false;
}

function NavLink({
  href,
  label,
  icon,
  collapsed,
  pathname,
  badgeCount,
  badgeAriaDetail,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  collapsed: boolean;
  pathname: string;
  /** Shown when > 0 (e.g. incomplete scheduled quizzes). */
  badgeCount?: number;
  /** Appended to aria-label / title when badge is shown (collapsed nav). */
  badgeAriaDetail?: string;
}) {
  const active = navLinkActive(pathname, href);
  const showBadge = badgeCount != null && badgeCount > 0;
  const collapsedLabel =
    collapsed && showBadge && badgeAriaDetail
      ? `${label}, ${badgeAriaDetail}`
      : collapsed
        ? label
        : undefined;
  return (
    <Link
      href={href}
      className={`app-sidebar-link${active ? " app-sidebar-link--active" : ""}${showBadge ? " app-sidebar-link--badged" : ""}`}
      aria-label={collapsedLabel}
      title={collapsedLabel}
    >
      <span className="app-sidebar-icon">{icon}</span>
      {collapsed ? null : <span className="app-sidebar-link-label">{label}</span>}
      {showBadge ? (
        <span className="app-sidebar-badge" aria-hidden>
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const commandMode = useCommandMode();
  const { data: session } = authClient.useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
        setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (
        settingsWrapRef.current &&
        !settingsWrapRef.current.contains(e.target as Node)
      ) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [settingsOpen]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== "b") return;
      if (e.repeat) return;
      e.preventDefault();
      toggleCollapsed();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCollapsed]);

  const user = session?.user;

  const { data: incompleteScheduledCount } =
    trpc.quiz.incompleteScheduledCount.useQuery(undefined, {
      enabled: !!user,
    });

  return (
    <aside
      className={`app-sidebar${collapsed ? " app-sidebar--collapsed" : ""}`}
      aria-label="Main navigation"
    >
      <div className="app-sidebar-top">
        <button
          type="button"
          className="app-sidebar-collapse-btn"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-keyshortcuts="Meta+B Control+B"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title="⌘B / Ctrl+B"
        >
          {commandMode ? (
            <span className="app-sidebar-hotkey-hint" aria-hidden>
              B
            </span>
          ) : collapsed ? (
            <IconChevronRight className="app-sidebar-collapse-icon" />
          ) : (
            <IconChevronLeft className="app-sidebar-collapse-icon" />
          )}
        </button>
      </div>

      <nav className="app-sidebar-nav">
        <NavLink
          href="/dashboard"
          label="Dashboard"
          icon={<IconDashboard />}
          collapsed={collapsed}
          pathname={pathname}
        />
        <NavLink
          href="/quizzes"
          label="Quizzes"
          icon={<IconQuizzes />}
          collapsed={collapsed}
          pathname={pathname}
          badgeCount={incompleteScheduledCount}
          badgeAriaDetail={
            incompleteScheduledCount
              ? `${incompleteScheduledCount} incomplete scheduled quiz${incompleteScheduledCount === 1 ? "" : "zes"}`
              : undefined
          }
        />
      </nav>

      <div className="app-sidebar-footer">
        <div className="app-sidebar-settings" ref={settingsWrapRef}>
          <button
            type="button"
            className={`app-sidebar-link app-sidebar-settings-btn${settingsOpen ? " app-sidebar-link--active" : ""}`}
            onClick={() => setSettingsOpen((o) => !o)}
            aria-label={collapsed ? "Settings" : undefined}
            title={collapsed ? "Settings" : undefined}
            aria-expanded={settingsOpen}
          >
            <span className="app-sidebar-icon">
              <IconSettings />
            </span>
            {collapsed ? null : <span>Settings</span>}
          </button>
          {settingsOpen ? (
            <div className="app-sidebar-settings-panel" role="dialog">
              {user ? (
                <>
                  <div className="app-sidebar-settings-user">
                    <span className="app-sidebar-settings-name">
                      {user.name ?? "Account"}
                    </span>
                    {user.email ? (
                      <span className="app-sidebar-settings-email">
                        {user.email}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="app-sidebar-signout"
                    onClick={() =>
                      authClient.signOut({
                        fetchOptions: { onSuccess: () => router.push("/") },
                      })
                    }
                  >
                    Sign out
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
