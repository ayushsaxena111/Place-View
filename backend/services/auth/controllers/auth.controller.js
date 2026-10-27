import crypto from "crypto";

import { getAuth } from "firebase-admin/auth";

import { getFirebaseApp } from "../configs/firebase.js";
import User from "../model/user.model.js";
import redis from "../../../shared/redis/redis.js";
import { isValidObjectId } from "../../../shared/middleware/serviceAuth.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_COINS_PER_OPERATION = 10000;

const sessionPayload = (user) => JSON.stringify({
  userId: user._id,
  name: user.name,
  email: user.email,
  interviewCoin: user.interviewCoin,
});

// Keep the cached session in sync with the database balance without extending
// the session's lifetime.
export const refreshSession = async (sessionId, user) => {
  if (!sessionId || !user) return;
  const raw = await redis.get(`session:${sessionId}`);
  if (!raw) return;

  let session;
  try {
    session = JSON.parse(raw);
  } catch {
    return;
  }
  if (String(session.userId) !== String(user._id)) return;

  const ttl = await redis.ttl(`session:${sessionId}`);
  await redis.set(
    `session:${sessionId}`,
    sessionPayload(user),
    "EX",
    ttl > 0 ? ttl : SESSION_TTL_SECONDS
  );
};

export const parseCoinAmount = (value) => {
  const coins = Number(value);
  if (!Number.isInteger(coins) || coins <= 0 || coins > MAX_COINS_PER_OPERATION) {
    return null;
  }
  return coins;
};

// Atomically deduct coins only if the balance is sufficient.
export const deductCoins = async (userId, coins) => {
  return User.findOneAndUpdate(
    { _id: userId, interviewCoin: { $gte: coins } },
    { $inc: { interviewCoin: -coins } },
    { new: true }
  );
};

const getSession = async (req) => {
  const sessionId = req.cookies?.session;
  if (!sessionId) return { sessionId: null, session: null };
  const raw = await redis.get(`session:${sessionId}`);
  if (!raw) return { sessionId, session: null };
  try {
    return { sessionId, session: JSON.parse(raw) };
  } catch {
    return { sessionId, session: null };
  }
};

export const login = async (req, res) => {

  try {

    const { token } = req.body || {};

    if (!token || typeof token !== "string") {
      return res.status(400).json({ success: false, message: "Firebase ID token is required" });
    }

    const decoded = await getAuth(getFirebaseApp()).verifyIdToken(token);

    let user = await User.findOne({
      firebaseUid: decoded.uid,
    });

    if (!user) {

      user = await User.create({

        firebaseUid: decoded.uid,

        email: decoded.email,

        name: decoded.name

      });

    }

    const sessionId = crypto.randomUUID();

    await redis.set(`session:${sessionId}`, sessionPayload(user), "EX", SESSION_TTL_SECONDS);

    res.cookie("session", sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 1000 * SESSION_TTL_SECONDS,
    });

    return res.json({ success: true, user });

  } catch (error) {
    console.log(error)
    return res.status(401).json({ message: error.message, });

  }

};

export const logout = async (req, res) => {
  try {

    const sessionId = req.cookies?.session;

    if (sessionId) {
      await redis.del(`session:${sessionId}`);
    }

    res.clearCookie("session", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });

    return res.json({
      success: true,
      message: "Logged out successfully",
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

// Browser-facing: spend coins for a client-side feature (e.g. PDF download).
export const useInterviewCoins = async (req, res) => {
  try {
    const { sessionId, session } = await getSession(req);

    if (!session) {
      return res.status(401).json({ success: false, message: "Session expired" });
    }

    const { action } = req.body || {};
    const coins = parseCoinAmount(req.body?.coins);

    if (!coins) {
      return res.status(400).json({
        success: false,
        message: "Coins must be a positive whole number",
      });
    }

    const user = await deductCoins(session.userId, coins);

    if (!user) {
      const existing = await User.findById(session.userId);
      if (!existing) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      return res.status(403).json({
        success: false,
        message: "Not enough interview coins",
        interviewCoin: existing.interviewCoin,
      });
    }

    await refreshSession(sessionId, user);

    return res.status(200).json({
      success: true,
      message: "Interview coins updated successfully",
      action,
      interviewCoin: user.interviewCoin,
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Internal (service-to-service): charge a user for a server-side paid action.
export const internalUseCoins = async (req, res) => {
  try {
    const { userId, sessionId, action } = req.body || {};
    const coins = parseCoinAmount(req.body?.coins);

    if (!isValidObjectId(userId) || !coins) {
      return res.status(400).json({ success: false, message: "Valid userId and coins are required" });
    }

    const user = await deductCoins(userId, coins);

    if (!user) {
      const existing = await User.findById(userId);
      if (!existing) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      return res.status(402).json({
        success: false,
        message: "Not enough interview coins",
        interviewCoin: existing.interviewCoin,
      });
    }

    await refreshSession(sessionId, user);

    return res.status(200).json({ success: true, action, interviewCoin: user.interviewCoin });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Internal (service-to-service): credit coins after a verified purchase or a refund.
// This used to be callable from the browser, which let any user mint coins.
export const addCoins = async (req, res) => {
  try {
    const { userId, sessionId, reason } = req.body || {};
    const coins = parseCoinAmount(req.body?.coins);

    if (!isValidObjectId(userId) || !coins) {
      return res.status(400).json({ success: false, message: "Valid userId and coins are required" });
    }

    const user = await User.findOneAndUpdate(
      { _id: userId },
      { $inc: { interviewCoin: coins } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await refreshSession(sessionId, user);

    return res.status(200).json({
      success: true,
      message: "Coins added successfully",
      reason,
      interviewCoin: user.interviewCoin,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
