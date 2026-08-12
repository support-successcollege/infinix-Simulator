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
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import Wordmark from "@/components/Wordmark";

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
      {/* Left panel — an ink plate carrying the masthead. The
          photograph it replaces was doing nothing the type cannot,
          and it fought the paper on the other half of the split. */}
      <div
        className="hidden lg:flex flex-col justify-between flex-1"
        style={{ background: "#16171a", color: "#f2f1ed" }}
      >
        <div className="p-10">
          <Wordmark size="lg" tone="onDark" />
        </div>

        <div className="p-10 pb-14">
          <p className="eyebrow mb-5" style={{ color: "#8d8f95" }}>סימולטור אימון מכירות</p>
          <h1 className="t-display mb-5" style={{ fontSize: "clamp(2.4rem, 3.4vw, 3.4rem)" }}>
            אמן את כישורי
            <br />
            המכירות שלך
          </h1>
          <p className="text-base mb-9 max-w-md" style={{ color: "#b9bbc0" }}>
            שאלות מהשטח, משוב מיידי אחרי כל תשובה, וניתוח ביצועים לאורך זמן.
          </p>

          {/* A numbered list under rules — the same device the app
              uses for its sections. */}
          <div style={{ borderTop: "1px solid #33363c" }}>
            {[
              "זירות התמחות מרובות",
              "מעקב ביצועים בזמן אמת",
              "משוב מיידי אחרי כל תשובה",
            ].map((text, i) => (
              <div
                key={text}
                className="flex items-baseline gap-4 py-3"
                style={{ borderBottom: "1px solid #33363c" }}
              >
                <span className="t-numeric text-xs" style={{ color: "#8d8f95" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — auth form.
          The panel fills the viewport below the lg breakpoint, where
          the hero is hidden. Without an inner measure the fields
          stretched the full width of a tablet — a 900px-wide password
          box. The form keeps its own comfortable column and centres
          inside whatever space the panel has. */}
      <div
        className="flex flex-col justify-center items-center flex-1 lg:max-w-md w-full p-8 lg:p-12 overflow-y-auto"
        style={{ background: "var(--background)" }}
      >
        <div className="w-full max-w-sm lg:max-w-none">
        <div className="mb-10 lg:hidden">
          <Wordmark size="lg" />
        </div>

        {stage === "credentials" ? (
          <>
            <div className="mb-8">
              <p className="eyebrow mb-2">כניסה</p>
              <h1 className="t-title mb-2" style={{ color: "var(--foreground)" }}>
                ברוך הבא
              </h1>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                התחבר עם המשתמש שהוגדר עבורך
              </p>
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
                className="btn-primary w-full text-base mt-2"
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
              className="p-4 mb-6 flex items-start gap-3"
              style={{
                background: "var(--tint-primary-weak)",
                borderInlineStart: "3px solid var(--accent)",
              }}
            >
              <ShieldAlert
                size={16}
                style={{ color: "var(--accent)", flexShrink: 0, marginTop: 3 }}
                aria-hidden="true"
              />
              <div>
                <div className="eyebrow mb-1" style={{ color: "var(--accent)" }}>
                  נדרשת החלפת סיסמה
                </div>
                <div className="text-sm" style={{ color: "var(--foreground)" }}>
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
                className="btn-primary w-full text-base mt-2"
              >
                {isLoading ? "שומר..." : "החלף סיסמה והמשך"}
              </button>
            </form>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
