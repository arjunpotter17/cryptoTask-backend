import axios from "axios";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
export const getGithubUserData = async (token) => {
    try {
        const result = await axios.get("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        return result.data;
    }
    catch (error) {
        console.log(error.response.data.message);
        throw new Error("Failed to fetch GitHub user data");
    }
};
export const createLabel = async (repo, token) => {
    await axios
        .post(`https://api.github.com/repos/${repo}/labels`, {
        name: "cryptoTask",
        color: "FFA500", // Orange color in hex
    }, {
        headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
        },
    })
        .catch((error) => {
        if (error.response.status !== 422) {
            // 422 Unprocessable Entity means label already exists
            throw error;
        }
    });
};
