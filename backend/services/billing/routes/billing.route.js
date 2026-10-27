import express from "express"
import { createOrder, verifyPayment } from "../controllers/billing.controller.js"
import { requireUser } from "../../../shared/middleware/serviceAuth.js"

const billingRouter = express.Router()

billingRouter.use(requireUser("billing"))

billingRouter.post("/create",createOrder)
billingRouter.post("/verify",verifyPayment)

export default billingRouter
