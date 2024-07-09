import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { TOTAL_DECIMALS } from "../config.js";
import { githubAppMiddleWare, githubMiddleware, verifyGitHubSignature, } from "../middleware.js";
import axios from "axios";
import multer from "multer";
import { createLabel, getGithubUserData } from "../utils.js";
import dotenv from "dotenv";
dotenv.config();
const router = Router();
const prisma = new PrismaClient();
const upload = multer();
//route for github app installation
router.get("/app-installation", async (req, res) => {
    const { code } = req.query;
    const token = req.headers["authorization"];
    const client_id = process.env.APP_ID;
    const client_secret = process.env.APP_SECRET;
    try {
        const response = await axios.post("https://github.com/login/oauth/access_token", {
            client_id,
            client_secret,
            code,
        }, {
            headers: {
                Accept: "application/json",
            },
        });
        const { access_token, refresh_token, expires_in, refresh_token_expires_in, } = response.data;
        const auth_token = token;
        console.log('this is token', token)
        const newExpiryDate = new Date();
        newExpiryDate.setSeconds(newExpiryDate.getSeconds() + expires_in);
        const newRefreshExpiryDate = new Date();
        newRefreshExpiryDate.setSeconds(newRefreshExpiryDate.getSeconds() + refresh_token_expires_in);
        const userData = await getGithubUserData(auth_token.replace("Bearer", "").trim());
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
    }
    catch (error) {
        console.error("Error exchanging code for app token:", error);
        res.status(500).send("App token fetching failed");
    }
});
//route to check the status of the app installation
router.get("/app-installation-status", async (req, res) => {
    const token = req.headers["authorization"];
    const auth_token = token;
    try {
        const userData = await getGithubUserData(auth_token.replace("Bearer", "").trim());
        const githubRecord = await prisma.github.findFirst({
            where: {
                user_github_id: userData.id,
            },
        });
        if (!githubRecord) {
            return res.status(200).json({ status: "false" });
        }
        res.status(200).json({ status: "done" });
    }
    catch (error) {
        console.error("Error fetching app installation status:", error);
        res.status(500).json({ status: "error" });
    }
});
//route to get the github auth token from code
router.post("/githubAuthToken", async (req, res) => {
    const code = req.query.code;
    const client_id = process.env.AUTH_CLIENT_ID;
    const client_secret = process.env.AUTH_CLIENT_SECRET;
    console.log(client_id, client_secret, "id secret");
    const params = "?client_id=" +
        client_id +
        "&client_secret=" +
        client_secret +
        "&code=" +
        code;
    try {
        const result = await axios.post("https://github.com/login/oauth/access_token" + params, null, {
            headers: {
                Accept: "application/json",
            },
        });
        const token = result.data.access_token;
        const userData = await getGithubUserData(token);
        const { id: githubId, login: username } = userData;
        const user = await prisma.user.upsert({
            where: { githubId },
            update: {},
            create: { githubId },
        });
        res.status(200).send({
            token,
            msg: "auth done!",
        });
    }
    catch (e) {
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
        const orgReposPromises = userOrgs.data.map(async (org) => {
            const orgRepos = await axios.get(`https://api.github.com/orgs/${org.login}/repos`, {
                headers: {
                    Authorization: req.headers["app_authorization"],
                    Accept: "application/vnd.github.v3+json",
                },
            });
            return orgRepos.data;
        });
        const orgRepos = await Promise.all(orgReposPromises);
        const allOrgRepos = orgRepos.flat();
        res.status(200).json({
            userRepos: userRepos.data,
            orgRepos: allOrgRepos,
        });
    }
    catch (error) {
        console.error("Error fetching repositories:", error);
        res.status(500).send("Error fetching repositories");
    }
});
//get task details for withdraw and close
router.get('/task/withdraw/:id', async (req, res) => {
    const taskId = parseInt(req.params.id);
    try {
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: {
                amount: true,
                escrow_seed: true,
                maker_key: true,
                task_key: true,
            },
        });
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        // Convert BigInt to string
        const taskWithStringifiedBigInt = {
            ...task,
            amount: task.amount.toString(),
        };
        res.json(taskWithStringifiedBigInt);
    }
    catch (error) {
        console.error('Error retrieving task:', error);
        res.status(500).json({ error: 'Internal server error' });
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
            const matches = pullRequest.title.match(issueIdPattern) ||
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
                    const createdBy = pullRequest.user.id; // GitHub ID of the person who created the PR
                    // Check if the user who created the PR is a user on the platform
                    const user = await prisma.user.findUnique({
                        where: { githubId: createdBy },
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
                                unredeemedAmount: {
                                    increment: task.amount,
                                },
                            },
                        });
                        console.log(`Task ${task.id} marked as completed by user ${user.githubId}`);
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
        const totalRedeemed = user?.payouts.reduce((sum, payout) => sum + Number(payout.amount), 0) || 0;
        const userWithStringifiedBigInt = {
            name: githubData.name,
            profileUsername: githubData.githubUsername,
            email: githubData.email,
            avatarUrl: githubData.avatar_url,
            createdTasks: user?.createdTasks.map(task => ({
                ...task,
                amount: task.amount.toString()
            })),
            completedTasks: user?.completedTasks.map(task => ({
                ...task,
                amount: task.amount.toString()
            })),
            totalRedeemed: totalRedeemed.toString(),
            unredeemedAmount: user?.unredeemedAmount.toString(),
        };
        res.json(userWithStringifiedBigInt);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error fetching profile data" });
    }
});
//route for existing issues modification
router.post("/add-label-fetch-issue", githubAppMiddleWare, async (req, res) => {
    const { repo, issueUrl, amount, escrowSeed, depositId, initId, key } = req.body;
    const auth_token = req.headers["app_authorization"];
    const token = auth_token?.replace("Bearer", "").trim();
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
    try {
        const issueNumber = issueUrl.split('/').pop();
        // Create cryptoTask label
        createLabel(repo, token);
        // Add label to the issue
        await axios.post(`https://api.github.com/repos/${repo}/issues/${issueNumber}/labels`, { labels: ["cryptoTask"] }, {
            headers: {
                Authorization: `token ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });
        // Fetch issue details
        const issueResponse = await axios.get(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
            headers: {
                Authorization: `token ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });
        const issueData = issueResponse.data;
        // Create task in the database
        const data = await getGithubUserData(token);
        const task = await prisma.task.create({
            data: {
                title: issueData.title,
                description: issueData.body,
                creatorId: data.id,
                url: issueData.html_url,
                repo: repo,
                issueId: issueData.number,
                amount: amount, // Adjust as needed if amount needs to be set
                payment_sig: initId, // Adjust as needed
                escrow_seed: escrowSeed, // Adjust as needed
                maker_key: depositId, // Adjust as needed
                task_key: key, // Adjust as needed
            },
        });
        if (!task) {
            return res.status(500).json({
                message: "Error creating task on db",
            });
        }
        // Check if webhook already exists
        const hooksResponse = await axios.get(`https://api.github.com/repos/${repo}/hooks`, {
            headers: {
                Authorization: `token ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });
        const existingHook = hooksResponse.data.find((hook) => hook.config.url === "https://9a09-2401-4900-1cc5-dbc0-6672-275d-de82-87f6.ngrok-free.app/v1/user/webhooks/github");
        if (!existingHook) {
            await axios.post(`https://api.github.com/repos/${repo}/hooks`, {
                name: "web",
                active: true,
                events: ["pull_request"],
                config: {
                    url: "https://9a09-2401-4900-1cc5-dbc0-6672-275d-de82-87f6.ngrok-free.app/v1/user/webhooks/github",
                    content_type: "json",
                    secret: WEBHOOK_SECRET,
                },
            }, {
                headers: {
                    Authorization: `token ${token}`,
                    Accept: "application/vnd.github.v3+json",
                },
            });
        }
        res.status(200).json({
            message: "Label added, issue details fetched, and task created successfully",
            issueUrl: issueData.html_url,
        });
    }
    catch (error) {
        console.error("Error adding label, fetching issue details, or creating task:", error);
        res.status(500).json({
            message: "Error adding label, fetching issue details, or creating task",
            error: error.response ? error.response.data : error.message,
        });
    }
});
//route to create a task
router.post("/create-issue", githubAppMiddleWare, upload.single("image"), async (req, res) => {
    const { title, description, repo, amount, escrowSeed, depositId, initId, key } = req.body;
    const auth_token = req.headers["app_authorization"];
    const token = auth_token?.replace("Bearer", "").trim();
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
    const data = await getGithubUserData(token);
    // Add image to the description if uploaded
    let descriptionWithImage = `**This is a cryptoTask bounty issue, before creating a Pull request please create an account on cryptoTask to claim the bounty.** \n **Referencing the issue in the PR body is mandatory to avail bounty.**. \n\n\n\nIssue Description: \n${description}`;
    let issueNumber;
    try {
        // Check if issues are enabled
        const repoResponse = await axios.get(`https://api.github.com/repos/${repo}`, {
            headers: {
                Authorization: `token ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });
        const { has_issues } = repoResponse.data;
        // Enable issues if not enabled
        if (!has_issues) {
            await axios.patch(`https://api.github.com/repos/${repo}`, { has_issues: true }, {
                headers: {
                    Authorization: `token ${token}`,
                    Accept: "application/vnd.github.v3+json",
                },
            });
        }
        //create cryptoTask label
        createLabel(repo, token);
        const response = await axios.post(`https://api.github.com/repos/${repo}/issues`, {
            title,
            body: descriptionWithImage,
            labels: ["cryptoTask"],
        }, {
            headers: {
                Authorization: `token ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });
        issueNumber = response.data.number;
        const task = await prisma.task.create({
            data: {
                title,
                description,
                creatorId: data?.id,
                url: response.data.html_url,
                repo: repo,
                issueId: issueNumber,
                amount: parseFloat(amount) * TOTAL_DECIMALS, // Adjust as needed
                payment_sig: initId, // Adjust as needed
                escrow_seed: escrowSeed, // Adjust as needed
                maker_key: depositId, // Adjust as needed
                task_key: key,
            },
        });
        if (!task) {
            return res.status(500).json({
                message: "Error creating task on db",
            });
        }
        // Check if webhook already exists
        const hooksResponse = await axios.get(`https://api.github.com/repos/${repo}/hooks`, {
            headers: {
                Authorization: `token ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });
        const existingHook = hooksResponse.data.find((hook) => hook.config.url === "https://9a09-2401-4900-1cc5-dbc0-6672-275d-de82-87f6.ngrok-free.app/v1/user/webhooks/github");
        if (!existingHook) {
            await axios.post(`https://api.github.com/repos/${repo}/hooks`, {
                name: "web",
                active: true,
                events: ["pull_request"],
                config: {
                    url: "https://9a09-2401-4900-1cc5-dbc0-6672-275d-de82-87f6.ngrok-free.app/v1/user/webhooks/github",
                    content_type: "json",
                    secret: WEBHOOK_SECRET,
                },
            }, {
                headers: {
                    Authorization: `token ${token}`,
                    Accept: "application/vnd.github.v3+json",
                },
            });
        }
        res.status(200).json({
            message: "Issue and task created successfully",
            issueUrl: response.data?.html_url,
        });
    }
    catch (error) {
        console.error("Error creating issue or task:", error);
        if (issueNumber) {
            // Delete the created issue if webhook setup failed
            await axios.delete(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
                headers: {
                    Authorization: `token ${token}`,
                    Accept: "application/vnd.github.v3+json",
                },
            });
        }
        res.status(500).json({
            message: "Error creating issue or task",
            error: error.response ? error.response.data : error.message,
        });
    }
});
//route to get github user data
router.get("/github-userData", async (req, res) => {
    const token = req.get("Authorization");
    try {
        const data = await getGithubUserData(token);
        res.status(200).send(data);
    }
    catch {
        res.status(500).send({
            msg: "github failed us",
        });
    }
});
//route to get all the tasks
router.get("/tasks", async (req, res) => {
    try {
        const tasks = await prisma.task.findMany();
        const tasksWithStringifiedBigInt = tasks.map(task => ({
            ...task,
            amount: task.amount.toString(),
        }));
        res.status(200).json(tasksWithStringifiedBigInt);
    }
    catch (error) {
        console.error("Error retrieving tasks:", error);
        res.status(500).json({
            message: "Error retrieving tasks",
            error: error.message,
        });
    }
});
router.delete('/tasks/:id', async (req, res) => {
    const taskId = parseInt(req.params.id);
    try {
        const task = await prisma.task.findUnique({
            where: { id: taskId },
        });
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        await prisma.task.delete({
            where: { id: taskId },
        });
        res.status(200).json({ message: 'Task deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
