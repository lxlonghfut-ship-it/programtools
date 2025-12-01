<template>
  <div id="app">
    <header class="header">
      <h1>Program Tools</h1>
      <nav>
        <router-link to="/">Home</router-link>
        <router-link to="/translate">Translate</router-link>
        <router-link to="/check">Checker</router-link>
        <router-link to="/solution">Solution</router-link>
        <router-link to="/solve">Solve+Data</router-link>
        <router-link to="/chat">Chat</router-link>
      </nav>
    </header>
    <main>
      <router-view />
    </main>
  </div>
</template>

<style>
body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
.header { background: #2b9af3; color: white; padding: 12px 18px; display:flex; align-items:center; justify-content:space-between }
.header nav a { color: white; margin-left:12px; text-decoration:none }
main { padding: 18px }
</style>
