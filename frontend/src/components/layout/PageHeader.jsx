import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronLeft } from 'react-icons/fi';

export const PageHeader = ({
  title,
  subtitle,
  showBackButton = false,
  backUrl,
  onBack,
  actions,
  className = ""
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backUrl) {
      navigate(backUrl);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={`d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 pb-3 border-bottom gap-3 ${className}`}>
      <div className="d-flex align-items-center gap-3">
        {showBackButton && (
          <button 
            type="button"
            onClick={handleBack} 
            className="btn btn-light rounded-circle p-0 border d-inline-flex align-items-center justify-content-center flex-shrink-0"
            style={{ width: '36px', height: '36px' }}
            title="Back"
            aria-label="Go back"
          >
            <FiChevronLeft size={20} />
          </button>
        )}
        <div>
          <h3 className="fw-bold text-dark mb-0">{title}</h3>
          {subtitle && <p className="text-secondary small mb-0 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="d-flex align-items-center gap-2">{actions}</div>}
    </div>
  );
};
export default PageHeader;
