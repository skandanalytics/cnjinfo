
export function cleanBranchParam(val) {
  if (val === null || val === undefined || typeof val === 'boolean') {
    return null;
  }
  const str = String(val).trim();
  if (!str || str === 'ALL' || str === 'all' || str === 'true' || str === 'false' || str === 'null' || str === 'undefined' || str === '[object Object]') {
    return null;
  }
  if (/^\d+$/.test(str)) {
    return str;
  }
  return null;
}

const tests = [true, false, 'true', 'false', 'ALL', 'all', 12, '12', '  12  ', null, undefined, {}, [], 'BR012', 'RS daba'];
for (const t of tests) {
  console.log(JSON.stringify(t), '->', JSON.stringify(cleanBranchParam(t)));
}
