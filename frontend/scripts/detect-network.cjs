const net = require('../../scripts/detect-network.cjs');

module.exports = net;

if (require.main === module) {
  net.printNetworkBanner();
}
