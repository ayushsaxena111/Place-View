import { typeInfo } from '../../lib/questionTypes'

function QuestionTypeBadge({ type, size = "md" }) {
    const info = typeInfo(type)
    const Icon = info.icon
    const pad = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide ${pad} ${info.className}`}>
            <Icon size={size === "sm" ? 10 : 12} />
            {info.label}
        </span>
    )
}

export default QuestionTypeBadge
