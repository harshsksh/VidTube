import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use(express.static("public")); // for static files 

app.use(cookieParser());

// routes
import userRouter from "./routes/user.route.js";

// In your app.js / server entry point
import fs from "fs";
if (!fs.existsSync("./public/temp")) {
  fs.mkdirSync("./public/temp", { recursive: true });
}

app.use("/api/v1/users", userRouter)

export default app;