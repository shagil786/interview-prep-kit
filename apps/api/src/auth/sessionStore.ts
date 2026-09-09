import session from "express-session";
import mongoose from "mongoose";

interface SessionRow {
  _id: string;
  session: string;
  expires: Date;
}

/**
 * express-session store backed by the *existing* mongoose connection.
 * (connect-mongodb-session opens its own client, which duplicates
 * credentials/TLS config and stalls requests while disconnected — exactly
 * the failure seen when the Atlas whitelist drops our IP.)
 */
export class MongooseSessionStore extends session.Store {
  private get col(): any {
    return mongoose.connection.collection("sessions");
  }

  constructor() {
    super();
    mongoose.connection.once("connected", () => {
      this.col.createIndex({ expires: 1 }, { expireAfterSeconds: 0 }).catch(() => undefined);
    });
  }

  override get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void): void {
    if (mongoose.connection.readyState !== 1) {
      callback(new Error("database unavailable"));
      return;
    }
    this.col.findOne({ _id: sid }).then((row: { session?: string } | null) => {
      if (!row || typeof row.session !== "string") return callback(null, null);
      try {
        callback(null, JSON.parse(row.session));
      } catch {
        callback(new Error("corrupt session"));
      }
    }, callback);
  }

  override set(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    if (mongoose.connection.readyState !== 1) {
      callback?.(new Error("database unavailable"));
      return;
    }
    const maxAge = sess.cookie?.maxAge ?? 86_400_000;
    this.col.updateOne(
      { _id: sid },
      { $set: { session: JSON.stringify(sess), expires: new Date(Date.now() + maxAge) } },
      { upsert: true },
    ).then(() => callback?.(), (err: unknown) => callback?.(err));
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    if (mongoose.connection.readyState !== 1) {
      callback?.();
      return;
    }
    this.col.deleteOne({ _id: sid }).then(() => callback?.(), (err: unknown) => callback?.(err));
  }

  override touch(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    if (mongoose.connection.readyState !== 1) {
      callback?.();
      return;
    }
    const maxAge = sess.cookie?.maxAge ?? 86_400_000;
    this.col.updateOne(
      { _id: sid },
      { $set: { expires: new Date(Date.now() + maxAge) } },
    ).then(() => callback?.(), (err: unknown) => callback?.(err));
  }
}
