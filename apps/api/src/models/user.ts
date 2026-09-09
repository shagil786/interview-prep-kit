import mongoose from "mongoose";

export interface UserDoc {
  email: string;
  passwordHash: string;
  createdAt: Date;
}

const userSchema = new mongoose.Schema<UserDoc>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

export const UserModel = mongoose.model<UserDoc>("User", userSchema);
