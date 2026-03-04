import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cardsRouter from "./routes/cards.js";

const app = express();
app.set("trust proxy", 1);

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.use("/api", cardsRouter);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static files (widget.js)
app.use(
  express.static(path.join(__dirname, "../public"), {
    setHeaders(res, filePath) {
      if (filePath.endsWith(".js")) {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      }
      res.setHeader("Cache-Control", "public, max-age=300"); // 5 min
    }
  })
);

app.get("/", (_req, res) => {
  res.type("text/plain").send("Huislijn widget service running.");
});

const port = Number(process.env.PORT || 10000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on :${port}`);
});
