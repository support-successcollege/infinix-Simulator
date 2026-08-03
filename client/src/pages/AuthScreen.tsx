/* ============================================================
   AuthScreen — InfinityCloser Login
   Design: Midnight Gradient — full-viewport auth with hero bg

   Sign-in is client-side only (see docs/SECURITY.md). The one
   guarantee worth having in this model is that the bootstrap
   admin password cannot survive first use, so a fresh install
   forces a rotation before letting anyone into the app.
   ============================================================ */

import { useState } from "react";
import { useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import { validatePasswordStrength } from "@/lib/auth";
import { toast } from "sonner";
import { Eye, EyeOff, Zap, Target, TrendingUp, ShieldAlert } from "lucide-react";
import brandLogo from "@/assets/logo_black_nobg.png";
import authBg from "@/assets/auth-bg.webp";

type Stage = "credentials" | "rotate-password";

export default function AuthScreen() {
  const { login, changePassword, authReady } = useApp();
  const [, setLocation] = useLocation();

  const [stage, setStage] = useState<Stage>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("נא למלא את כל השדות");
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(email, password);
      if (!result.ok) {
        toast.error(result.error || "מייל או סיסמה שגויים");
        return;
      }
      if (result.mustChangePassword) {
        setStage("rotate-password");
        toast.info("יש להחליף את סיסמת ברירת המחדל לפני הכניסה");
        return;
      }
      setLocation("/app");
    } catch (err) {
      toast.error((err as Error)?.message || "ההתחברות נכשלה");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRotate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("הסיסמאות אינן תואמות");
      return;
    }
    const weakness = validatePasswordStrength(newPassword);
    if (weakness) {
      toast.error(weakness);
      return;
    }

    setIsLoading(true);
    try {
      await changePassword(password, newPassword);
      toast.success("הסיסמה הוחלפה בהצלחה");
      setLocation("/app");
    } catch (err) {
      toast.error((err as Error)?.message || "החלפת הסיסמה נכשלה");
    } finally {
      setIsLoading(false);
    }
  };

  const submitDisabled = isLoading || !authReady;

  return (
    <div className="app-shell" style={{ direction: "rtl" }}>
      {/* Left panel — hero */}
      <div
        className="hidden lg:flex flex-col justify-between flex-1 relative overflow-hidden"
        style={{
          backgroundImage: `url(${authBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: "#0a0a0a",
        }}
      >
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.65) 100%)" }}
        />

        <div className="relative z-10 p-10">
          <img src={brandLogo} alt="INFINIX" className="h-12 w-auto" />
        </div>

        <div className="relative z-10 p-10 pb-16">
          <h1
            className="text-5xl font-black text-white mb-4 leading-tight"
            style={{ fontFamily: "Heebo, sans-serif" }}
          >
            אמן את כישורי
            <br />
            <span style={{ color: "var(--primary)" }}>המכירות שלך</span>
          </h1>
          <p className="text-lg mb-8" style={{ color: "#dfdfdf" }}>
            סימולטור אימון מכירות מתקדם. שאלות, משוב, ניתוח ביצועים — הכל במקום אחד.
          </p>
          <div className="flex flex-col gap-4">
            {[
              { icon: Target, text: "זירות התמחות מרובות" },
              { icon: TrendingUp, text: "מעקב ביצועים בזמן אמת" },
              { icon: Zap, text: "משוב מיידי אחרי כל תשובה" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255, 165, 0, 0.18)", border: "1px solid rgba(255, 165, 0, 0.4)" }}
                >
                  <Icon size={16} style={{ color: "var(--primary)" }} aria-hidden="true" />
                </div>
                <span className="text-sm font-medium" style={{ color: "#dfdfdf" }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div
        className="flex flex-col justify-center flex-1 lg:max-w-md w-full p-8 lg:p-12 overflow-y-auto"
        style={{ background: "var(--background)" }}
      >
        <div className="flex items-center gap-3 mb-10 lg:hidden">
          <img src={brandLogo} alt="INFINIX" className="brand-logo h-10 w-auto" />
        </div>

        {stage === "credentials" ? (
          <>
            <div className="mb-8">
              <h1
                className="text-3xl font-black mb-2"
                style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}
              >
                ברוך הבא
              </h1>
              <p style={{ color: "var(--muted-foreground)" }}>התחבר עם המשתמש שהוגדר עבורך</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-sm font-semibold mb-2"
                  style={{ color: "var(--foreground)" }}
                >
                  דוא"ל
                </label>
                <input
                  id="auth-email"
                  name="email"
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
                <label
                  htmlFor="auth-password"
                  className="block text-sm font-semibold mb-2"
                  style={{ color: "var(--foreground)" }}
                >
                  סיסמה
                </label>
                <div className="relative">
                  <input
                    id="auth-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="tf-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ paddingLeft: "2.75rem", direction: "ltr", textAlign: "left" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitDisabled}
                className="w-full py-3 rounded-xl font-bold text-base mt-2 transition-all"
                style={{
                  background: submitDisabled ? "var(--muted)" : "var(--primary)",
                  color: submitDisabled ? "var(--muted-foreground)" : "var(--primary-foreground)",
                  boxShadow: submitDisabled ? "none" : "0 0 20px rgba(255, 165, 0, 0.35)",
                }}
              >
                {isLoading ? "מתחבר..." : !authReady ? "טוען..." : "התחבר"}
              </button>
            </form>

            <p className="text-center text-xs mt-6" style={{ color: "var(--muted-foreground)" }}>
              ההתחברות מתבצעת באמצעות משתמשים שנוצרו במערכת
            </p>
          </>
        ) : (
          <>
            <div
              className="rounded-xl p-4 mb-6 flex items-start gap-3"
              style={{
                background: "rgba(255, 165, 0, 0.12)",
                border: "1px solid rgba(255, 165, 0, 0.4)",
              }}
            >
              <ShieldAlert
                size={18}
                style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }}
                aria-hidden="true"
              />
              <div>
                <div className="text-sm font-bold" style={{ color: "var(--primary)" }}>
                  נדרשת החלפת סיסמה
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  זו סיסמת ברירת המחדל של ההתקנה. בחר סיסמה חדשה כדי להמשיך — לאחר מכן
                  סיסמת ברירת המחדל תפסיק לעבוד.
                </div>
              </div>
            </div>

            <form onSubmit={handleRotate} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-sm font-semibold mb-2"
                  style={{ color: "var(--foreground)" }}
                >
                  סיסמה חדשה
                </label>
                <input
                  id="new-password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  className="tf-input"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  style={{ direction: "ltr", textAlign: "left" }}
                />
                <p className="text-xs mt-1.5" style={{ color: "var(--muted-foreground)" }}>
                  לפחות 8 תווים, הכוללים אות אחת וספרה אחת.
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-semibold mb-2"
                  style={{ color: "var(--foreground)" }}
                >
                  אימות סיסמה
                </label>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  className="tf-input"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  style={{ direction: "ltr", textAlign: "left" }}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-xl font-bold text-base mt-2 transition-all"
                style={{
                  background: isLoading ? "var(--muted)" : "var(--primary)",
                  color: isLoading ? "var(--muted-foreground)" : "var(--primary-foreground)",
                  boxShadow: isLoading ? "none" : "0 0 20px rgba(255, 165, 0, 0.35)",
                }}
              >
                {isLoading ? "שומר..." : "החלף סיסמה והמשך"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
