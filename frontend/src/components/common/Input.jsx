import React, { useState } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';

export const Input = ({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  required = false,
  maxLength,
  className = '',
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className={`mb-3 ${className}`}>
      {label && (
        <label className="form-label small fw-semibold text-secondary">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      <div className="position-relative">
        <input
          type={inputType}
          className={`form-control rounded-3 py-2 ${isPassword ? 'pe-5' : ''} ${error ? 'is-invalid' : ''}`}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          maxLength={maxLength}
          required={required}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            className="position-absolute end-0 top-0 bottom-0 d-flex align-items-center justify-content-center border-0 text-muted px-3 bg-transparent"
            style={{ cursor: 'pointer', zIndex: 5, transform: 'none' }}
            onClick={() => setShowPassword(!showPassword)}
            tabIndex="-1"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
          </button>
        )}
      </div>
      {error && <div className="invalid-feedback d-block mt-1 small">{error}</div>}
    </div>
  );
};
export default Input;
