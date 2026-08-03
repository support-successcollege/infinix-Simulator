/* ============================================================
   Sidebar — InfinityCloser Navigation
   Design: Midnight Gradient — collapsible icon sidebar
   ============================================================ */

import { useState } from "react";
import { useApp, Screen } from "@/contexts/AppContext";
import { useTheme } from "@/contexts/ThemeContext";
import brandLogo from "@/assets/logo_black_nobg.png";
import {
  Home, BookOpen, User, Settings, LogOut,
  ChevronRight, ChevronLeft, Sun, Moon, Shield
} from "lucide-react";

interface NavItem {
  id: Screen;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  managerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: "hub", label: "בית", icon: Home },
  { id: "wizard", label: "אימון חדש", icon: BookOpen },
  { id: "profile", label: "פרופיל", icon: User },
  { id: "settings", label: "הגדרות", icon: Settings },
  { id: "manager", label: "ניהול", icon: Shield, managerOnly: true },
];

export default function Sidebar() {
  const { currentScreen, setScreen, user, logout } = useApp();
  const { theme, toggleTheme } = useTheme();
  // theme toggle is always available since we pass switchable=true
  const [expanded, setExpanded] = useState(false);

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.managerOnly || user?.role === "manager"
  );

  return (
    <aside
      className={`app-sidebar ${expanded ? "expanded" : ""}`}
      style={{ direction: "rtl" }}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 mb-6 ${expanded ? "w-full px-1" : "justify-center"}`}>
        <img src={brandLogo} alt="INFINIX" className="brand-logo h-8 w-auto flex-shrink-0" />
        {expanded && (
          <div className="overflow-hidden">
            <div className="font-black text-sm leading-tight" style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}>
              INFINIX
            </div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Simulator</div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 flex-1 w-full">
        {visibleItems.map(item => {
          const isActive = currentScreen === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className={`flex items-center gap-3 rounded-xl transition-all ${expanded ? "w-full px-3 py-2.5" : "w-10 h-10 justify-center"}`}
              style={{
                background: isActive ? "var(--primary)" : "transparent",
                color: isActive ? "var(--primary-foreground)" : "var(--sidebar-foreground)",
                boxShadow: isActive ? "0 0 12px rgba(255, 165, 0, 0.3)" : "none",
              }}
              title={!expanded ? item.label : undefined}
            >
              <Icon size={18} />
              {expanded && (
                <span className="text-sm font-semibold">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="flex flex-col gap-1 w-full mt-auto">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={`flex items-center gap-3 rounded-xl transition-all ${expanded ? "w-full px-3 py-2.5" : "w-10 h-10 justify-center"}`}
          style={{ color: "var(--muted-foreground)" }}
          title={!expanded ? (theme === "dark" ? "מצב בהיר" : "מצב כהה") : undefined}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {expanded && <span className="text-sm font-semibold">{theme === "dark" ? "מצב בהיר" : "מצב כהה"}</span>}
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className={`flex items-center gap-3 rounded-xl transition-all ${expanded ? "w-full px-3 py-2.5" : "w-10 h-10 justify-center"}`}
          style={{ color: "var(--muted-foreground)" }}
          title={!expanded ? "התנתק" : undefined}
        >
          <LogOut size={18} />
          {expanded && <span className="text-sm font-semibold">התנתק</span>}
        </button>

        {/* Expand/collapse toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className={`flex items-center gap-3 rounded-xl transition-all mt-2 ${expanded ? "w-full px-3 py-2.5" : "w-10 h-10 justify-center"}`}
          style={{
            background: "var(--sidebar-accent)",
            color: "var(--sidebar-accent-foreground)",
          }}
        >
          {expanded ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {expanded && <span className="text-xs font-semibold">כווץ</span>}
        </button>
      </div>
    </aside>
  );
}
