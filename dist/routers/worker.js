"use strict";
// import { PrismaClient } from "@prisma/client";
// import { Router } from "express";
// import jwt from "jsonwebtoken";
// import { JWT_SECRET_WORKER } from "../config";
// import { workerAuthMiddleware } from "../middleware";
// import { submitTaskSchema } from "../types";
// import { get } from "http";
// import { getTask } from "../db";
// const router = Router();
// const TOTAL_SUBMISSIONS = 100;
// const prisma = new PrismaClient();
// router.post("/signin", async (req, res) => {
//   const walletAddress = "7MMzskVdAjaKWPdVs7QG8dCpDotrCZ75ygJBWuy4rLtv";
//   let userId;
//   try {
//     const user = await prisma.worker.upsert({
//       where: { address: walletAddress },
//       update: {},
//       create: { address: walletAddress, pending_amount: 0, locked_amount: 0 },
//     });
//     userId = user.id;
//   } catch (error) {
//     console.error("Error during user upsert:", error);
//     res.status(500).json({ error: "An error occurred while signing in." });
//   }
//   const token = jwt.sign(
//     {
//       userId,
//     },
//     JWT_SECRET_WORKER
//   );
//   res.json({ token });
// });
// router.get("/next-task", workerAuthMiddleware, async (req, res) => {
//   // @ts-ignore
//   const userId = req.userId;
//   const task = await getTask(userId);
//   if (!task) {
//     return res.status(411).json({ message: "No tasks available" });
//   } else {
//     res.status(200).json(task);
//   }
// });
// router.post("/submission", workerAuthMiddleware, async (req, res) => {
//   // @ts-ignore
//   const userId = req.userId;
//   const body = req.body;
//   const safeBody = submitTaskSchema.safeParse(body);
//   if (!safeBody.success) {
//     return res.status(400).json({ message: "Invalid submission" });
//   } else {
//     const task = await getTask(userId);
//     if (!task || task?.id !== Number(safeBody.data.taskId)) {
//       return res.status(411).json({ message: "Incorrect task ID" });
//     } else {
//       const amount = Number(task.amount) / TOTAL_SUBMISSIONS;
//       const submitTransaction = await prisma.$transaction(async (tx) => {
//         const submission = await tx.submission.create({
//           data: {
//             task_id: Number(safeBody.data.taskId),
//             worker_id: userId,
//             option_id: Number(safeBody.data.selection),
//             amount,
//           },
//         });
//         await prisma.worker.update({
//           where: {
//             id: userId,
//           },
//           data: {
//             pending_amount: {
//               increment: Number(amount),
//             },
//           },
//         });
//         return submission;
//       });
//       const nextTask = await getTask(userId);
//       res.json({
//         nextTask,
//         amount,
//       });
//     }
//   }
//   router.get("/balance", workerAuthMiddleware, async (req, res) => {
//     // @ts-ignore
//     const userId = req.userId;
//     const userBalance = await prisma.worker.findUnique({
//       where: {
//         id: userId,
//       },
//       select: {
//         pending_amount: true,
//         locked_amount: true,
//       },
//     });
//     res.json(userBalance);
//   });
//   router.post("/withdraw", workerAuthMiddleware, async (req, res) => {
//     // @ts-ignore
//     const userId = req.userId;
//     const amount = await prisma.worker.findUnique({
//       where: {
//         id: userId,
//       },
//       select: {
//         pending_amount: true,
//       },
//     });
//   });
// });
// export default router;
