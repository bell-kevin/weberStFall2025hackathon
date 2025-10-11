import './ResultDisplay.css';

export function ResultDisplay({ description, loading, error }) {
  if (!loading && !description && !error) {
    return null;
  }

  return (
    <div className="result-display">
      {loading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Analyzing your image...</p>
        </div>
      )}

      {error && (
        <div className="error-container">
          <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      )}

      {description && !loading && !error && (
        <div className="description-container">
          <div className="description-header">
            <svg className="success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h3>Image Description</h3>
          </div>
          <p className="description-text">{description}</p>
        </div>
      )}
    </div>
  );
}
