const adminProtect = (req, res, next) => {
  if (req.user && req.user.role === "super_admin") {
    next();
  } else {
    res.status(403).json({ message: "Not authorized as super admin" });
  }
};

module.exports = { adminProtect };
