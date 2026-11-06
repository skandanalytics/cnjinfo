with open('frontend/src/pages/admin/Pos.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Locate from the card div opening to the card-body opening
old_start = '''                    return (
                      <div key={dish.id} className="col">
                        <div 
                          className="card h-100 border-0 shadow-xs transition-all overflow-hidden"
                          style={{
                            borderRadius: '0px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                          }}
                        >
                          {/* Image Box (140px) */}'''

idx = text.find('                          {/* Image Box (140px) */}')
if idx == -1:
    print('Image box comment not found')
    exit(1)

# Find the end of image box: after the Veg / Non-Veg Indicator closing </div>
# Look for '                          {/* Card Content */}'
end_idx = text.find('                          {/* Card Content */}', idx)
if end_idx == -1:
    print('Card Content not found')
    exit(1)

# Replace the image box with header row having Veg/Non-Veg badge and Bestseller/Popular pill
card_div_idx = text.rfind('<div \n                          className="card', 0, idx)
if card_div_idx == -1:
    card_div_idx = text.rfind('<div\n                          className="card', 0, idx)

new_block = '''{/* Header row with Veg/Non-Veg icon & optional Bestseller/Popular pill (Dish images hidden in POS) */}
                          <div className="card-body p-3 d-flex flex-column justify-content-between h-100">
                            <div>
                              <div className="d-flex align-items-center justify-content-between mb-2">
                                <div 
                                  className="shadow-2xs d-flex align-items-center justify-content-center bg-white"
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    border: isVeg ? '1.5px solid #22c55e' : '1.5px solid #ef4444',
                                    borderRadius: '3px'
                                  }}
                                  title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                                >
                                  {isVeg ? (
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                                  ) : (
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                                  )}
                                </div>

                                {isBestseller ? (
                                  <span 
                                    className="badge rounded-pill fw-semibold shadow-2xs"
                                    style={{
                                      backgroundColor: '#FEE2E2',
                                      color: '#DC2626',
                                      fontSize: '10.5px',
                                      padding: '2px 8px'
                                    }}
                                  >
                                    Bestseller
                                  </span>
                                ) : isPopular ? (
                                  <span 
                                    className="badge rounded-pill fw-semibold shadow-2xs"
                                    style={{
                                      backgroundColor: '#FEF3C7',
                                      color: '#D97706',
                                      fontSize: '10.5px',
                                      padding: '2px 8px'
                                    }}
                                  >
                                    Popular
                                  </span>
                                ) : null}
                              </div>'''

# And replace the card-body opening because we just opened it
card_body_str = '''                          {/* Card Content */}
                          <div className="card-body p-3 d-flex flex-column justify-content-between">
                            <div>'''

full_old = text[idx:end_idx + len(card_body_str)]
print('Replacing full_old of length:', len(full_old))

text = text[:idx] + new_block + text[end_idx + len(card_body_str):]

with open('frontend/src/pages/admin/Pos.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated Pos.jsx successfully!')

