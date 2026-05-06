/* ============================================================
   MainApp — InfinityCloser App Shell
   Design: Midnight Gradient — sidebar + main content area
   Full-viewport, no body scroll, RTL
   ============================================================ */

import { useEffect } from "react";
import { useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import Sidebar from "@/components/Sidebar";
import HubScreen from "@/components/screens/HubScreen";
import WizardScreen from "@/components/screens/WizardScreen";
import QuizScreen from "@/components/screens/QuizScreen";
import ResultsScreen from "@/components/screens/ResultsScreen";
import ProfileScreen from "@/components/screens/ProfileScreen";
import ManagerScreen from "@/components/screens/ManagerScreen";
import SettingsScreen from "@/components/screens/SettingsScreen";

export default function MainApp() {
  const { isAuthenticated, currentScreen } = useApp();
  const [, setLocation] = useLocation();
  // Theme is managed by ThemeContext

  // Redirect to auth if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;

  const renderScreen = () => {
    switch (currentScreen) {
      case "hub": return <HubScreen />;
      case "wizard": return <WizardScreen />;
      case "quiz": return <QuizScreen />;
      case "results": return <ResultsScreen />;
      case "profile": return <ProfileScreen />;
      case "manager": return <ManagerScreen />;
      case "settings": return <SettingsScreen />;
      default: return <HubScreen />;
    }
  };

  // Quiz and results screens get full-screen treatment (no sidebar)
  const isFullscreen = currentScreen === "quiz";

  return (
    <div className="app-shell">
      {!isFullscreen && <Sidebar />}
      <main className="app-main">
        <div className="arena screen-enter" key={currentScreen}>
          {renderScreen()}
        </div>
      </main>
    </div>
  );
}
