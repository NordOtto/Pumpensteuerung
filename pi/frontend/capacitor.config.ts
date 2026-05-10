import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'local.pumpe.app',
  appName: 'Pumpe',
  webDir: 'public',
  server: {
    url: 'https://pumpe.local',
    cleartext: false,
    androidScheme: 'https',
  },
};

export default config;
