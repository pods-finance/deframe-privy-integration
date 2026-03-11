/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_APP_PRIVY_APP_ID: string;
  readonly VITE_APP_DEFRAME_API_URL: string;
  readonly VITE_APP_DEFRAME_API_KEY: string;
  readonly VITE_APP_ALCHEMY_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
