<template>
  <div>
    <h2>题解</h2>
    <textarea v-model="prompt" rows="6" cols="80" placeholder="题面和代码（可选）"></textarea>
    <div>
      <button @click="explain">生成题解</button>
    </div>
    <h3>题解结果</h3>
    <pre>{{result}}</pre>
  </div>
</template>

<script>
export default {
  data() { return { prompt: '', result: '' } },
  methods: { explain() { this.result = '（占位）题解：' + this.prompt } }
}
</script>
