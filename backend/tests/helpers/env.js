// Environment shared by the test files. Imported first so it is in place
// before any service module reads process.env.
process.env.INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || "test-internal-secret"
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || "test-key"
process.env.REDIS_URL = process.env.TEST_REDIS_URL || "redis://127.0.0.1:6379/15"
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_dummy"
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "razorpay-test-secret"

export const SECRET = process.env.INTERNAL_SERVICE_SECRET
export const USER_A = "64b7f0c2a1b2c3d4e5f60718"
export const USER_B = "64b7f0c2a1b2c3d4e5f60719"

export const authHeaders = (userId = USER_A) => ({
    "content-type": "application/json",
    "x-user-id": userId,
    "x-internal-secret": SECRET,
})
