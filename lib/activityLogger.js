const ActivityLog = require("../models/ActivityLog");

const logActivity = async (req, action, moduleName, details) => {
  try {
    if (!req.user) {
      return;
    }

    const userId = req.user._id || req.user.id;
    const userName = req.user.name;
    const userRole = req.user.role;
    const companyId = req.user.companyId;

    if (!userId || !companyId) {
      return;
    }

    await ActivityLog.create({
      userId,
      userName,
      userRole,
      companyId,
      action,
      module: moduleName,
      details,
    });
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
};

module.exports = logActivity;
