const runLogisticsSync = require('../../api/logistics-sync');

// Função agendada (netlify.toml): não é acessível por URL em produção.
exports.handler = async () => {
  const results = await runLogisticsSync();
  console.log('[logistics-sync]', JSON.stringify(results));
  return { statusCode: 200 };
};
