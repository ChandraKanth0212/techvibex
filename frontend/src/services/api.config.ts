export const API_CONFIG = {
  useMock: import.meta.env.VITE_USE_MOCK_DATA !== 'false',
  module1DataApi: import.meta.env.VITE_MODULE_1_DATA_API || 'http://localhost:5000/api/v1',
  module2AiApi: import.meta.env.VITE_MODULE_2_AI_API || 'http://localhost:5001/api/v1',
  module3OptimizerApi: import.meta.env.VITE_MODULE_3_OPTIMIZER_API || 'http://localhost:5002/api/v1',
  wsEndpoint: import.meta.env.VITE_WS_ENDPOINT || 'ws://localhost:5000/ws',
};
