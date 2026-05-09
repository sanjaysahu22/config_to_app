export default function DocsPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10 text-gray-900 dark:bg-[#0c0c0e] dark:text-gray-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Docs</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">Demo App architecture and upload guide</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
            This page explains how the builder, API, generated backend, and generated tools fit together.
            It also shows the JSON shapes you can upload for feature patching and access scope.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
            <h2 className="text-xl font-bold">Project architecture</h2>
            <div className="mt-4 space-y-4 text-sm leading-6 text-gray-700 dark:text-gray-300">
              <p>
                <strong>Frontend</strong> lives in <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">frontend/app</code> and <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">frontend/components</code>.
                The builder UI is in <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">frontend/components/AppBuilder.tsx</code>.
              </p>
              <p>
                <strong>Backend</strong> lives in <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">backend/src</code>.
                The generation endpoint is in <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">backend/src/server.js</code> and the generated runtime is started through <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">backend/src/services/processManager.ts</code>.
              </p>
              <p>
                <strong>Generated projects</strong> are written to <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">generated-projects/&lt;preview-id&gt;/backend</code>.
                The generated backend entry point is typically <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">src/server.ts</code> inside that folder.
              </p>
              <p>
                <strong>Pipeline</strong> components live in <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">backend/src/engine</code>.
                The AI validator, front-end generator, database generator, and preview builder all run there before the result is returned to the UI.
              </p>
            </div>
          </article>

          <aside className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
            <h2 className="text-xl font-bold">How generation flows</h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-gray-700 dark:text-gray-300">
              <li>1. You edit or upload a config in the builder.</li>
              <li>2. The AI validator checks and corrects the config when enabled.</li>
              <li>3. The generators build frontend, backend, and database output.</li>
              <li>4. The generated backend is launched and polled for readiness.</li>
              <li>5. The builder shows preview, code, and the separate Tools tab.</li>
            </ol>
          </aside>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
            <h2 className="text-xl font-bold">Base config example</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">This is the main JSON shape you generate from.</p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs leading-6 text-gray-100"><code>{`{
  "component": {
    "name": "TaskBoard"
  },
  "locale": "en",
  "metadata": {
    "features": {
      "darkMode": true,
      "multiLanguage": true,
      "auth": true,
      "csvImport": false,
      "userScopedData": true
    }
  },
  "state": [
    {
      "name": "tasks",
      "initial": []
    }
  ],
  "ui": {
    "type": "div",
    "children": []
  }
}`}</code></pre>
          </article>

          <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
            <h2 className="text-xl font-bold">Feature patch JSON</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Upload this in the Tools tab to patch features and metadata.</p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs leading-6 text-gray-100"><code>{`{
  "features": {
    "darkMode": true,
    "multiLanguage": true,
    "auth": true,
    "csvImport": true,
    "userScopedData": true
  },
  "integrationTarget": "backend",
  "metadata": {
    "notes": "Patch applied from the docs example"
  }
}`}</code></pre>
          </article>

          <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
            <h2 className="text-xl font-bold">Access scope JSON</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Use this to define what the user can change after the admin sets role and user ID.</p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs leading-6 text-gray-100"><code>{`{
  "backend": true,
  "frontend": false,
  "database": true
}`}</code></pre>
          </article>

          <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
            <h2 className="text-xl font-bold">CSV note</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
              CSV upload is separate from JSON. The builder expects a real <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">.csv</code> file for the CSV tool.
              The file should have a header row, followed by data rows.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs leading-6 text-gray-100"><code>{`id,title,status
