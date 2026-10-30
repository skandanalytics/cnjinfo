import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/customer/home';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light p-4">
          <div className="card shadow-sm border-0 text-center p-4 p-md-5" style={{ maxWidth: 500, borderRadius: 16 }}>
            <div className="mb-3 text-warning" style={{ fontSize: '48px' }}>
              <i className="bi bi-exclamation-triangle-fill text-danger"></i>
            </div>
            <h4 className="fw-bold text-dark mb-2">Something went wrong</h4>
            <p className="text-muted small mb-4">
              We encountered an unexpected error while loading this page. You can try refreshing or returning to the home page.
            </p>
            {this.state.error?.message && (
              <div className="alert alert-danger py-2 px-3 small text-start mb-4 text-break" style={{ maxHeight: 120, overflowY: 'auto' }}>
                <code>{this.state.error.message}</code>
              </div>
            )}
            <div className="d-flex flex-column flex-sm-row gap-2 justify-content-center">
              <button
                type="button"
                className="btn btn-outline-secondary px-3"
                onClick={this.handleReset}
              >
                Try Again
              </button>
              <button
                type="button"
                className="btn btn-primary px-3"
                onClick={this.handleReload}
              >
                <i className="bi bi-arrow-clockwise me-1"></i> Refresh Page
              </button>
              <button
                type="button"
                className="btn btn-dark px-3"
                onClick={this.handleGoHome}
              >
                Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
