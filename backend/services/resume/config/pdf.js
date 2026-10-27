import fs from "fs"
import { PDFParse } from "pdf-parse"

const extractText = async (filePath) => {
    const buffer = fs.readFileSync(filePath)

    const pdf = new PDFParse({
        data: buffer
    })

    try {
        const result = await pdf.getText()
        return result.text || ""
    } finally {
        await pdf.destroy().catch(() => {})
    }
}

export default extractText
