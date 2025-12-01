<template>
  <div>
    <h2>翻译</h2>
    <textarea v-model="prompt" rows="6" cols="80" placeholder="在此输入题面或文本"></textarea>
    <div style="display:flex; gap:8px; align-items:center">
      <label style="font-weight:600">模型:</label>
      <select v-model="model">
        <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <button @click="translate" :disabled="loading">翻译为中文 (调用 AI)</button>
      <button @click="copyMarkdown" style="margin-left:8px">复制 Markdown</button>
    </div>
    <h3>结果</h3>
    <div style="display:flex; gap:16px; align-items:flex-start">
      <div style="flex:1">
        <h4>原始 Markdown</h4>
        <pre style="white-space:pre-wrap; max-height:480px; overflow:auto; background:#fafafa; padding:12px; border-radius:6px">{{result}}</pre>
      </div>
      <div style="flex:1">
        <h4>渲染预览</h4>
        <div ref="preview" class="md-preview" v-html="renderedHtml"></div>
      </div>
    </div>
  </div>
</template>


<script>
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { nextTick } from 'vue'
import renderMathInElement from 'katex/contrib/auto-render'
import 'katex/dist/katex.min.css'
// model configuration now served from backend

export default {
  data() { return { prompt: '', result: '', loading: false, model: 'o4-mini', modelOptions: [] } },
  async mounted() {
    try {
      const r = await fetch('/api/models')
      if (r.ok) this.modelOptions = await r.json()
    } catch (e) { console.warn('failed to load models', e) }
  },

  computed: {
    renderedHtml() {
      try {
        const raw = this.result || ''
        const pre = this.preprocessMarkdown(raw)
        const html = marked.parse(pre)
        return DOMPurify.sanitize(html)
      } catch (e) {
        return '<pre>无法渲染 Markdown</pre>'
      }
    }
    ,
    modelOptions() {
      return this.modelOptions || []
    }
  },
  methods: {
    preprocessMarkdown(raw) {
      let s = raw

      // 把 ```inputN ... ``` 转换为带标签的 HTML 区块
      s = s.replace(/```\s*input(\d+)\s*\n([\s\S]*?)```/g, (m, n, code) => {
        // escape HTML inside code block to keep as preformatted text
        const esc = code.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return `\n<div class="sample-block">\n<div class="sample-label">输入样例${n}</div>\n<pre class="sample-code">${esc}</pre>\n</div>\n`
      })

      // 把 ```outputN ... ``` 转换为带标签的 HTML 区块
      s = s.replace(/```\s*output(\d+)\s*\n([\s\S]*?)```/g, (m, n, code) => {
        const esc = code.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return `\n<div class="sample-block">\n<div class="sample-label">输出样例${n}</div>\n<pre class="sample-code">${esc}</pre>\n</div>\n`
      })

      // 将 $$...$$ 包裹为公式块，以便 KaTeX 渲染后我们能样式化
      s = s.replace(/\$\$([\s\S]*?)\$\$/g, (m, content) => {
        return `\n<div class="math-block">\n$$${content}$$\n</div>\n`
      })

      return s
    },
    async translate() {
      if (!this.prompt.trim()) { this.result = '请输入要翻译的题面或文本。'; return }
      this.loading = true
      this.result = '正在翻译，请稍候...'
      try {
        const resp = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: this.prompt, model: this.model })
        })

        const ct = resp.headers.get('content-type') || ''
        let data = null
        if (ct.includes('application/json')) {
          try { data = await resp.json() } catch (e) { data = null }
        } else {
          try { const txt = await resp.text(); data = { rawText: txt } } catch (e) { data = null }
        }

        if (resp.ok) {
          if (data && data.result) this.result = data.result
          else if (data && data.rawText) this.result = data.rawText || '(空响应)'
          else this.result = '(无返回内容)'
        } else {
          if (data) this.result = `翻译失败: ${JSON.stringify(data)}`
          else this.result = `翻译失败: HTTP ${resp.status}`
        }
      } catch (e) {
        this.result = '请求错误: ' + e.toString()
      } finally {
        this.loading = false
      }
    },

    copyMarkdown() {
      const text = this.result || ''
      navigator.clipboard.writeText(text).then(() => {
        this.$root.$emit && this.$root.$emit('message', '已复制 Markdown 到剪贴板')
      }).catch(err => {
        console.error('copy failed', err)
        alert('复制失败: ' + err)
      })
    }
  },

  watch: {
    result: async function() {
      // wait for DOM update then render math in preview
      await nextTick()
      try {
        const previewEl = this.$refs.preview
        if (previewEl) {
          renderMathInElement(previewEl, {
            // delimiters for block and inline math
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false }
            ],
            throwOnError: false,
            ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
          })
        }
      } catch (e) {
        // silently ignore render errors
        console.warn('KaTeX render error', e)
      }
    }
  }
}
</script>

<style scoped>
button[disabled] { opacity: 0.6 }
.md-preview { border: 1px solid #e6e6e6; padding: 12px; border-radius: 6px; background: #fff }
.sample-block { border: 1px solid #dcdcdc; border-radius:6px; padding:8px; margin-bottom:12px; background:#fbfbfb }
.sample-label { font-weight:700; margin-bottom:6px }
.sample-code { background:#fff; padding:8px; border-radius:4px; white-space:pre-wrap; overflow:auto }
.math-block { border-left:4px solid #2b9af3; padding:8px 12px; background:#f6fbff; margin:12px 0 }
</style>

