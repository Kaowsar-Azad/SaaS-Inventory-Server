const { getAuth } = require("../lib/auth");

const protect = async (req, res, next) => {
  try {
    const authInstance = getAuth();
    const session = await authInstance.api.getSession({
      headers: req.headers
    });

    if (!session) {
      return res.status(401).json({ message: "Not authorized, no session" });
    }

    req.user = session.user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Not authorized, session verification failed", error: error.message });
  }
};

module.exports = { protect };

