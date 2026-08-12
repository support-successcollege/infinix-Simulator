import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ direction: "rtl", background: "var(--background)" }}
    >
      <div className="text-center">
        <div
          className="t-numeric text-8xl font-black mb-4"
          style={{
            background: "linear-gradient(135deg, var(--primary), var(--tf-accent-line))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          404
        </div>
        <h1 className="text-2xl font-black mb-2" style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}>
          הדף לא נמצא
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--muted-foreground)" }}>
          הדף שחיפשת אינו קיים או הוסר.
        </p>
        <button onClick={() => setLocation("/")} className="btn-primary">
          חזרה לדף הבית
        </button>
      </div>
    </div>
  );
}