1,Build UI,done
2,Wire API,doing`}</code></pre>
          </article>
        </section>

        <section className="mt-12">
          <h2 className="mb-8 text-2xl font-bold">Example JSONs from public folder</h2>
          <div className="grid gap-6 xl:grid-cols-2">
            <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
              <h3 className="text-lg font-bold">Counter</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Simple interactive counter with increment/decrement buttons.</p>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-3 text-xs leading-5 text-gray-100"><code>{`{
  "component": { "name": "CounterCard" },
  "state": [{ "name": "count", "initial": "0" }],
  "ui": {
    "type": "div",
    "className": "flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-xl shadow-lg",
    "children": [
      { "type": "h3", "className": "text-gray-500 dark:text-gray-400 text-sm font-bold uppercase mb-4", "text": "Interactive Counter" },
      { "type": "div", "className": "text-6xl font-black text-indigo-600 dark:text-indigo-400 mb-8", "text": "{count}" },
      {
        "type": "div",
        "className": "flex gap-4",
        "children": [
          { "type": "button", "className": "w-12 h-12 flex items-center justify-center rounded-full bg-indigo-600 text-white font-bold hover:scale-105", "onClick": "() => setCount(c => c + 1)", "label": "+" }
        ]
      }
    ]
  }
}`}</code></pre>
            </article>

            <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
              <h3 className="text-lg font-bold">Kanban Board</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Frontend-only Kanban board with drag-and-drop task management.</p>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-3 text-xs leading-5 text-gray-100"><code>{`{
  "component": { "name": "TaskBoard" },
  "state": [
    { "name": "tasks", "initial": "[{ id: 1, title: 'Learn Config UI', status: 'done' }]" }
  ],
  "functions": [
    {
      "name": "moveTask",
      "params": [{ "name": "id" }, { "name": "status" }],
      "body": ["setTasks(tasks.map(t => t.id === id ? { ...t, status } : t))"]
    }
  ],
  "ui": {
    "type": "div",
    "className": "p-6 min-h-screen bg-gray-50 dark:bg-gray-900",
    "children": [
      { "type": "h1", "className": "text-2xl font-bold mb-6", "text": "Kanban Board" },
      {
        "type": "div",
        "className": "grid grid-cols-1 md:grid-cols-3 gap-6",
        "children": []
      }
    ]
  }
}`}</code></pre>
            </article>

            <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
              <h3 className="text-lg font-bold">Login Form</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Authentication form with email and password inputs.</p>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-3 text-xs leading-5 text-gray-100"><code>{`{
  "component": { "name": "LoginForm" },
  "state": [
    { "name": "email", "initial": "''" },
    { "name": "password", "initial": "''" },
    { "name": "submitted", "initial": "false" }
  ],
  "ui": {
    "type": "div",
    "className": "min-h-[400px] flex items-center justify-center bg-gray-50 dark:bg-gray-900",
    "children": [
      {
        "type": "div",
        "className": "bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-md",
        "children": [
          { "type": "h2", "className": "text-2xl font-bold mb-6 text-center", "text": "Welcome Back" },
          { "type": "input", "bind": "email", "props": { "type": "email", "placeholder": "you@example.com" } }
        ]
      }
    ]
  }
}`}</code></pre>
            </article>

            <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
              <h3 className="text-lg font-bold">Profile Card</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">User profile card with gradient header and follow button.</p>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-3 text-xs leading-5 text-gray-100"><code>{`{
  "component": { "name": "ProfileCard" },
  "state": [
    { "name": "isFollowing", "initial": "false" },
    { "name": "likes", "initial": "1240" }
  ],
  "ui": {
    "type": "div",
    "className": "max-w-sm mx-auto bg-white dark:bg-gray-800 rounded-3xl shadow-xl overflow-hidden",
    "children": [
      {
        "type": "div",
        "className": "h-32 bg-gradient-to-r from-cyan-500 to-blue-500"
      },
      {
        "type": "div",
        "className": "pt-16 pb-6 px-6 text-center",
        "children": [
          { "type": "h2", "className": "text-xl font-bold", "text": "Felix UI" }
        ]
      }
    ]
  }
}`}</code></pre>
            </article>

            <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
              <h3 className="text-lg font-bold">Weather Dashboard</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Temperature display with city switcher buttons.</p>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-3 text-xs leading-5 text-gray-100"><code>{`{
  "component": { "name": "WeatherDashboard" },
  "state": [
    { "name": "city", "initial": "'San Francisco'" },
    { "name": "temp", "initial": "72" },
    { "name": "condition", "initial": "'Sunny'" }
  ],
  "ui": {
    "type": "div",
    "className": "p-8 max-w-sm mx-auto bg-gradient-to-br from-blue-400 to-purple-500 rounded-3xl text-white text-center",
    "children": [
      { "type": "h2", "className": "text-2xl font-bold mb-2", "text": "{city}" },
      { "type": "div", "className": "text-6xl font-extrabold my-4", "text": "{temp}°F" },
      { "type": "p", "className": "text-xl font-medium mb-8", "text": "{condition}" }
    ]
  }
}`}</code></pre>
            </article>

            <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
              <h3 className="text-lg font-bold">Fullstack Blog</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Blog with Postgres database backend, fetch posts on mount.</p>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-3 text-xs leading-5 text-gray-100"><code>{`{
  "app": {
    "name": "MicroBlogApp",
    "description": "Fullstack blog built with Neon Postgres"
  },
  "entities": {
    "Post": {
      "fields": {
        "id": { "type": "uuid", "unique": true, "default": "gen_random_uuid()" },
        "title": { "type": "string", "required": true },
        "content": { "type": "text", "required": true },
        "author": { "type": "string" },
        "likes": { "type": "integer", "default": "0" }
      }
    }
  },
  "effects": [
    {
      "onMount": true,
      "body": ["fetch('/api/posts').then(res => res.json()).then(setPosts)"]
    }
  ]
}`}</code></pre>
            </article>

            <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#111114]">
              <h3 className="text-lg font-bold">Fullstack Kanban</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Kanban with Postgres backend for persistent task storage and API calls.</p>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-950 p-3 text-xs leading-5 text-gray-100"><code>{`{
  "app": {
    "name": "FullstackKanban",
    "description": "A fullstack Kanban board with a Postgres backend."
  },
  "entities": {
    "Task": {
      "fields": {
        "id": { "type": "uuid", "unique": true, "default": "gen_random_uuid()" },
        "title": { "type": "string", "required": true },
        "status": { "type": "string", "default": "'todo'" },
        "createdAt": { "type": "datetime", "default": "now()" }
      }
    }
  },
  "functions": [
    {
      "name": "addTask",
      "body": ["fetch('/api/tasks', { method: 'POST', body: JSON.stringify({ title: newTaskTitle }) }).then(res => res.json()).then(setNewTaskTitle(''))"]
    }
  ]
}`}</code></pre>
            </article>
          </div>
        </section>      </div>
    </main>
  )
}