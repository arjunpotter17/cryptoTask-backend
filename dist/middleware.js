import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { getGithubUserData } from "./utils.js";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const prisma = new PrismaClient();
const client_id = process.env.APP_ID;
const client_secret = process.env.APP_SECRET;
// export function authMiddleware(
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   const token = req.headers["authorization"];
//   const decoded = jwt.verify(token as string, JWT_SECRET);
//   try {
//     // @ts-ignore
//     if (decoded.userId) {
//       // @ts-ignore
//       req.userId = decoded.userId;
//       return next();
//     } else {
//       res.status(403).json({ error: "Not logged in" });
//     }
//   } catch {
//     res.status(403).json({ error: "Unauthorized Token" });
//   }
// }
export function verifyGitHubSignature(req, res, next) {
  const signature = req.headers["x-hub-signature-256"];
  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  const digest = `sha256=${hmac
    .update(JSON.stringify(req.body))
    .digest("hex")}`;
  if (signature === digest) {
    return next();
  } else {
    res.status(401).send("Request body was not signed or verification failed");
  }
}
export async function githubAppMiddleWare(req, res, next) {
  const userToken = req.headers["authorization"];
  const stripToken = userToken?.replace("Bearer", "").trim();
  console.log("this is stripToken", stripToken);
  if (!stripToken) return res.status(401).json({ error: "Unauthorized entry" });
  const userData = await getGithubUserData(stripToken);
  const { id: user_github_id } = userData;
  const githubRecord = await prisma.github.findFirst({
    where: {
      user_github_id,
    },
  });
  console.log("this is userToken", githubRecord);
  if (!githubRecord) {
    return res.status(500).json({ message: "GitHub credentials not found" });
  }
  const { token, refresh_token, expires_in, refresh_token_expires_in } =
    githubRecord;
  const now = new Date();
  const expiresInDate = new Date(expires_in); // Convert seconds to Date
  const refreshExpiresInDate = new Date(refresh_token_expires_in); // Convert seconds to Date
  console.log(now, expiresInDate, refreshExpiresInDate);
  if (now >= expiresInDate && now < refreshExpiresInDate) {
    try {
      const response = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id,
          client_secret,
          refresh_token: refresh_token,
          grant_type: "refresh_token",
        },
        {
          headers: {
            Accept: "application/json",
          },
        }
      );
      const {
        access_token,
        refresh_token: new_refresh_token,
        expires_in,
        refresh_token_expires_in,
      } = response.data;
      const newExpiryDate = new Date();
      newExpiryDate.setSeconds(newExpiryDate.getSeconds() + expires_in);
      const newRefreshExpiryDate = new Date();
      newRefreshExpiryDate.setSeconds(
        newRefreshExpiryDate.getSeconds() + refresh_token_expires_in
      );
      await prisma.github.update({
        where: { id: githubRecord.id },
        data: {
          token: access_token,
          refresh_token: new_refresh_token,
          expires_in: newExpiryDate,
          refresh_token_expires_in: newRefreshExpiryDate,
        },
      });
      req.headers["app_authorization"] = `Bearer ${access_token}`; // Attach the token to the request object
    } catch (error) {
      console.error("Error refreshing GitHub token:", error);
      return res.status(500).json({ message: "Error refreshing GitHub token" });
    }
  } else if (now > refresh_token_expires_in) {
    return res.status(500).json({
      message: "Github App refresh token expired, please re-install the app",
    });
  } else {
    req.headers["app_authorization"] = `Bearer ${token}`;
  }
  next();
}
export const githubMiddleware = async (req, res, next) => {
  const token = req.get("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    // Logic to check and refresh token if needed
    const githubData = await getGithubUserData(token);
    //@ts-ignore
    req.token = token;
    //@ts-ignore
    req.user = githubData;
    next();
  } catch (error) {
    res.status(500).json({ error: "Error fetching GitHub data" });
  }
};
