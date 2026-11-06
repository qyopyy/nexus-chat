import { z } from "zod";
export const usernameSchema=z.string().trim().min(1).max(30).regex(/^[a-zA-Z0-9._-]+$/);