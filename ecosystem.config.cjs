module.exports = {
    apps: [
        {
            name: "agent-gateway",
            script: "npx",
            args: "tsx gateway/server.ts",
            cwd: "C:\\Users\\user\\.antigravity\\AnythingllmSkills",
            interpreter: "none",
            // Auto-restart on crash
            autorestart: true,
            max_restarts: 10,
            restart_delay: 3000,
            // Watch for file changes (optional — set to false in production)
            watch: false,
            // Logging
            error_file: "logs/gateway-error.log",
            out_file: "logs/gateway-out.log",
            merge_logs: true,
            log_date_format: "YYYY-MM-DD HH:mm:ss",
            // Environment variables
            env: {
                NODE_ENV: "production",
                PORT: 8787,
                GATEWAY_API_KEY: "",           // ← 填入你的 API key
                HEARTBEAT_INTERVAL_MS: 10000,
                RATE_LIMIT_PER_MINUTE: 60,
                SOUL_THINKING_STRATEGY: "compositional_generalization",
                // === 以下按需填入 ===
                // TELEGRAM_BOT_TOKEN: "",
                // TELEGRAM_WEBHOOK_SECRET: "",
                // LINE_CHANNEL_ACCESS_TOKEN: "",
                // LINE_CHANNEL_SECRET: "",
                // ANYTHINGLLM_API_KEY: "",
                // ANYTHINGLLM_BASE_URL: "http://localhost:3001",
                // OLLAMA_BASE_URL: "http://localhost:11434",
                // OLLAMA_MODEL: "gpt-oss:20b",
            },
        },
    ],
};
