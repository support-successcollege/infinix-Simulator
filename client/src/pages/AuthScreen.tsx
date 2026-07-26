/* ============================================================
   AuthScreen — InfinityCloser Login / Register
   Design: Midnight Gradient — full-viewport auth with hero bg
   ============================================================ */

import { useState } from "react";
import { useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import { toast } from "sonner";
import { Eye, EyeOff, Zap, Target, TrendingUp } from "lucide-react";
import brandLogo from "@/assets/logo_black_nobg.png";

const AUTH_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663547397718/Pvji6kDRrPHhdwxpb2BJTp/auth-bg-PoHKYb9u6dNNUuqcGHuDud.webp";

export default function AuthScreen() {
  const { login, needsSetup, completeSetup } = useApp();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (needsSetup) {
      try {
        completeSetup({ name, email, password });
        toast.success("חשבון ההנהלה נוצר");
        setLocation("/app");
      } catch (err) {
        toast.error((err as Error)?.message || "יצירת החשבון נכשלה");
      }
      return;
    }

    if (!email || !password) {
      toast.error("נא למלא את כל השדות");
      return;
    }
    setIsLoading(true);
    if (!login(email, password)) {
      setIsLoading(false);
      toast.error("מייל או סיסמה שגויים");
      return;
    }
    setIsLoading(false);
    setLocation("/app");
  };

  return (
    <div className="app-shell" style={{ direction: "rtl" }}>
      {/* Left panel — hero */}
      <div
        className="hidden lg:flex flex-col justify-between flex-1 relative overflow-hidden"
        style={{
          backgroundImage: `url(${AUTH_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.65) 100%)" }} />

        {/* Logo */}
        <div className="relative z-10 p-10">
          <img src={brandLogo} alt="INFINIX" className="h-12 w-auto" />
        </div>

        {/* Hero content */}
        <div className="relative z-10 p-10 pb-16">
          <h1 className="text-5xl font-black text-white mb-4 leading-tight" style={{ fontFamily: "Heebo, sans-serif" }}>
            אמן את כישורי<br />
            <span style={{ color: "var(--primary)" }}>המכירות שלך</span>
          </h1>
          <p className="text-lg mb-8" style={{ color: "#dfdfdf" }}>
            סימולטור אימון מכירות מתקדם. שאלות, משוב, ניתוח ביצועים — הכל במקום אחד.
          </p>
          <div className="flex flex-col gap-4">
            {[
              { icon: Target, text: "12 זירות התמחות שונות" },
              { icon: TrendingUp, text: "מעקב ביצועים בזמן אמת" },
              { icon: Zap, text: "משוב מיידי אחרי כל תשובה" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255, 165, 0, 0.18)", border: "1px solid rgba(255, 165, 0, 0.4)" }}>
                  <Icon size={16} style={{ color: "var(--primary)" }} />
                </div>
                <span className="text-sm font-medium" style={{ color: "#dfdfdf" }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex flex-col justify-center flex-1 lg:max-w-md w-full p-8 lg:p-12 overflow-y-auto"
        style={{ background: "var(--background)" }}>

        {/* Mobile logo */}
        <div className="flex items-center gap-3 mb-10 lg:hidden">
          <img src={brandLogo} alt="INFINIX" className="h-10 w-auto" />
        </div>

        <div className="mb-8">
          <h2 className="text-3xl font-black mb-2" style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}>
            {needsSetup ? "הגדרה ראשונית" : "ברוך הבא"}
          </h2>
          <p style={{ color: "var(--muted-foreground)" }}>
            {needsSetup
              ? "אין עדיין חשבונות במכשיר זה. צור את חשבון ההנהלה הראשון."
              : "התחבר עם המשתמש שהוגדר עבורך"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {needsSetup && (
            <div>
              <label htmlFor="auth-name" className="block text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>
                שם מלא
              </label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                className="tf-input"
                placeholder="ישראל ישראלי"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>
              דוא"ל
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="username"
              className="tf-input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ direction: "ltr", textAlign: "left" }}
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>
              סיסמה
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                autoComplete={needsSetup ? "new-password" : "current-password"}
                className="tf-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ paddingLeft: "2.75rem", direction: "ltr", textAlign: "left" }}
              />
              <button
                type="button"
                aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                onClick={() => setShowPassword(v => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--muted-foreground)" }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {needsSetup && (
              <p className="text-xs mt-1.5" style={{ color: "var(--muted-foreground)" }}>
                לפחות 8 תווים.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl font-bold text-base mt-2 transition-all"
            style={{
              background: isLoading ? "var(--muted)" : "var(--primary)",
              color: "var(--primary-foreground)",
              boxShadow: isLoading ? "none" : "0 0 20px rgba(255, 165, 0, 0.35)",
            }}
          >
            {needsSetup ? "צור חשבון והתחבר" : isLoading ? "מתחבר..." : "התחבר"}
          </button>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: "var(--muted-foreground)" }}>
          {needsSetup
            ? "החשבון נשמר בדפדפן זה בלבד. אין שרת, ולכן הוא לא יהיה זמין ממכשיר אחר."
            : "ההתחברות מתבצעת באמצעות משתמשים שנוצרו במערכת"}
        </p>
      </div>
    </div>
  );
}
