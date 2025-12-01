<template>
	<div class="chat-root">
		<h2>对话 (上下文模式)</h2>

		<div class="chat-toolbar">
			<div>
				<label class="label">模型:</label>
				<select v-model="model">
					<option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
				</select>
			</div>
			<div>
				<button @click="clearChat">清空对话</button>
			</div>
		</div>

		<div class="chat-window">
			<div v-for="(m, i) in messages" :key="m.id" :id="'msg-'+m.id" :class="['chat-line', m.role]">
				<div class="chat-meta">{{ m.role === 'user' ? '你' : (m.role === 'assistant' ? 'AI' : m.role) }} <span class="time">{{ m.time || '' }}</span></div>
				<div class="chat-bubble">
					<div class="chat-content" v-html="renderMessage(m)"></div>
					<div class="chat-actions">
						<button @click="copyMessage(m)">复制</button>
					</div>
				</div>
			</div>
		</div>

		<div class="chat-input-area">
			<textarea v-model="inputText" :disabled="loading" placeholder="输入消息，Shift+Enter 换行，Enter 发送" @keydown.enter.exact.prevent="send" @keydown.enter.shift="newline"></textarea>
			<div class="input-actions">
				<button @click="send" :disabled="loading || !inputText.trim()">发送</button>
			</div>
		</div>
	</div>
</template>

<script>
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import renderMathInElement from 'katex/contrib/auto-render'
import 'katex/dist/katex.min.css'

export default {
	data() {
		return {
			inputText: '',
			messages: [],
			loading: false,
			model: 'o4-mini',
			modelOptions: [],
			sessionId: null
		}
	},
	async mounted() {
		// load models from backend
		try {
			const r = await fetch('/api/models')
			if (r.ok) this.modelOptions = await r.json()
		} catch (e) { console.warn('failed to load models', e) }

		// session persistence: load or create sessionId in localStorage
		const existing = localStorage.getItem('chat_session_id')
		this.sessionId = existing || (`s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`)
		localStorage.setItem('chat_session_id', this.sessionId)

		// load saved messages if any
		try {
			const rr = await fetch(`/api/sessions/${this.sessionId}`)
			if (rr.ok) {
				const arr = await rr.json()
				if (Array.isArray(arr) && arr.length) this.messages = arr
			}
		} catch (e) { console.warn('failed to load session', e) }
	},
	methods: {
		makeId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}` },
		renderMessage(m) {
			const raw = m.content || ''
			try {
				const html = marked.parse(raw, { mangle: false, headerIds: false })
				return DOMPurify.sanitize(html)
			} catch (e) { return `<pre>${raw}</pre>` }
		},
		renderMathForMessage(id) {
			try {
				const el = this.$el && this.$el.querySelector && this.$el.querySelector(`#msg-${id}`)
				if (!el) return
				setTimeout(() => {
					try {
						renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false, ignoredTags: ['script','noscript','style','textarea','pre','code'] })
					} catch (e) { console.warn('KaTeX render error for single message', e) }
				}, 40)
			} catch (e) { console.warn('renderMathForMessage error', e) }
		},
		async send() {
			const text = this.inputText && this.inputText.trim()
			if (!text) return
			const now = new Date().toLocaleTimeString()
			const looksLikeLatex = /\\[a-zA-Z]+|\\\(|\\\)|\^\{|\\frac|\\int|\\sum|\\sqrt/.test(text)
			const userContent = (!text.includes('$') && looksLikeLatex) ? `$$${text}$$` : text
			const uid = this.makeId()
			this.messages.push({ id: uid, role: 'user', content: userContent, time: now })
			this.$nextTick(() => { this.renderMathForMessage(uid); const el = this.$el.querySelector('.chat-window'); if (el) el.scrollTop = el.scrollHeight })

			const payload = { messages: this.messages.map(m => ({ role: m.role, content: m.content })), model: this.model, sessionId: this.sessionId }
			this.inputText = ''
			this.loading = true
			try {
				const resp = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
				let data = null
				const ct = resp.headers.get('content-type') || ''
				try { if (ct.includes('application/json')) data = await resp.json(); else { const txt = await resp.text(); data = { rawText: txt } } } catch (e) { try { const txt = await resp.text(); data = { rawText: txt } } catch (e2) { data = null } }
				if (resp.ok) {
					let reply = (data && (data.result || data.rawText)) || (typeof data === 'string' ? data : JSON.stringify(data))
					const replyLooksLikeLatex = typeof reply === 'string' && /\\[a-zA-Z]+|\\\(|\\\)|\^\{|\\frac|\\int|\\sum|\\sqrt/.test(reply)
					if (replyLooksLikeLatex && !reply.includes('$')) reply = `$$${reply}$$`
					const aid = this.makeId()
					this.messages.push({ id: aid, role: 'assistant', content: reply, time: new Date().toLocaleTimeString() })
					this.$nextTick(() => { this.renderMathForMessage(aid); const el = this.$el.querySelector('.chat-window'); if (el) el.scrollTop = el.scrollHeight })
					try { await fetch(`/api/sessions/${this.sessionId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.messages) }) } catch (e) { console.warn('save session failed', e) }
				} else {
					const msg = data && data.detail ? JSON.stringify(data.detail) : `HTTP ${resp.status}`
					const sid = this.makeId(); this.messages.push({ id: sid, role: 'system', content: '调用失败: ' + msg, time: new Date().toLocaleTimeString() })
				}
			} catch (e) {
				this.messages.push({ id: this.makeId(), role: 'system', content: '请求错误: ' + e.toString(), time: new Date().toLocaleTimeString() })
			} finally {
				this.loading = false
				this.$nextTick(() => { const el = this.$el.querySelector('.chat-window'); if (el) el.scrollTop = el.scrollHeight })
			}
		},
		newline(e) { const textarea = e.target; const pos = textarea.selectionStart; this.inputText = this.inputText.slice(0,pos) + '\n' + this.inputText.slice(pos); this.$nextTick(() => { textarea.selectionStart = textarea.selectionEnd = pos + 1 }) },
		copyMessage(m) { const text = m.content || ''; navigator.clipboard.writeText(text).then(()=>{ alert('已复制消息到剪贴板') }).catch(err => { console.error('copy failed', err); alert('复制失败: ' + err) }) },
		clearChat() { this.messages = []; fetch(`/api/sessions/${this.sessionId}/clear`, { method: 'POST' }).catch(()=>{}) }
	}
}
</script>

<style scoped>
.chat-root { display:flex; flex-direction:column; gap:8px }
.chat-toolbar { display:flex; justify-content:space-between; align-items:center }
.label { margin-right:6px; font-weight:600 }
.chat-window { border:1px solid #ddd; padding:12px; height:520px; overflow:auto; background:#f9fbff; border-radius:6px }
.chat-line { margin-bottom:12px }
.chat-meta { font-size:12px; color:#666; margin-bottom:6px }
.chat-bubble { display:flex; justify-content:space-between; gap:8px }
.chat-content { flex:1; white-space:pre-wrap; padding:10px; border-radius:8px; background:#fff }
.chat-line.user .chat-content { background:#e6f7ff }
.chat-line.assistant .chat-content { background:#fff7e6 }
.chat-line.system .chat-content { background:#fff1f0 }
.chat-actions { display:flex; align-items:center }
.chat-input-area { display:flex; gap:8px; align-items:flex-end }
.chat-input-area textarea { flex:1; height:120px; padding:10px; border-radius:8px; border:1px solid #ccc; resize:vertical }
.input-actions button { padding:8px 14px }
</style>
