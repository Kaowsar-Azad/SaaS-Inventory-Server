const mongoose = require("mongoose");

const mongoUri = "mongodb+srv://SaaSadmin:09pKIeCMEnikdnMk@cluster0.a8ovzs8.mongodb.net/?appName=Cluster0";

async function main() {
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");
  const db = mongoose.connection.db;

  const accounts = await db.collection("account").find().toArray();
  console.log("Accounts in DB:");
  console.log(JSON.stringify(accounts, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
