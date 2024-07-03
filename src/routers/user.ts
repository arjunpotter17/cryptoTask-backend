import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { TOTAL_DECIMALS } from "../config";
import {
  githubAppMiddleWare,
  githubMiddleware,
  verifyGitHubSignature,
} from "../middleware";
import axios from "axios";
import multer from "multer";
import { createLabel, getGithubUserData } from "../utils";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const prisma = new PrismaClient();
const upload = multer();

//route for github app installation
router.get("/app-installation", async (req, res) => {
  const { code, installation_id, setup_action } = req.query;
  const token = req.headers["authorization"];
  const client_id = process.env.APP_ID;
  const client_secret = process.env.APP_SECRET;
  try {
    const response = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id,
        client_secret,
        code,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    );
    const {
      access_token,
      refresh_token,
      expires_in,
      refresh_token_expires_in,
    } = response.data;

    const auth_token = token as string;

    const newExpiryDate = new Date();
    newExpiryDate.setSeconds(newExpiryDate.getSeconds() + expires_in);

    const newRefreshExpiryDate = new Date();
    newRefreshExpiryDate.setSeconds(
      newRefreshExpiryDate.getSeconds() + refresh_token_expires_in
    );

    const userData = await getGithubUserData(
      auth_token.replace("Bearer", "").trim()
    );
    const createResponse = await prisma.github.create({
      data: {
        token: access_token,
        expires_in: newExpiryDate,
        refresh_token_expires_in: newRefreshExpiryDate,
        refresh_token,
        user_github_id: userData.id,
      },
    });
    res.status(200).send({
      token: access_token,
      msg: "auth done!",
    });
  } catch (error) {
    console.error("Error exchanging code for app token:", error);
    res.status(500).send("App token fetching failed");
  }
});

//route to check the status of the app installation
router.get("/app-installation-status", async (req, res) => {
  const token = req.headers["authorization"];
  const auth_token = token as string;
  try {
    const userData = await getGithubUserData(
      auth_token.replace("Bearer", "").trim()
    );
    const githubRecord = await prisma.github.findFirst({
      where: {
        user_github_id: userData.id,
      },
    });

    if (!githubRecord) {
      return res.status(200).json({ status: "false" });
    }

    res.status(200).json({ status: "done" });
  } catch (error) {
    console.error("Error fetching app installation status:", error);
    res.status(500).json({ status: "pending" });
  }
});

