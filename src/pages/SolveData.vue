<template>
  <div>
    <h2>解题与造数据</h2>
    <textarea v-model="prompt" rows="6" cols="80" placeholder="题面"></textarea>
    <div>
      <button @click="solve">生成解题代码</button>
      <button @click="generateData">生成数据（cyaron）</button>
    </div>
    <h3>输出</h3>
    <pre>{{result}}</pre>
  </div>
</template>

<script>
export default {
  data() { return { prompt: '', result: '' } },
  methods: {
    solve() { this.result = '（占位）解题代码：' + this.prompt },
    generateData() { this.result = '（占位）生成的数据：[...]' }
  }
}
</script>
