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

  const updateBox = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setBox({
      top: rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  };

  useEffect(() => {
    if (isOpen) {
      updateBox();
      window.addEventListener('resize', updateBox);
      window.addEventListener('scroll', updateBox, true);
    }
    return () => {
      window.removeEventListener('resize', updateBox);
      window.removeEventListener('scroll', updateBox, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleOutside = (event) => {
      if (containerRef.current && containerRef.current.contains(event.target)) return;
      if (event.target.closest && event.target.closest('.foodie-search-dropdown')) return;
      setIsOpen(false);
      setHighlightedIndex(-1);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleSelect = (item) => {
    const pickedText = item.title || item.label;
    if (onChange) onChange(pickedText);
    if (onSelectSuggestion) onSelectSuggestion(item.raw || item);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (!isOpen || matches.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < matches.length ? prev + 1 : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : matches.length - 1));
    } else if (event.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < matches.length) {
        event.preventDefault();
        handleSelect(matches[highlightedIndex]);
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const renderHighlight = (text) => {
    if (!query) return text;
    try {
      const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
      const parts = String(text).split(regex);
      return parts.map((part, index) =>
        regex.test(part) ? (
          <span key={index} className="fw-bold text-danger">
            {part}
          </span>
        ) : (
          part
        )
      );
    } catch {
      return text;
    }
  };

  const dropdown = isOpen && query && box && typeof document !== 'undefined' ? (
    <div
      className="foodie-search-dropdown shadow-lg bg-white border border-light-subtle rounded-3 py-1 position-absolute"
      style={{
        position: 'absolute',
        top: box.top,
        left: box.left,
        width: box.width,
        zIndex: 9999,
        maxHeight: '320px',
        overflowY: 'auto',
      }}
    >
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
        className="form-control rounded-pill py-2.5 ps-5 pe-5 text-dark border border-light-subtle shadow-sm"
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
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            if (onChange) onChange('');
            setIsOpen(false);
          }}
          className="btn btn-link position-absolute end-0 top-0 bottom-0 d-flex align-items-center justify-content-center me-2 text-secondary p-0 border-0"
          style={{ width: '32px', zIndex: 3 }}
          title="Clear search"
        >
          <FiX size={16} />
        </button>
      ) : null}
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
};

export default SearchBar;
