import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "kr.co.grand.codimate",
  appName: "코디메이트",
  webDir: "dist",
  android: { allowMixedContent: false },
  server: { androidScheme: "https" },
};
export default config;
