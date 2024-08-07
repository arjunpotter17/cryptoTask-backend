import axios from "axios";
import { PrismaClient } from "@prisma/client";

export const getGithubUserData = async (token: string) => {
  try {
    const result = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return result.data;
  } catch (error: any) {
    console.log(error.response.data.message);
    throw new Error("Failed to fetch GitHub user data");
  }
};

export const createLabel = async (repo: string, token: string) => {
  await axios
    .post(
      `https://api.github.com/repos/${repo}/labels`,
      {
        name: "cryptoTask",
        color: "ffa500", // Orange color in hex
      },
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    )
    .catch((error) => {
      if (error.response.status !== 422) {
        // 422 Unprocessable Entity means label already exists
        throw error;
      }
    });
};
