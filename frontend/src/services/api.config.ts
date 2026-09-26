export const API_CONFIG = {
  useMock: import.meta.env.VITE_USE_MOCK_DATA !== 'false',
  /**
   * Feature switch for the REAL Module 3 optimizer API.
   * Opt-in by default: while false, the mock services remain the only data
   * source and optimizerService throws OptimizerDisabledError if called.
   */
  useRealOptimizer: import.meta.env.VITE_USE_REAL_OPTIMIZER_API === 'true',
  module1DataApi: import.meta.env.VITE_MODULE_1_DATA_API || 'http://localhost:5000/api/v1',
  module2AiApi: import.meta.env.VITE_MODULE_2_AI_API || 'http://localhost:5001/api/v1',
  /**
   * Origin only - Module 3 mounts its own `/api/optimizer/*` routes and does NOT
   * live under an `/api/v1` prefix.
   */
  module3OptimizerApi: import.meta.env.VITE_MODULE_3_OPTIMIZER_API || 'http://localhost:5002',
  wsEndpoint: import.meta.env.VITE_WS_ENDPOINT || 'ws://localhost:5000/ws',
};
