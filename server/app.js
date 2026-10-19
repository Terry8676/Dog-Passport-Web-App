const path = require("path");
const express = require("express");
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/api/meds", require("./routes/meds"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

module.exports = app;
