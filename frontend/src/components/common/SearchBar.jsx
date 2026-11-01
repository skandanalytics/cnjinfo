import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiSearch, FiX } from 'react-icons/fi';
import formatCurrency from '../../utils/formatCurrency';
import { getImageUrl } from '../../utils/imageUtils';
import { filterAndRankDishes, escapeRegex } from '../../utils/searchUtils';

function asRecord(entry) {
  if (entry && typeof entry === 'object') {
    const name = String(entry.name || entry.title || entry.label || '').trim();
    const label = String(entry.label || name).trim();
    const category = String(
      (entry.category && typeof entry.category === 'object' ? entry.category.name : entry.category) ||
      entry.category_name ||
      entry.subtitle ||
      ''
    ).trim();
    return {
      id: entry.id,
      label,
      title: name || label,
      name: name || label,
      category,
      subtitle: entry.subtitle || category || '',
      image: entry.image || '',
      price: entry.price,
      raw: entry.raw || entry,
    };
  }
  const text = String(entry || '').trim();
  return text ? { id: text, label: text, title: text, name: text, category: '', subtitle: '', image: '', price: undefined, raw: text } : null;
}

export const SearchBar = ({
  placeholder = 'Search...',
  value = '',
  onChange,
  className = '',
  style = {},
  disabled = false,
  suggestions = [],
  records = [],
  data = [],
  onSelectSuggestion,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [box, setBox] = useState(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const source = (Array.isArray(records) && records.length > 0)
    ? records
    : (Array.isArray(suggestions) && suggestions.length > 0 ? suggestions : data);
  const catalog = (Array.isArray(source) ? source : []).map(asRecord).filter(Boolean);
  const query = String(value || '').trim();
  const matches = query && !disabled
    ? filterAndRankDishes(catalog, query).slice(0, 8)
    : [];

  const placeDropdown = () => {
    const node = containerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setBox({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      const menu = document.getElementById('foodie-search-suggestions');
      if (containerRef.current?.contains(event.target) || menu?.contains(event.target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    placeDropdown();
    window.addEventListener('resize', placeDropdown);
    window.addEventListener('scroll', placeDropdown, true);
    return () => {
      window.removeEventListener('resize', placeDropdown);
      window.removeEventListener('scroll', placeDropdown, true);
    };
  }, [isOpen, query, matches.length]);

  const handleSelect = (item) => {
    if (onChange) onChange(item.label);
    if (onSelectSuggestion) onSelectSuggestion(item.raw);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    if (event.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }
    if (!isOpen || matches.length === 0) {
      if (event.key === 'ArrowDown' && query) setIsOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev < matches.length - 1 ? prev + 1 : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : matches.length - 1));
    } else if (event.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < matches.length) {
      event.preventDefault();
      handleSelect(matches[highlightedIndex]);
    }
  };

  const renderHighlight = (text) => {
    const sourceText = String(text || '');
    const q = query.toLowerCase();
    if (!q) return sourceText;
    const parts = sourceText.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
    return parts.map((part, index) => (
      part.toLowerCase() === q
        ? <strong key={index} className="text-danger fw-bold">{part}</strong>
        : <span key={index}>{part}</span>
    ));
  };

  const dropdown = isOpen && query ? (
    <div
      id="foodie-search-suggestions"
      className="bg-white border border-light-subtle rounded-4 shadow-lg overflow-hidden py-1"
      style={{
        position: 'fixed',
        top: box?.top || 0,
        left: box?.left || 0,
        width: box?.width || 240,
        zIndex: 2000,
        maxHeight: '320px',
        overflowY: 'auto',
      }}
    >
      <div className="px-3 py-1.5 text-muted small fw-semibold border-bottom bg-light d-flex align-items-center justify-content-between" style={{ fontSize: '10.5px' }}>
        <span>SUGGESTIONS</span>
        <span>{matches.length} found</span>
      </div>
      {matches.length === 0 ? (
        <div className="px-3 py-3 text-secondary small">No matching results</div>
      ) : matches.map((item, index) => (
        <div
          key={`${item.id}-${index}`}
          onMouseDown={(event) => {
            event.preventDefault();
            handleSelect(item);
          }}
          onMouseEnter={() => setHighlightedIndex(index)}
          className={`px-3 py-2 d-flex align-items-center gap-2 ${highlightedIndex === index ? 'bg-danger-subtle' : ''}`}
          style={{ cursor: 'pointer' }}
        >
          {item.image ? (
            <img
              src={getImageUrl(item.image)}
              alt=""
              className="rounded-2 flex-shrink-0"
              style={{ width: 36, height: 36, objectFit: 'cover' }}
            />
          ) : null}
          <div className="flex-grow-1 text-truncate">
            <div className="text-truncate fw-semibold text-dark" style={{ fontSize: '12.5px' }}>{renderHighlight(item.title)}</div>
            {item.subtitle ? (
              <div className="text-secondary text-truncate" style={{ fontSize: '11px' }}>{renderHighlight(item.subtitle)}</div>
            ) : null}
          </div>
          {item.price !== undefined && item.price !== null && item.price !== '' ? (
            <span className="fw-bold text-danger flex-shrink-0" style={{ fontSize: '12px' }}>
              {typeof item.price === 'number' ? formatCurrency(item.price) : item.price}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`position-relative ${className}`} style={{ ...style, minWidth: '160px' }}>
      <div
        className="position-absolute start-0 top-0 bottom-0 d-flex align-items-center justify-content-center ms-3"
        style={{ color: disabled ? '#94a3b8' : 'var(--primary-color)', zIndex: 3, pointerEvents: 'none' }}
      >
        <FiSearch size={18} />
      </div>
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        className="form-control rounded-pill ps-5 pe-5 text-dark border border-light-subtle shadow-sm"
        placeholder={placeholder}
        value={value || ''}
        onChange={(event) => {
          const nextVal = event.target.value;
          if (onChange) onChange(nextVal);
          setIsOpen(Boolean(nextVal.trim()));
          setHighlightedIndex(-1);
        }}
        onFocus={() => {
          if (query) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        style={{
          height: style?.height || '40px',
          fontSize: '13px',
          backgroundColor: disabled ? '#f1f5f9' : '#ffffff',
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.75 : 1,
        }}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={() => {
            if (onChange) onChange('');
            setIsOpen(false);
            setHighlightedIndex(-1);
            inputRef.current?.focus();
          }}
          className="position-absolute end-0 top-0 bottom-0 d-flex align-items-center justify-content-center me-2 p-1 text-secondary border-0 bg-transparent"
          style={{ cursor: 'pointer', zIndex: 3 }}
          aria-label="Clear search"
        >
          <FiX size={16} />
        </button>
      )}
      {dropdown && box ? createPortal(dropdown, document.body) : null}
    </div>
  );
};

export default SearchBar;
