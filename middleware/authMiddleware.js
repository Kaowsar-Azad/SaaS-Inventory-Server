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

    // Check company subscription status
    if (req.user.companyId) {
      const Company = require("../models/Company");
      const company = await Company.findById(req.user.companyId);

      if (company) {
        const now = new Date();
        const isSubscriptionExpired =
          company.subscriptionPlan !== "free" &&
          company.subscriptionExpiresAt &&
          new Date(company.subscriptionExpiresAt) < now;

        if (isSubscriptionExpired) {
          // Auto suspend on expiration
          if (company.status !== "suspended") {
            company.status = "suspended";
            await company.save();
          }
        }

        if (company.status === "suspended") {
          // Allow payment routes, company settings (so they can read status and pay) and auth routes
          const isBypass =
            req.originalUrl.includes("/api/payments") ||
            req.originalUrl.includes("/api/company/settings") ||
            req.originalUrl.includes("/api/auth");

          if (!isBypass) {
            return res.status(402).json({
              message: "Subscription Expired or Suspended. Please complete payment to renew access.",
              code: "SUBSCRIPTION_EXPIRED",
              companyName: company.name
            });
          }
        }
      }
    }

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

