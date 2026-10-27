import fs from "fs"
import path from "path"
import crypto from "crypto"
import multer from "multer"

const uploadPath = "./uploads"

if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true })
}

export const MAX_RESUME_BYTES = 20 * 1024 * 1024

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadPath)
    },
    // Random names: two users uploading "resume.pdf" at the same time must not
    // overwrite each other, and the client-supplied name never touches the path.
    filename: (req, file, cb) => {
        cb(null, `${crypto.randomUUID()}.pdf`)
    }
})

const fileFilter = (req, file, cb) => {
    const isPdfName = path.extname(file.originalname || "").toLowerCase() === ".pdf"
    if (file.mimetype === "application/pdf" || (file.mimetype === "application/octet-stream" && isPdfName)) {
        cb(null, true)
    } else {
        cb(new Error("Only PDF files are allowed"), false)
    }
}

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_RESUME_BYTES,
        files: 1,
    }
})

// Single-file upload with readable 400 errors instead of generic 500s.
export const uploadResumeFile = (req, res, next) => {
    upload.single("resume")(req, res, (error) => {
        if (!error) return next()
        const message = error.code === "LIMIT_FILE_SIZE"
            ? "Resume PDF must be 20 MB or smaller"
            : error.message || "Upload failed"
        return res.status(400).json({ success: false, message })
    })
}

// Verify the file really is a PDF (magic bytes), not just named like one.
export const isPdfFile = (filePath) => {
    let fd
    try {
        fd = fs.openSync(filePath, "r")
        const header = Buffer.alloc(5)
        fs.readSync(fd, header, 0, 5, 0)
        return header.toString("latin1") === "%PDF-"
    } catch {
        return false
    } finally {
        if (fd !== undefined) fs.closeSync(fd)
    }
}

export { upload }
