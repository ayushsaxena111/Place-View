import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { FiPlay, FiTerminal } from 'react-icons/fi'
import { isRunnable, LANGUAGES, runCode } from '../../lib/codeRunner'
import { DEFAULT_CODE, isTemplate } from '../../lib/codeTemplates'

// Monaco editor with a language picker and, for JavaScript/Python, a Run
// button that executes the code in an isolated Web Worker.
function CodePanel({ language, onLanguageChange, code, onCodeChange, height = 320, compact = false }) {
    const [running, setRunning] = useState(false)
    const [status, setStatus] = useState("")
    const [result, setResult] = useState(null)

    const changeLanguage = (next) => {
        if (next === language) return
        onLanguageChange(next)
        // Swap the starter template, but never throw away the candidate's code.
        if (!code?.trim() || isTemplate(code)) onCodeChange(DEFAULT_CODE[next])
        setResult(null)
    }

    const run = async () => {
        setRunning(true)
        setStatus("Running…")
        setResult(null)
        const output = await runCode({ language, code, onStatus: setStatus })
        setResult(output)
        setRunning(false)
        setStatus("")
    }

    const runnable = isRunnable(language)

    return (
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0B0C10]">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-3 py-2">
                <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Programming language">
                    {LANGUAGES.map((l) => (
                        <button
                            key={l.id}
                            type="button"
                            role="radio"
                            aria-checked={language === l.id}
                            onClick={() => changeLanguage(l.id)}
                            className={`rounded-lg px-2.5 py-1 text-xs transition ${language === l.id
                                ? "bg-white font-semibold text-black"
                                : "text-white/50 hover:bg-white/5 hover:text-white/80"
                                }`}
                        >
                            {l.label}
                        </button>
                    ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {!runnable && (
                        <span className="hidden text-[10px] text-white/40 sm:inline">
                            Run is available for JavaScript and Python
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={run}
                        disabled={!runnable || running}
                        title={runnable ? "Run your code" : "Running this language in the browser is not supported; your code is still evaluated when you submit."}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/90 px-3 py-1 text-xs font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        <FiPlay size={11} /> {running ? "Running" : "Run"}
                    </button>
                </div>
            </div>

            <div style={{ height }}>
                <Editor
                    height="100%"
                    language={language === "cpp" ? "cpp" : language}
                    value={code}
                    onChange={(v) => onCodeChange(v || "")}
                    theme="vs-dark"
                    options={{
                        fontSize: 13,
                        minimap: { enabled: false },
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        padding: { top: 10 },
                        fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                        tabSize: language === "python" ? 4 : 2,
                        automaticLayout: true,
                    }}
                />
            </div>

            {(running || result) && (
                <div className={`border-t border-white/8 bg-black/40 px-3 py-2 font-mono text-xs ${compact ? "max-h-28" : "max-h-40"} overflow-auto`}>
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/35">
                        <FiTerminal size={10} /> Output
                        {result?.durationMs !== undefined && <span className="normal-case tracking-normal">· {result.durationMs} ms</span>}
                    </div>
                    {running && <p className="text-white/50">{status}</p>}
                    {result && (
                        <>
                            {result.stdout && <pre className="whitespace-pre-wrap text-white/85">{result.stdout}</pre>}
                            {result.stderr && <pre className="whitespace-pre-wrap text-amber-300">{result.stderr}</pre>}
                            {result.error && <pre className="whitespace-pre-wrap text-red-300">{result.error}</pre>}
                            {!result.stdout && !result.stderr && !result.error && (
                                <p className="text-white/40">Finished with no output. Use console.log / print to see results.</p>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

export default CodePanel
