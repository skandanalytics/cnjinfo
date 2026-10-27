const os = require('os');

/**
 * Discovers and ranks network interfaces on the host machine.
 * Distinguishes physical LAN (Wi-Fi / Ethernet) from VPNs (OpenVPN, WireGuard)
 * and virtual adapters (WSL, Hyper-V, Docker).
 */
function detectNetwork() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  const vpnKeywords = [
    'openvpn', 'tun', 'tap', 'nord', 'wireguard', 'tailscale',
    'zerotier', 'fortinet', 'anyconnect', 'pulse', 'cisco', 'secue', 'vpn'
  ];
  const virtualKeywords = [
    'vethernet', 'wsl', 'virtualbox', 'vmware', 'hyper-v', 'docker', 'container', 'bridge'
  ];
  const physicalKeywords = [
    'wi-fi', 'wifi', 'wlan', 'ethernet', 'eth', 'en', 'wl', 'local area connection'
  ];

  for (const [name, addrs] of Object.entries(ifaces)) {
    const lowerName = name.toLowerCase();
    const isVpnName = vpnKeywords.some(kw => lowerName.includes(kw));
    const isVirtualName = virtualKeywords.some(kw => lowerName.includes(kw));
    const isPhysicalName = physicalKeywords.some(kw => lowerName.includes(kw));

    for (const addr of addrs) {
      if (addr.family !== 'IPv4' && addr.family !== 4) continue;
      if (addr.internal) continue;
      if (addr.address.startsWith('127.')) continue;
      if (addr.address.startsWith('169.254.')) continue; // APIPA link-local

      const isZeroMac = !addr.mac || addr.mac === '00:00:00:00:00:00';
      const isVpn = isVpnName || (isZeroMac && (addr.address.startsWith('10.8.') || addr.address.startsWith('10.9.')));
      const isVirtual = isVirtualName;

      let score = 0;
      if (isPhysicalName) score += 50;
      if (!isZeroMac) score += 30;
      if (addr.address.startsWith('192.168.')) score += 20;
      else if (addr.address.startsWith('172.')) score += 10;
      else if (addr.address.startsWith('10.')) score += 5;

      if (isVpn) score -= 40;
      if (isVirtual) score -= 60;

      let type = 'lan';
      if (isVpn) type = 'vpn';
      else if (isVirtual) type = 'virtual';
      else if (isPhysicalName) type = 'physical_lan';

      candidates.push({
        interface: name,
        address: addr.address,
        netmask: addr.netmask,
        mac: addr.mac,
        type,
        isVpn,
        isVirtual,
        score
      });
    }
  }

  // Sort descending by score
  candidates.sort((a, b) => b.score - a.score);

  const preferred = candidates.find(c => !c.isVpn && !c.isVirtual) || candidates[0] || null;
  const vpnInterfaces = candidates.filter(c => c.isVpn);

  return {
    preferredIp: preferred ? preferred.address : '127.0.0.1',
    preferredInterface: preferred ? preferred.interface : 'Loopback',
    candidates,
    vpnDetected: vpnInterfaces.length > 0,
    vpnInterfaces
  };
}

/**
 * Returns just the preferred LAN IPv4 string.
 */
function getPreferredLanIp() {
  const result = detectNetwork();
  return result.preferredIp;
}

/**
 * Prints a clean terminal banner showing the active LAN address and warnings.
 */
function printNetworkBanner({ frontendPort = 5173, backendPort = 8000 } = {}) {
  const net = detectNetwork();
  const sep = '='.repeat(64);
  const thin = '-'.repeat(64);

  console.log('\n' + sep);
  console.log('   FOODIE RESTAURANT PLATFORM -- DYNAMIC NETWORK DISCOVERY');
  console.log(sep);
  console.log(` > Local Access:       http://localhost:${frontendPort}/`);
  console.log(` > LAN Access (WiFi):  http://${net.preferredIp}:${frontendPort}/`);
  console.log(` > Django API Server:  http://${net.preferredIp}:${backendPort}/api/`);
  console.log(` > Active Interface:   ${net.preferredInterface} (${net.preferredIp})`);

  if (net.vpnDetected) {
    console.log(thin);
    console.log(' [!] NOTICE: VPN Interface Detected:');
    net.vpnInterfaces.forEach(v => {
      console.log(`     - ${v.interface} (${v.address})`);
    });
    console.log('     * For phones/tablets on your local Wi-Fi router to scan QR codes');
    console.log(`       or open menus, use http://${net.preferredIp}:${frontendPort}/`);
  }

  if (net.candidates.length > 1) {
    console.log(thin);
    console.log(' All available network interfaces:');
    net.candidates.forEach(c => {
      const tag = c.isVpn ? '[VPN]' : (c.isVirtual ? '[VIRTUAL]' : '[LAN]');
      const pref = c.address === net.preferredIp ? ' (Preferred)' : '';
      console.log(`   - ${c.interface.padEnd(28)} ${c.address.padEnd(16)} ${tag}${pref}`);
    });
  }

  console.log(sep + '\n');
}

module.exports = {
  detectNetwork,
  getPreferredLanIp,
  printNetworkBanner
};

if (require.main === module) {
  printNetworkBanner();
}
