import React from 'react';
import Button from './Button';

export const EmptyState = ({
  title = 'No Data Available',
  description = 'No records found to display.',
  icon = 'bi-folder-x',
  buttonText,
  onButtonClick
}) => {
  return (
    <div className="text-center py-5 px-3">
      <div className="mb-3 text-secondary opacity-75" style={{ fontSize: '48px' }}>
        <i className={`bi ${icon}`}></i>
      </div>
      <h5 className="fw-bold text-dark mb-1.5" style={{ fontSize: '16px' }}>{title}</h5>
      <p className="text-secondary small mb-4">{description}</p>
      {buttonText && onButtonClick && (
        <Button onClick={onButtonClick} variant="primary">
          {buttonText}
        </Button>
      )}
    </div>
  );
};
export default EmptyState;
