try {
  const app = require("../server");
  module.exports = app;
} catch (error) {
  console.error("Vercel Serverless Initialization Error:", error);
  module.exports = (req, res) => {
    res.status(500).json({
      error: "Vercel Serverless Initialization Error",
      message: error.message,
      stack: error.stack
    });
  };
}