//route to get the github auth token from code
router.post("/githubAuthToken", async (req, res) => {
  const code = req.query.code;
  const client_id = process.env.AUTH_CLIENT_ID;
  const client_secret = process.env.AUTH_CLIENT_SECRET;
  const params =
    "?client_id=" +
    client_id +
    "&client_secret=" +
    client_secret +
    "&code=" +
    code;

  try {
    const result = await axios.post(
      "https://github.com/login/oauth/access_token" + params,
      null,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const token = result.data.access_token;

    const userData = await getGithubUserData(token);
    const { id: githubId, login: username } = userData;

    const user = await prisma.user.upsert({
      where: { githubId },
      update: {},
      create: { githubId, address: "" },
    });

    res.status(200).send({
      token,
      msg: "auth done!",
    });
  } catch (e) {
    console.log(e);
  }
});

//get the github user repos
router.post("/github-repos", githubAppMiddleWare, async (req, res) => {
  try {
    const userRepos = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: req.headers["app_authorization"],
        Accept: "application/vnd.github.v3+json",
      },
    });

    const userOrgs = await axios.get("https://api.github.com/user/orgs", {
      headers: {
        Authorization: req.headers["app_authorization"],
        Accept: "application/vnd.github.v3+json",
      },
    });

    const orgReposPromises = userOrgs.data.map(async (org: any) => {
      const orgRepos = await axios.get(
        `https://api.github.com/orgs/${org.login}/repos`,
        {
          headers: {
            Authorization: req.headers["app_authorization"],
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
      return orgRepos.data;
    });

    const orgRepos = await Promise.all(orgReposPromises);
    const allOrgRepos = orgRepos.flat();

    res.status(200).json({
      userRepos: userRepos.data,
      orgRepos: allOrgRepos,
    });
  } catch (error) {
    console.error("Error fetching repositories:", error);
    res.status(500).send("Error fetching repositories");
  }
});

//receive the webhook from github
router.post("/webhooks/github", verifyGitHubSignature, async (req, res) => {
  const event = req.headers["x-github-event"];
  const payload = req.body;

  if (event === "pull_request") {
    const action = payload.action;
    const pullRequest = payload.pull_request;

    // Check if the PR is merged
    if (action === "closed" && pullRequest.merged) {
      const issueIdPattern = /#(\d+)/;
      const matches =
        pullRequest.title.match(issueIdPattern) ||
        pullRequest.body.match(issueIdPattern);

      if (matches) {
        const issueId = parseInt(matches[1]);
        const repo = payload.repository.full_name; // Get the full name of the repository

        // Check if this issue ID and repo combination is a task in the backend
        const task = await prisma.task.findUnique({
          where: {
            repo_issueId: {
              repo: repo,
              issueId: issueId,
            },
          },
        });

        if (task) {
          const mergedBy = pullRequest.merged_by.id; // GitHub ID of the person who merged the PR

          // Check if the user who merged the PR is a user on the platform
          const user = await prisma.user.findUnique({
            where: { githubId: mergedBy },
          });

          if (user) {
            // Update the task as completed
            await prisma.task.update({
              where: { id: task.id },
              data: {
                done: true,
                completedBy: user.githubId,
              },
            });

            // Update the total redeemed amount for the user
            await prisma.user.update({
              where: { id: user.id },
              data: {
                totalRedeemed: {
                  increment: task.amount,
                },
              },
            });

            console.log(
              `Task ${task.id} marked as completed by user ${user.githubId}`
            );
          }
        }
      }
    }
  }

  res.status(200).send("Webhook received");
});

//route to get the user profile data
router.get("/profile", githubMiddleware, async (req, res) => {
  //@ts-ignore
  const userId = req.user.id;

  try {
    const user = await prisma.user.findUnique({
      where: { githubId: userId },
      include: {
        createdTasks: true,
        completedTasks: { where: { done: true } },
        payouts: true,
      },
    });

    //@ts-ignore
    const githubData = req.user;

    const totalRedeemed =
      user?.payouts.reduce((sum, payout) => sum + payout.amount, 0) || 0;

    res.json({
      name: githubData.name,
      email: githubData.email,
      avatarUrl: githubData.avatar_url,
      createdTasks: user?.createdTasks,
      completedTasks: user?.completedTasks,
      totalRedeemed: totalRedeemed,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error fetching profile data" });
  }
});

//route to create a task
router.post(
  "/create-issue",
  githubAppMiddleWare,
  upload.single("image"),
  async (req, res) => {
    const { title, description, repo, amount, expiry } = req.body;
    const auth_token = req.headers["app_authorization"] as string;
    const token = auth_token?.replace("Bearer", "").trim();
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

    const data = await getGithubUserData(token as string);

    // Add image to the description if uploaded
    let descriptionWithImage = `**This is a cryptoTask bounty issue, before creating a Pull request please create an account on cryptoTask to claim the bounty.** \n **Referencing the issue in the PR body or title is mandatory to avail bounty.**. \n\n\n\nIssue Description: \n\n${description}`;
    if (req.file) {
      const image = req.file;
      const imageUrl = `data:${image.mimetype};base64,${image.buffer.toString(
        "base64"
      )}`;
      descriptionWithImage += `\n\n![Image](${imageUrl})`;
    }

    try {
      // Check if issues are enabled
      const repoResponse = await axios.get(
        `https://api.github.com/repos/${repo}`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      const { has_issues } = repoResponse.data;

      // Enable issues if not enabled
      if (!has_issues) {
        await axios.patch(
          `https://api.github.com/repos/${repo}`,
          { has_issues: true },
          {
            headers: {
              Authorization: `token ${token}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );
      }

      //create cryptoTask label
      createLabel(repo, token as string);

      const response = await axios.post(
        `https://api.github.com/repos/${repo}/issues`,
        {
          title,
          body: descriptionWithImage,
          labels: ["cryptoTask"],
        },
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      const task = await prisma.task.create({
        data: {
          title,
          description,
          creatorId: data?.id,
          url: response.data.html_url,
          repo: repo,
          issueId: response.data.number,
          amount: parseFloat(amount) * TOTAL_DECIMALS, // Adjust as needed
          payment_sig: "", // Adjust as needed
          expiry: expiry, // Add the expiry field here
        },
      });

      await axios.post(
        `https://api.github.com/repos/${repo}/hooks`,
        {
          name: "web",
          active: true,
          events: ["pull_request"],
          config: {
            url: "https://a589-2401-4900-1cc4-54b3-69c3-4b10-3344-4ace.ngrok-free.app/v1/user/webhooks/github",
            content_type: "json",
            secret: WEBHOOK_SECRET,
          },
        },
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      res.status(200).json({
        message: "Issue and task created successfully",
        issueUrl: response.data?.html_url,
      });
    } catch (error: any) {
      console.error("Error creating issue or task:", error);
      res.status(500).json({
        message: "Error creating issue or task",
        error: error.response ? error.response.data : error.message,
      });
    }
  }
);

//route to get github user data
router.get("/github-userData", async (req, res) => {
  const token = req.get("Authorization");

  try {
    const data = await getGithubUserData(token as string);
    res.status(200).send(data);
  } catch {
    res.status(500).send({
      msg: "github failed us",
    });
  }
});

//route to get all the tasks
router.get("/tasks", async (req, res) => {
  try {
    const tasks = await prisma.task.findMany();

    res.status(200).json(tasks);
  } catch (error: any) {
    console.error("Error retrieving tasks:", error);
    res.status(500).json({
      message: "Error retrieving tasks",
      error: error.message,
    });
  }
});

export default router;
