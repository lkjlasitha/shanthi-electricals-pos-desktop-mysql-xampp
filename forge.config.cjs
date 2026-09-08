const path = require('node:path');

const squirrelConfig = {
  name: 'shanthi_electricals_pos',
  authors: 'Shanthi Electricals',
  description: 'Shanthi Electricals point of sale, inventory, purchasing and reporting system',
  setupExe: 'Shanthi Electricals POS Setup.exe',
  setupIcon: path.resolve(__dirname, 'resources', 'icon.ico'),
  noMsi: true,
};

if (process.env.WINDOWS_CERTIFICATE_FILE) {
  squirrelConfig.certificateFile = process.env.WINDOWS_CERTIFICATE_FILE;
  squirrelConfig.certificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD || '';
}

module.exports = {
  packagerConfig: {
    name: 'Shanthi Electricals POS',
    executableName: 'ShanthiElectricalsPOS',
    asar: true,
    icon: path.resolve(__dirname, 'resources', 'icon'),
    ignore: [
      /^\/out($|\/)/,
      /^\/\.git($|\/)/,
      /^\/development-data($|\/)/,
      /^\/backend\/backups($|\/)/,
      /^\/\.env$/,
      /^\/backend\/\.env$/,
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: squirrelConfig,
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
