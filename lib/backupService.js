const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// Backup directory setup (use /tmp on Vercel)
const BACKUP_DIR = process.env.VERCEL || process.env.NODE_ENV === "production" 
  ? path.join("/tmp", "backups") 
  : path.join(__dirname, "..", "backups");

// Ensure backup directory exists only when needed
const ensureBackupDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
};

/**
 * Runs a database backup by exporting collections to a formatted JSON archive
 */
const runDatabaseBackup = async () => {
  console.log("[BackupService] Starting database backup...");
  try {
    ensureBackupDir();
    const backupData = {
      timestamp: new Date().toISOString(),
      collections: {}
    };

    // List of models/collections to backup
    const modelsToBackup = [
      { name: "User", modelName: "User" },
      { name: "Company", modelName: "Company" },
      { name: "Product", modelName: "Product" },
      { name: "ActivityLog", modelName: "ActivityLog" },
      { name: "Warehouse", modelName: "Warehouse" },
      { name: "Adjustment", modelName: "Adjustment" },
      { name: "Supplier", modelName: "Supplier" },
      { name: "Customer", modelName: "Customer" },
      { name: "Purchase", modelName: "Purchase" },
      { name: "Sale", modelName: "Sale" }
    ];

    for (const m of modelsToBackup) {
      try {
        // Retrieve dynamic mongoose model
        if (mongoose.models[m.modelName]) {
          const Model = mongoose.model(m.modelName);
          const data = await Model.find({}).lean();
          backupData.collections[m.name] = data;
          console.log(`[BackupService] Backed up ${data.length} records from ${m.name}`);
        } else {
          // Try to require the model file to register it
          try {
            const Model = require(`../models/${m.modelName}`);
            const data = await Model.find({}).lean();
            backupData.collections[m.name] = data;
            console.log(`[BackupService] Loaded and backed up ${data.length} records from ${m.name}`);
          } catch (e) {
            console.log(`[BackupService] Model ${m.modelName} is not registered and could not be loaded. Skipping.`);
          }
        }
      } catch (err) {
        console.error(`[BackupService] Error backing up collection ${m.name}:`, err);
      }
    }

    // Write backup data to file
    const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${timestampStr}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2), "utf8");
    console.log(`[BackupService] Database backup created successfully: ${filepath}`);

    // Clean up old backups (keep only last 7 backups)
    cleanupOldBackups();

    return filepath;
  } catch (error) {
    console.error("[BackupService] Database backup failed:", error);
    throw error;
  }
};

/**
 * Keeps only the last 7 backup files, deleting older ones
 */
const cleanupOldBackups = () => {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("backup-") && f.endsWith(".json"))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // newest first

    if (files.length > 7) {
      const filesToDelete = files.slice(7);
      for (const f of filesToDelete) {
        const fullpath = path.join(BACKUP_DIR, f.name);
        fs.unlinkSync(fullpath);
        console.log(`[BackupService] Cleaned up old backup file: ${f.name}`);
      }
    }
  } catch (err) {
    console.error("[BackupService] Failed to clean up old backups:", err);
  }
};

module.exports = { runDatabaseBackup };
