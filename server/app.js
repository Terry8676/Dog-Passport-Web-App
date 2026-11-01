const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { requireAuth } = require("./auth");
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/meds", requireAuth, require("./routes/meds"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

module.exports = app;
