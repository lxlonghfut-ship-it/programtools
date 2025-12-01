import express from 'express'
import cors from 'cors'
import axios from 'axios'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// 确保从 server 目录下的 .env 加载（当以项目根为 cwd 启动时）
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

// 调试输出，确认是否读取到 API key（不打印密钥本身）
const DEBUG_LOG = (process.env.DEBUG_LOG === '1' || process.env.DEBUG === 'true')
function debugLog(...args) {
  if (DEBUG_LOG) console.log('[debug]', ...args)
}

if (process.env.YUN_API_KEY) debugLog('YUN_API_KEY loaded: [REDACTED]')
else debugLog('YUN_API_KEY not found in server/.env')

const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '5mb' }))

// sessions storage directory
const SESSIONS_DIR = path.join(__dirname, 'sessions')
async function ensureSessionsDir() {
  try {
    await fs.promises.mkdir(SESSIONS_DIR, { recursive: true })
  } catch (e) {
    // ignore
  }
}

async function saveSession(sessionId, messages) {
  if (!sessionId) return
  try {
    await ensureSessionsDir()
    const file = path.join(SESSIONS_DIR, `${sessionId}.json`)
    await fs.promises.writeFile(file, JSON.stringify(messages || [], null, 2), 'utf8')
  } catch (e) {
    debugLog('saveSession error', e)
  }
}

async function loadSession(sessionId) {
  try {
    const file = path.join(SESSIONS_DIR, `${sessionId}.json`)
    const txt = await fs.promises.readFile(file, 'utf8')
    return JSON.parse(txt)
  } catch (e) {
    return []
  }
}

async function clearSession(sessionId) {
  try {
    const file = path.join(SESSIONS_DIR, `${sessionId}.json`)
    await fs.promises.unlink(file)
  } catch (e) {
    // ignore
  }
}

// 系统提示（从你提供的 desktop 模板转换为 web 后端使用）
const SYSTEM_PROMPT = `你是一个专业的算法题目翻译器，专门修改题目。请将题目准确地翻译成中文，并按照以下要求进行格式化和内容替换：

1. 角色替换规则：
   - 面条老师 → 大魏
   - 青橙老师 → 潇潇
   - 姜饼老师 → 大马
   - 雪球老师 → 卡卡
   - 麋鹿老师 → 妙妙
   - Takahashi → kunkka
   - Aoki → Elsa
   - 小Z → 聪聪
   - 其他老师角色 → 根据性别和特征选择岐岐或麦麦或妙妙或璨璨

2. 内容处理：
   - 完全去掉题干中所有"核桃"相关的内容和描述
   - 将题目中的 atcoder 修改为 acjudge
   - 保持原题目的数学逻辑和算法要求不变
   - 保持题目的难度和复杂度不变
   - 保持题干内容不变, 不要增加过多的解释
   - 无需给出复杂度等信息
   - 无需给出解决此题的提示

3. 公式格式：
   - 所有数学公式必须使用LaTeX格式
   - 行内公式使用单个 $ 包裹, 尽量使用 ($...$) 包裹, 只有长公式的时候才使用 ($$...$$)包裹
   - 将原有的 \\( \\) \\[ \\] 等格式统一转换为 $ 格式, 

  - **严格要求**：模型在输出中必须使用美元符号来包裹公式（行内使用 $...$，块级使用 $$...$$）。如果输出中没有使用美元符号，请仍然以美元符号形式返回公式；不要删除或转义美元符号。

4. 输出格式如下:

    ## 题目背景

    [根据题目描述给出一个有趣的题目背景，去掉核桃相关内容]

    ## 题目描述

    [题目描述的翻译，替换角色并去掉核桃相关内容]
    题目中的公式块要用 \\$ 表达（行内用单个 \\$，块级用两个 \\$）

    ## 输入格式

    [输入格式]

    ## 输出格式

    [输出格式]

    ## 样例

    \`\`\`input1
    [样例输入]
    \`\`\`

    \`\`\`output1
    [样例输出]
    \`\`\`

    \`\`\`input2
    [样例输入]
    \`\`\`

    \`\`\`output2
    [样例输出]
    \`\`\`

    ### 样例解释

    [样例解释]

    ## 数据范围
    [数据范围的翻译]


输出格式请遵循 README 中的翻译模板（包含题目背景、题目描述、输入格式、输出格式、样例、样例解释、数据范围等）。保留算法复杂度表达如 $O(n)$ 等。
`

// 后端对模型返回的文本做保守的 LaTeX 包裹修正：
function wrapLatexIfNeeded(text) {
  if (!text || typeof text !== 'string') return text

  // 暂时抽离三重反引号 code block，避免误包裹
  const codeBlocks = []
  const placeholder = '___CODEBLOCK_'
  text = text.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m)
    return placeholder + (codeBlocks.length - 1) + '___'
  })

  // 如果文本中根本没有美元符号，且包含常见 LaTeX 控制序列，则将整体包为块级公式
  if (!text.includes('$')) {
    const latexPattern = /\\(?:frac|int|sum|sqrt|left|right|begin|end|pi|alpha|beta|gamma)\b|\^\{|\\\(|\\\)/
    if (latexPattern.test(text)) {
      text = `$$\n${text}\n$$`
    }
  }

  // 恢复 code blocks
  text = text.replace(new RegExp(placeholder + '(\\d+)___', 'g'), (_, idx) => codeBlocks[Number(idx)] || '')
  return text
}

