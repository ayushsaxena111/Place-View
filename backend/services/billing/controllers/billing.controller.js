import razorpay from "../configs/razorpay.js";
import Billing from "../models/billing.model.js";
import crypto from "crypto"
import { creditCoins } from "../../../shared/utils/coins.js";
import { getSessionIdFromCookie } from "../../../shared/middleware/serviceAuth.js";

export const PLANS = {
    starter: {
        amount: 199,
        interviewCoins: 300,
    },
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0

export const isValidSignature = (orderId, paymentId, signature, secret) => {
    if (!secret || !isNonEmptyString(signature)) return false
    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex")
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export const createOrder = async (req, res) => {
    try {
        const { planId } = req.body || {}
        const userId = req.userId
        const plan = PLANS[planId]

        if (!plan) {
            return res.status(400).json({
                success: false,
                message: "Invalid plan",
            });
        }

        const order = await razorpay.orders.create({
            amount: plan.amount * 100,
            currency: "INR",
            receipt: `receipt_${Date.now()}`,
        })

        await Billing.create({
            userId,
            amount: plan.amount,
            interviewCoins: plan.interviewCoins,
            razorpayOrderId: order.id,
            status: "created",
        })

        return res.status(201).json({
            success: true,
            order,
        })

    } catch (error) {
        console.log(error)
        return res.status(500).json({
            success: false,
            message: "Failed to create order",
        });
    }
}

export const verifyPayment = async (req, res) => {
    const userId = req.userId
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
    } = req.body || {}

    if (![razorpay_order_id, razorpay_payment_id, razorpay_signature].every(isNonEmptyString)) {
        return res.status(400).json({
            success: false,
            message: "razorpay_order_id, razorpay_payment_id and razorpay_signature are required",
        });
    }

    try {
        // Only the user who created the order can verify it.
        const payment = await Billing.findOne({
            razorpayOrderId: razorpay_order_id,
            userId,
        })

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found",
            });
        }

        const valid = isValidSignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            process.env.RAZORPAY_KEY_SECRET
        )

        if (!valid) {
            if (payment.status === "created") {
                payment.status = "failed";
                await payment.save()
            }
            return res.status(400).json({
                success: false,
                message: "Payment verification failed",
            });
        }

        if (payment.status !== "paid") {
            await Billing.updateOne(
                { _id: payment._id, status: { $ne: "paid" } },
                {
                    $set: {
                        status: "paid",
                        razorpayPaymentId: razorpay_payment_id,
                        razorpaySignature: razorpay_signature,
                    },
                }
            )
        }

        // Claim the credit atomically so concurrent verify calls credit once.
        const claimed = await Billing.findOneAndUpdate(
            { _id: payment._id, status: "paid", coinsCredited: { $ne: true } },
            { $set: { coinsCredited: true } },
            { new: true }
        )

        if (!claimed) {
            return res.status(200).json({
                success: true,
                message: "Payment already verified",
                alreadyCredited: true,
            });
        }

        try {
            const credit = await creditCoins({
                userId,
                coins: claimed.interviewCoins,
                sessionId: getSessionIdFromCookie(req.headers.cookie),
                reason: `purchase:${razorpay_order_id}`,
            })

            return res.status(200).json({
                success: true,
                message: "Payment successful",
                coinsAdded: claimed.interviewCoins,
                interviewCoin: credit.interviewCoin,
            });
        } catch (creditError) {
            console.error("Coin credit failed:", creditError.message)
            await Billing.updateOne({ _id: claimed._id }, { $set: { coinsCredited: false } })
            return res.status(502).json({
                success: false,
                retryable: true,
                message: "Payment verified, but coins could not be added yet. Please retry in a moment.",
            });
        }
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Payment verification failed",
        });
    }
}
