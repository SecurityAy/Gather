import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Gather render error:", error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="simple-error">
        <a className="brand" href="/" aria-label="Gather home">
          <span className="brand-symbol"><img src="/gather-mark.png" alt="" /></span>
          <span>gather<span className="brand-period">.</span></span>
        </a>
        <div className="error-card">
          <span className="error-ornament">✳</span>
          <div className="eyebrow"><span className="eyebrow-line" /> SOMETHING WENT WRONG</div>
          <h1>We couldn't<br /><em>load this page.</em></h1>
          <p>An unexpected error interrupted Gather. Your data is safe. Try again, or head back to the dashboard.</p>
          <div className="error-actions">
            <button type="button" className="button button-dark" onClick={this.handleRetry}>Try again</button>
            <a className="button button-outline" href="/">Back to Gather</a>
          </div>
          <p className="demo-auth-note">If this keeps happening, the technical details below can help diagnose the problem.</p>
          <details className="error-details">
            <summary>Technical details</summary>
            <pre>{error.message}</pre>
          </details>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;