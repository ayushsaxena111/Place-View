import { useState } from 'react'
import { AnimatePresence, motion } from "motion/react"
import { FiTerminal, FiX } from 'react-icons/fi'
import CodePanel from './CodePanel'
import { DEFAULT_CODE } from '../../lib/codeTemplates'

// Modal editor to add a code snippet to a verbal or written answer.
function CodeEditor({ onClose, onSubmitCode }) {
  const [lang, setLang] = useState("javascript")
  const [code, setCode] = useState(DEFAULT_CODE.javascript)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className='fixed inset-0 z-50 bg-black/50 backdrop-blur-sm' />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ duration: 0.25 }}
        role="dialog"
        aria-label="Code editor"
        className='fixed inset-x-3 top-4 bottom-4 sm:inset-x-6 sm:top-6 sm:bottom-6 md:inset-x-10 md:top-8 md:bottom-8 z-50 flex flex-col overflow-hidden rounded-2xl bg-[#0E1016] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)]'>

        <div className='flex items-center justify-between px-4 sm:px-5 py-3 border-b border-white/8'>
          <div className='flex items-center gap-3'>
            <FiTerminal className='text-white/50' size={15} />
            <span className='text-sm font-semibold text-white'>Code Editor</span>
          </div>
          <button onClick={onClose} aria-label="Close code editor" className='text-white/35 hover:text-white transition-colors'>
            <FiX size={18} />
          </button>
        </div>

        <div className='flex-1 min-h-0 overflow-auto p-3'>
          <CodePanel
            language={lang}
            onLanguageChange={setLang}
            code={code}
            onCodeChange={setCode}
            height="calc(100vh - 260px)"
          />
        </div>

        <div className='border-t border-white/8 px-4 py-3 flex justify-end'>
          <button
            onClick={() => onSubmitCode?.(code, lang)}
            className='flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-white text-[#0A0A0A] font-semibold hover:bg-white/90 transition-all'>
            Add To Answer
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default CodeEditor
