/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  readonly VITE_USE_MOCK_DATA: string;
  readonly VITE_USE_REAL_OPTIMIZER_API: string;
  readonly VITE_MODULE_1_DATA_API: string;
  readonly VITE_MODULE_2_AI_API: string;
  readonly VITE_MODULE_3_OPTIMIZER_API: string;
  readonly VITE_WS_ENDPOINT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