app.post('/api/translate', async (req, res) => {
  try {
    const { text, model } = req.body
    if (!text) return res.status(400).json({ error: '缺少 text 字段' })

    const apiUrl = process.env.YUN_API_URL || 'https://yunwu.ai/v1/chat/completions'
    const apiKey = process.env.YUN_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'Server: missing YUN_API_KEY in environment' })

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text }
    ]

    const payload = {
      model: model || 'o4-mini',
      messages,
      temperature: 0.1,
      max_tokens: 32767
    }

    const resp = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 600000
    })

    // 兼容 yunwu.ai / chat completions 返回结构
    const data = resp.data
    let content = ''
    try {
      if (data.choices && data.choices[0] && data.choices[0].message) {
        content = data.choices[0].message.content
      } else if (data.choices && data.choices[0] && data.choices[0].text) {
        content = data.choices[0].text
      } else if (data.data && data.data[0] && data.data[0].text) {
        content = data.data[0].text
      } else {
        content = JSON.stringify(data)
      }
    } catch (e) {
      content = JSON.stringify(data)
    }

    // 做一些简单清理（保留服务端原始返回）
    try {
      const fixed = wrapLatexIfNeeded(content)
      return res.json({ result: fixed })
    } catch (e) {
      return res.json({ result: content })
    }
  } catch (err) {
    console.error('Translate error:', err?.response?.data || err.message || err)
    const message = err?.response?.data || err.message || 'unknown error'
    return res.status(500).json({ error: 'Translation failed', detail: message })
  }
})

// 简单的上下文聊天接口：接收 messages 数组并转发到 Yun API
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model, sessionId } = req.body
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '缺少 messages 数组' })
    }

    // Debug: log basic info about incoming chat requests (do not log secrets)
    try {
      debugLog('[/api/chat] received messages count:', messages.length, 'model:', model)
      // log roles summary for quick inspection
      const roles = messages.map(m => m.role).slice(0, 20)
      debugLog('[/api/chat] roles:', roles)
    } catch (e) {
      // ignore logging errors
    }

    const apiUrl = process.env.YUN_API_URL || 'https://yunwu.ai/v1/chat/completions'
    const apiKey = process.env.YUN_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'Server: missing YUN_API_KEY in environment' })

    const payload = {
      model: model || 'o4-mini',
      messages,
      temperature: 0.2,
      max_tokens: 2048
    }

    const resp = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 600000
    })

    const data = resp.data
    let content = ''
    try {
      if (data.choices && data.choices[0] && data.choices[0].message) {
        content = data.choices[0].message.content
      } else if (data.choices && data.choices[0] && data.choices[0].text) {
        content = data.choices[0].text
      } else if (data.data && data.data[0] && data.data[0].text) {
        content = data.data[0].text
      } else {
        content = JSON.stringify(data)
      }
    } catch (e) {
      content = JSON.stringify(data)
    }

    // Debug: log a short preview of the assistant content returned
    try {
      const preview = (typeof content === 'string' ? content : JSON.stringify(content)).slice(0, 400)
      debugLog('[/api/chat] assistant content preview:', preview.replace(/\n/g, ' '))
    } catch (e) {
      // ignore
    }

    try {
      const fixed = wrapLatexIfNeeded(content)
      // persist session if provided
      if (sessionId) {
        try { await saveSession(sessionId, messages) } catch (e) { debugLog('save session failed', e) }
      }
      return res.json({ result: fixed })
    } catch (e) {
      return res.json({ result: content })
    }
  } catch (err) {
    console.error('Chat error:', err?.response?.data || err.message || err)
    const message = err?.response?.data || err.message || 'unknown error'
    return res.status(500).json({ error: 'Chat failed', detail: message })
  }
})

app.listen(port, () => {
  console.log(`Translation server listening at http://localhost:${port}`)
})

// models endpoint: serve models JSON from frontend config
app.get('/api/models', async (req, res) => {
  try {
    const file = path.join(__dirname, 'models.json')
    const txt = await fs.promises.readFile(file, 'utf8')
    const data = JSON.parse(txt)
    return res.json(data)
  } catch (e) {
    debugLog('failed to read server/models.json', e)
    return res.status(500).json([])
  }
})

// session management endpoints
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const id = req.params.id
    const data = await loadSession(id)
    return res.json(data)
  } catch (e) {
    return res.status(500).json([])
  }
})

app.post('/api/sessions/:id', async (req, res) => {
  try {
    const id = req.params.id
    const messages = req.body || []
    await saveSession(id, messages)
    return res.json({ ok: true })
  } catch (e) {
    return res.status(500).json({ ok: false })
  }
})

app.post('/api/sessions/:id/clear', async (req, res) => {
  try {
    const id = req.params.id
    await clearSession(id)
    return res.json({ ok: true })
  } catch (e) {
    return res.status(500).json({ ok: false })
  }
})
