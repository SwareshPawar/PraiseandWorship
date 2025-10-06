// Simple test serverless function
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  res.json({ 
    message: 'Simple test working!', 
    method: req.method,
    url: req.url,
    path: req.path,
    timestamp: new Date().toISOString() 
  });
};