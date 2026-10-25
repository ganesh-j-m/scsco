import { Component, type ErrorInfo, type ReactNode } from "react";

/** Last line of defence: a crash in one screen shows a friendly page instead of a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("UI error:", error.message, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center" role="alert">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">The page could not be displayed. Reloading usually fixes this.</p>
          <div className="mt-5 flex justify-center gap-2">
            <button className="btn-primary" onClick={() => window.location.reload()}>Reload page</button>
            <a className="btn-secondary" href="/">Go to home</a>
          </div>
        </div>
      </main>
    );
  }
}
