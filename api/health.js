// Vercel Serverless Function — Health Check
module.exports = function handler(req, res) {
  res.json({ status: 'ok' });
};
