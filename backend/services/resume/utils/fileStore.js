import fs from "fs"
import mongoose from "mongoose"

// Original resume PDFs are kept in GridFS so they survive restarts and are
// served only to their owner.
const BUCKET = "resumeFiles"

const bucket = () => {
    if (!mongoose.connection?.db) throw new Error("Database is not connected")
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET })
}

export const saveResumeFile = (filePath, { fileName, userId }) =>
    new Promise((resolve, reject) => {
        const upload = bucket().openUploadStream(fileName || "resume.pdf", {
            metadata: { userId: new mongoose.Types.ObjectId(userId), contentType: "application/pdf" },
        })
        fs.createReadStream(filePath)
            .on("error", reject)
            .pipe(upload)
            .on("error", reject)
            .on("finish", () => resolve(upload.id))
    })

export const openResumeFile = (fileId) => bucket().openDownloadStream(new mongoose.Types.ObjectId(fileId))

export const deleteResumeFile = async (fileId) => {
    if (!fileId) return
    try {
        await bucket().delete(new mongoose.Types.ObjectId(fileId))
    } catch (error) {
        // Missing file: nothing left to delete.
        if (!/FileNotFound|File not found/i.test(error.message)) throw error
    }
}
