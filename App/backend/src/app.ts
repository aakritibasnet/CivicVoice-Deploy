import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import routes from "@/routes";
import { errorHandler } from "@/middleware/error";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "API running" });
});

app.use("/api", routes);

app.use(errorHandler);

export default app;
