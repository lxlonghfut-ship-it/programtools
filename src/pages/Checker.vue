<template>
  <div>
    <h2>查错</h2>
    <textarea v-model="prompt" rows="4" cols="80" placeholder="题面"></textarea>
    <textarea v-model="code" rows="10" cols="80" placeholder="代码"></textarea>
    <div>
      <button @click="check">检查并给出建议</button>
    </div>
    <h3>结果</h3>
    <pre>{{result}}</pre>
  </div>
</template>

<script>
export default {
  data() { return { prompt: '', code: '', result: '' } },
  methods: {
    check() { this.result = '（占位）检查结果：可能需要 AI 分析。' }
  }
}
</script>
