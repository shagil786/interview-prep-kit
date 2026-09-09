import { z } from "zod";

// Schema for a batch input row (Appendix B input shape), used by the evaluate CLI.
export const caseSchema = z.object({
  id: z.string().min(1),
  jd: z.string().min(1),
  company_url: z.string().min(1),
  days: z.number().int().min(1).max(60),
});
