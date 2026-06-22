const { getAuth } = require("../lib/auth");
const { jwtVerify, createRemoteJWKSet } = require("jose");
const Company = require("../models/Company");

// JWKS পাবলিক কি-সেটের URL — Better Auth স্বয়ংক্রিয়ভাবে এই এন্ডপয়েন্ট তৈরি করে
const JWKS_URL = new URL(
  `${process.env.BETTER_AUTH_URL || "http://localhost:5000"}/api/auth/jwks`
);

// createRemoteJWKSet কল করে JWKS রিমোট থেকে পাবলিক কি রিড করার ফাংশন তৈরি করা হচ্ছে
const JWKS = createRemoteJWKSet(JWKS_URL);

/**
 * Handle subscription check to avoid code duplication
 * Returns true if valid, returns false and sends res if blocked.
 */
const handleSubscriptionCheck = async (req, res, companyId) => {
  const company = await Company.findById(companyId);

  if (company) {
    const now = new Date();
    const isSubscriptionExpired =
      company.subscriptionPlan !== "free" &&
      company.subscriptionExpiresAt &&
      new Date(company.subscriptionExpiresAt) < now;

    if (isSubscriptionExpired && company.status !== "suspended") {
      company.status = "suspended";
      await company.save();
    }

    if (company.status === "suspended") {
      const isBypass =
        req.originalUrl.includes("/api/payments") ||
        req.originalUrl.includes("/api/company/settings") ||
        req.originalUrl.includes("/api/auth");

      if (!isBypass) {
        res.status(402).json({
          message: "Subscription Expired or Suspended. Please complete payment to renew access.",
          code: "SUBSCRIPTION_EXPIRED",
          companyName: company.name
        });
        return false;
      }
    }
  }
  return true;
};

/**
 * protect মিডলওয়্যার — দুইভাবে অথেন্টিকেশন সাপোর্ট করে:
 * ১. Authorization: Bearer <JWT> হেডার — JWT ভেরিফাই করে JWKS দিয়ে
 * ২. কুকি সেশন — Better Auth-এর getSession দিয়ে ভেরিফাই করে
 */
const protect = async (req, res, next) => {
  try {
    // --------------------------------------------------
    // পদ্ধতি ১: Authorization: Bearer <token> হেডার চেক
    // --------------------------------------------------
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7); // "Bearer " এর পরের অংশটুকু নেওয়া হচ্ছে
      try {
        const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:5000";
        const { payload } = await jwtVerify(token, JWKS, {
          issuer: baseURL,   // JWT-এর Issuer অবশ্যই BETTER_AUTH_URL হতে হবে
          audience: baseURL, // JWT-এর Audience অবশ্যই BETTER_AUTH_URL হতে হবে
        });

        // টোকেনের পে-লোড থেকে ইউজার ডেটা req.user-এ সেট করা হচ্ছে
        req.user = {
          id: payload.id,
          email: payload.email,
          name: payload.name,
          role: payload.role,
          companyId: payload.companyId,
          companyName: payload.companyName,
          permissions: payload.permissions,
        };

        // সাবস্ক্রিপশন চেক
        if (req.user.companyId) {
          const isValid = await handleSubscriptionCheck(req, res, req.user.companyId);
          if (!isValid) return; 
        }

        return next();
      } catch (jwtError) {
        // JWT অবৈধ বা মেয়াদোত্তীর্ণ হলে 401 রিটার্ন করা হবে
        return res.status(401).json({
          message: "Invalid or expired JWT token",
          error: jwtError.message,
        });
      }
    }

    // --------------------------------------------------
    // পদ্ধতি ২: কুকি সেশন ভেরিফিকেশন (ডিফল্ট পদ্ধতি)
    // --------------------------------------------------
    const authInstance = await getAuth();
    const session = await authInstance.api.getSession({
      headers: req.headers
    });

    if (!session) {
      return res.status(401).json({ message: "Not authorized, no session" });
    }

    req.user = session.user;

    // সাবস্ক্রিপশন স্ট্যাটাস চেক
    if (req.user.companyId) {
      const isValid = await handleSubscriptionCheck(req, res, req.user.companyId);
      if (!isValid) return; 
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
