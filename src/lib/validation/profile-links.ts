import { z } from "zod";
export const profileLinksSchema=z.object({website:z.string().url().optional().or(z.literal("")),spotify:z.string().url().optional().or(z.literal("")),youtube:z.string().url().optional().or(z.literal("")),github:z.string().url().optional().or(z.literal(""))});
export const updateProfileLinksSchema=z.object({links:profileLinksSchema});