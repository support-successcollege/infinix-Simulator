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
          className="text-8xl font-black mb-4"
          style={{
            background: "linear-gradient(135deg, var(--primary), #b7924f)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            fontFamily: "Inter, sans-serif",
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
        <button
          onClick={() => setLocation("/")}
          className="px-6 py-3 rounded-xl font-bold text-base"
          style={{
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            boxShadow: "0 0 20px rgba(255, 165, 0, 0.35)",
          }}
        >
          חזרה לדף הבית
        </button>
      </div>
    </div>
  );
}
