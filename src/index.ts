import express from "express";
import userRouter from "./routers/user";
import cors from "cors";
const app = express();
import dotenv from 'dotenv';
dotenv.config();

app.use(express.json());
app.use(cors());

app.use("/v1/user", userRouter);

app.listen(3005, () => {
  console.log("Server is running on port 3005");
});
