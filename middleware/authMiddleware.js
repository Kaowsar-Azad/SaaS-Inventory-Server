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

const checkPermission = (moduleName) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized, please log in." });
    }

    // Admins and Super Admins have full access
    if (req.user.role === "admin" || req.user.role === "super_admin") {
      return next();
    }

    // Managers/Staff require specific module permission
    const permissions = req.user.permissions || "";
    const allowedModules = permissions.split(",").map(p => p.trim().toLowerCase());

    if (allowedModules.includes(moduleName.toLowerCase())) {
      return next();
    }

    res.status(403).json({ message: `Access denied. Insufficient permissions for module: ${moduleName}` });
  };
};

module.exports = { protect, checkPermission };

