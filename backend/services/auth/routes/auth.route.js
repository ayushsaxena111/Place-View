import express from "express";
import { addCoins, internalUseCoins, login, logout, useInterviewCoins } from "../controllers/auth.controller.js";
import { requireInternal } from "../../../shared/middleware/serviceAuth.js";

const authRouter = express.Router();

authRouter.post("/login", login);

authRouter.get("/logout", logout)

// Browser-facing: spend coins for client-side features (PDF download).
authRouter.post("/use-coins", useInterviewCoins);

// Internal only — require INTERNAL_SERVICE_SECRET. The gateway also refuses
// /api/auth/internal/* and strips x-internal-secret from browser requests.
authRouter.post("/internal/use-coins", requireInternal, internalUseCoins);
authRouter.post("/internal/add-coins", requireInternal, addCoins);

// Kept for backwards compatibility, but no longer usable from the browser:
// coins are now credited by the billing service after payment verification.
authRouter.post("/add-coins", requireInternal, addCoins);

export default authRouter;
