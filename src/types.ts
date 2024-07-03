import z from "zod";

export const taskInputSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  options: z
    .array(
      z.object({
        imageUrl: z.string().url(),
      })
    )
    .min(4)
    .max(10),
  payment_sig: z.string().min(1).max(1000),
});

export const submitTaskSchema = z.object({
  selection: z.string(),
  taskId: z.string(),
});
