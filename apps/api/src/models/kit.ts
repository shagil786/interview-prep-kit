import mongoose from "mongoose";
import type { Kit } from "@prep/core";

export type KitStatus = "generating" | "ready" | "failed";

export interface KitErrorInfo {
  code: string;
  message: string;
}

export interface KitDoc {
  userId: string;
  status: KitStatus;
  error?: KitErrorInfo | null;
  jdHash: string;
  caseInput: { jd: string; company_url: string; days: number };
  /** Canonical Appendix A kit — only present and only written after validateKit passes. */
  kit: Kit | null;
  /** Per-item provenance overlay keyed by item id. */
  overlay: unknown;
  /** Research trail from the pipeline (UI "how this was made"). */
  research: unknown;
  /** Job steps for the progress narrative. */
  job: { steps: unknown[] };
  practice: { card_id: string; confidence: number; at: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

const kitSchema = new mongoose.Schema<KitDoc>(
  {
    userId: { type: String, required: true, index: true },
    status: { type: String, required: true, enum: ["generating", "ready", "failed"], default: "generating" },
    error: { type: { code: String, message: String }, default: null },
    jdHash: { type: String, required: true, index: true },
    caseInput: { jd: String, company_url: String, days: Number },
    kit: { type: mongoose.Schema.Types.Mixed, default: null },
    overlay: { type: mongoose.Schema.Types.Mixed, default: {} },
    research: { type: mongoose.Schema.Types.Mixed, default: {} },
    job: { type: mongoose.Schema.Types.Mixed, default: { steps: [] } },
    practice: {
      type: [
        {
          card_id: String,
          confidence: Number,
          at: Date,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

kitSchema.index({ userId: 1, jdHash: 1 });

export const KitModel = mongoose.model<KitDoc>("Kit", kitSchema);

export function kitToClient(doc: KitDoc): {
  id: string;
  status: KitStatus;
  error: KitErrorInfo | null;
  createdAt: Date;
  updatedAt: Date;
  kit: Kit | null;
  overlay: unknown;
  research: unknown;
  job: { steps: unknown[] };
} {
  return {
    id: (doc as unknown as { _id: unknown })._id?.toString() ?? "",
    status: doc.status,
    error: doc.error ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    kit: doc.kit,
    overlay: doc.overlay,
    research: doc.research,
    job: doc.job,
  };
}
