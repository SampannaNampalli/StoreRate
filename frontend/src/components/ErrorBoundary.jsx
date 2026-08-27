import { Component } from 'react';

/**
 * Catches render-time exceptions.
 *
 * Without one of these, a single component throwing unmounts the entire React
 * tree and leaves the user looking at a blank white page with no explanation and
 * no way forward - the worst possible failure mode, because it looks identical
 * to the app being down.
 *
 * Has to be a class: `componentDidCatch` and `getDerivedStateFromError` have no
 * hook equivalent.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ui] render failed', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="card card--narrow" role="alert">
        <h1 className="card__title">Something went wrong</h1>
        <p className="muted">
          This page ran into an unexpected problem. Your data has not been affected — try again, or
          reload if the problem persists.
        </p>

        {import.meta.env.DEV && (
          <pre className="error-boundary__detail">{error.stack || String(error)}</pre>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn--primary" onClick={this.handleReset}>
            Try again
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => window.location.assign('/')}>
            Back to start
          </button>
        </div>
      </div>
    );
  }
}
