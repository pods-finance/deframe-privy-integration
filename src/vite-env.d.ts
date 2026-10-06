/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_APP_PRIVY_APP_ID: string;
  readonly VITE_APP_DEFRAME_API_URL: string;
  readonly VITE_APP_DEFRAME_API_KEY: string;
  readonly VITE_APP_HELIUS_API_KEY: string;
  readonly VITE_APP_RAMP_KYC_USER_ID?: string;
  readonly VITE_APP_RAMP_KYC_USER_ID_USD?: string;
  readonly VITE_APP_ALCHEMY_API_KEY?: string;
  readonly VITE_APP_STELLAR_HORIZON_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
