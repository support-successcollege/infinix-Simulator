import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex items-center justify-center min-h-screen p-8 bg-background"
          style={{ direction: "rtl" }}
        >
          <div className="flex flex-col items-center w-full max-w-md p-8 text-center">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="t-title mb-2 text-foreground">
              אירעה שגיאה בלתי צפויה
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              אנא טען מחדש את הדף. אם הבעיה חוזרת, פנה לתמיכה.
            </p>

            <button onClick={() => window.location.reload()} className={cn("btn-primary")}>
              <RotateCcw size={15} />
              טען מחדש
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
