// Build a small, valid one-page PDF containing the given lines of text.
export const makePdf = (lines = []) => {
    const escape = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
    const content = lines.length
        ? "BT /F1 11 Tf 72 740 Td 14 TL " + lines.map((l) => `(${escape(l)}) Tj T*`).join(" ") + " ET"
        : ""
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    let pdf = "%PDF-1.4\n"
    const offsets = []
    objects.forEach((body, i) => {
        offsets.push(Buffer.byteLength(pdf))
        pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
    })
    const xref = Buffer.byteLength(pdf)
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    return Buffer.from(pdf, "latin1")
}
