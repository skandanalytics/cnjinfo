import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getImageUrl } from '../../utils/imageUtils';
import { FiAward } from 'react-icons/fi';

export const TopDishes = ({ dishes = [] }) => {
  const navigate = useNavigate();

  const maxOrders = dishes.length > 0 ? Math.max(...dishes.map(d => d.count || 1), 1) : 1;

  return (
    <div 
      className="card border rounded-4 shadow-sm p-4 h-100"
      style={{ 
        backgroundColor: 'var(--surface-color)', 
        borderColor: 'var(--border-color)' 
      }}
    >
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h5 className="fw-bold mb-0" style={{ fontSize: '18px', letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>
          Top Selling Items
        </h5>
        <button
          onClick={() => navigate('/admin/menus')}
          className="btn btn-sm btn-link text-decoration-none fw-bold p-0"
          style={{ fontSize: '13px', color: 'var(--primary-color)' }}
        >
          View All
        </button>
      </div>
      
      {dishes.length === 0 ? (
        <div className="text-center py-4 text-secondary">
          <FiAward size={36} className="text-muted mb-2 opacity-50" />
          <p className="small mb-1 fw-semibold text-dark">No Top Dishes Yet</p>
          <p className="small text-muted mb-0" style={{ fontSize: '11.5px' }}>
            As customers place orders, popular and top-selling dishes will appear here.
          </p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {dishes.slice(0, 3).map((dish, index) => {
            const percentage = Math.min(100, Math.max(30, Math.round((dish.count / maxOrders) * 100)));
            const defaultImages = [
              'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=120&auto=format&fit=crop&q=80',
              'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=120&auto=format&fit=crop&q=80',
              'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=120&auto=format&fit=crop&q=80'
            ];
            const imgSrc = dish.image ? getImageUrl(dish.image) : defaultImages[index % defaultImages.length];
            const isOrange = index >= 2;

            return (
              <div 
                key={dish.id || index} 
                onClick={() => navigate('/admin/menus')}
                className="d-flex align-items-center justify-content-between p-2 rounded-3 transition-all cursor-pointer hover-bg"
                style={{ cursor: 'pointer', gap: '14px' }}
              >
                {/* Food Image Thumbnail */}
                <div className="flex-shrink-0" style={{ width: '48px', height: '48px' }}>
                  <img 
                    src={imgSrc}
                    alt={dish.name}
                    className="w-100 h-100 rounded-3 shadow-xs"
                    style={{ objectFit: 'cover', borderRadius: '10px' }}
                    onError={(e) => {
                      e.currentTarget.src = defaultImages[index % defaultImages.length];
                    }}
                  />
                </div>

                {/* Name & Orders */}
                <div className="flex-grow-1 overflow-hidden">
                  <div className="fw-bold text-truncate" style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                    {dish.name}
                  </div>
                  <div className="text-secondary small" style={{ fontSize: '12px' }}>
                    {dish.count} orders
                  </div>
                </div>

                {/* Horizontal Progress Bar Pill */}
                <div className="flex-shrink-0" style={{ width: '100px' }}>
                  <div 
                    className="w-100 rounded-pill" 
                    style={{ height: '8px', backgroundColor: 'var(--border-subtle, #F1F5F9)', overflow: 'hidden' }}
                  >
                    <div 
                      className="h-100 rounded-pill transition-all"
                      style={{ 
                        width: `${percentage}%`, 
                        backgroundColor: isOrange ? '#F59E0B' : 'var(--primary-color, #F20D2D)',
                        transition: 'width 0.6s ease'
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default TopDishes;
